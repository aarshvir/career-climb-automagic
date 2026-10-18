BEGIN;

ALTER TABLE jobvance_private.loop_billing_cancel_requests DROP CONSTRAINT loop_billing_cancel_requests_state_check;
ALTER TABLE jobvance_private.loop_billing_cancel_requests ADD CONSTRAINT loop_billing_cancel_requests_state_check CHECK(state IN('creating','confirmed','uncertain','retryable'));

-- A refund revokes Jobvance access; it is not proof that Dodo stopped an
-- existing mandate or a pending/recovery payment. Protect new provider checkout
-- creation atomically, including retry of a definitively failed old request.
CREATE FUNCTION jobvance_private.guard_loop_checkout_provider_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.state<>'creating' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.state='creating' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||NEW.user_id::text,0));
  IF EXISTS(
    SELECT 1 FROM jobvance_private.loop_subscriptions s
    WHERE s.user_id=NEW.user_id AND s.mode=NEW.mode
      AND (s.status IN('pending','on_hold','paused','past_due') OR (s.status='active' AND NOT s.cancel_at_period_end))
  ) THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_EXISTS'; END IF;
  -- Existing paid-through protection for non-revoked access remains in the
  -- authenticated checkout RPC. A revoked active subscription may be replaced
  -- only after its future renewal was explicitly confirmed cancelled.
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.guard_loop_checkout_provider_state() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER job_loop_billing_provider_state_guard
  BEFORE INSERT OR UPDATE OF state ON jobvance_private.loop_billing_orders
  FOR EACH ROW EXECUTE FUNCTION jobvance_private.guard_loop_checkout_provider_state();

-- An exact unpaid request remains recoverable. Once that checkout has created
-- a bound subscription, its old URL must never be returned as an unpaid retry.
CREATE OR REPLACE FUNCTION public.job_loop_billing_checkout_claim(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;
BEGIN
  IF p_user IS NULL OR p_auth_session IS NULL OR p_request IS NULL OR p_mode IS NULL OR p_mode NOT IN('test','live')
    OR p_plan IS NULL OR p_plan NOT IN('weekly','three_weekly','daily') OR p_product IS NULL OR p_product !~ '^pdt_[A-Za-z0-9_-]{1,100}$' THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF o.auth_session IS DISTINCT FROM p_auth_session OR o.generation IS DISTINCT FROM p_generation OR o.mode<>p_mode OR o.plan<>p_plan OR o.product_id<>p_product THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
    IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions s WHERE s.user_id=p_user AND s.request_id=p_request AND s.mode=p_mode) THEN RAISE EXCEPTION 'LOOP_CHECKOUT_FINISHED'; END IF;
    IF o.state='failed' THEN
      IF p_mode='live' THEN PERFORM public.job_loop_billing_assert_capacity(p_user); END IF;
      UPDATE jobvance_private.loop_billing_orders SET state='creating',capacity_until=CASE WHEN p_mode='live' THEN now()+interval '96 hours' ELSE NULL END WHERE user_id=p_user AND request_id=p_request RETURNING * INTO o;
      RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',true);
    END IF;
    RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',false);
  END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode=p_mode AND NOT revoked
    AND ((status IN('active','cancelled') AND valid_until>now()) OR status IN('pending','on_hold','paused','past_due'))) THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_EXISTS'; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND state IN('creating','uncertain')) THEN RAISE EXCEPTION 'LOOP_CHECKOUT_PENDING'; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND state='ready' AND (capacity_until>now() OR created_at>now()-interval '24 hours')
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions s WHERE s.user_id=p_user AND s.request_id=loop_billing_orders.request_id)) THEN RAISE EXCEPTION 'LOOP_CHECKOUT_PENDING'; END IF;
  IF p_mode='live' THEN PERFORM public.job_loop_billing_assert_capacity(p_user); END IF;
  INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,auth_session,generation,state,capacity_until)
    VALUES(p_user,p_request,p_mode,p_plan,p_product,p_auth_session,p_generation,'creating',CASE WHEN p_mode='live' THEN now()+interval '96 hours' ELSE NULL END) RETURNING * INTO o;
  RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',true);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_billing_checkout_claim(uuid,uuid,bigint,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_checkout_claim(uuid,uuid,bigint,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.job_loop_billing_status(p_user uuid,p_auth_session uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions; o jobvance_private.loop_billing_orders; c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_user IS NULL OR p_auth_session IS NULL OR p_mode IS NULL OR p_mode NOT IN('test','live') OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  -- Expose any refunded mandate/recovery charge that still needs cancellation,
  -- then effective paid access, followed by the remaining provider history.
  SELECT * INTO s FROM jobvance_private.loop_subscriptions b WHERE user_id=p_user AND mode=p_mode
    ORDER BY CASE WHEN revoked AND (status IN('pending','on_hold','paused','past_due') OR (status='active' AND NOT cancel_at_period_end)) THEN 0
      WHEN NOT revoked
      AND (((status='active' OR (status='cancelled' AND cancel_at_period_end)) AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
      AND (period_start IS NULL OR period_start<=now())
      AND (generation IS NULL OR generation=COALESCE(current_generation,0))
      AND (generation IS NULL OR EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=b.mode AND p.subscription_id=b.subscription_id AND NOT p.revoked AND p.starts_at<=now() AND (p.ends_at>now() OR b.status='past_due')))
      THEN 1 WHEN status IN('pending','on_hold','paused','past_due') OR (status='active' AND NOT cancel_at_period_end) THEN 2
      WHEN NOT revoked AND status IN('pending','active','on_hold','paused','past_due') THEN 3 ELSE 4 END,
      CASE plan WHEN 'daily' THEN 3 WHEN 'three_weekly' THEN 2 ELSE 1 END DESC,updated_at DESC,subscription_id LIMIT 1;
  -- A consumed checkout cannot be resumed as though its payment is unknown.
  -- Keep unrelated, genuinely unbound checkout recovery visible as before.
  SELECT * INTO o FROM jobvance_private.loop_billing_orders b WHERE user_id=p_user AND mode=p_mode AND auth_session=p_auth_session AND generation=COALESCE(current_generation,0)
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions paid WHERE paid.user_id=b.user_id AND paid.request_id=b.request_id AND paid.mode=b.mode)
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND auth_session=p_auth_session AND mode=p_mode AND generation=COALESCE(current_generation,0) AND subscription_id=s.subscription_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('generation',COALESCE(current_generation,0),'entitlement',public.job_loop_billing_entitlement(p_user),
    'fulfillmentPending',EXISTS(SELECT 1 FROM jobvance_private.loop_billing_pending_fulfillment WHERE user_id=p_user AND mode=p_mode AND NOT resolved),
    'subscription',CASE WHEN s.subscription_id IS NULL THEN NULL ELSE jsonb_build_object('subscriptionId',s.subscription_id,'plan',s.plan,'status',s.status,'validUntil',s.valid_until,'periodStart',s.period_start,'graceUntil',s.grace_until,'cancelAtPeriodEnd',s.cancel_at_period_end,'revoked',s.revoked,'revision',s.revision) END,
    'checkout',CASE WHEN o.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',o.request_id,'plan',o.plan,'status',o.state,'checkoutUrl',o.checkout_url,'createdAt',o.created_at,'expiresAt',o.created_at+interval '24 hours','reservationUntil',o.capacity_until) END,
    'cancelRequest',CASE WHEN c.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',c.request_id,'subscriptionId',c.subscription_id,'status',CASE WHEN c.state='retryable' THEN 'creating' ELSE c.state END,'version',c.subscription_revision,'generation',c.generation) END);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_billing_status(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_status(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.job_loop_billing_cancel_claim(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_subscription text,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions; c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_user IS NULL OR p_auth_session IS NULL OR p_request IS NULL OR p_generation IS NULL OR p_generation<0 OR p_mode IS NULL OR p_mode NOT IN('test','live') THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  IF p_generation<>COALESCE(current_generation,0) THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription AND user_id=p_user AND mode=p_mode FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_NOT_FOUND'; END IF;
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF c.auth_session<>p_auth_session OR c.generation<>p_generation OR c.mode<>p_mode OR c.subscription_id<>p_subscription OR c.subscription_revision IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
    IF c.state='retryable' THEN
      UPDATE jobvance_private.loop_billing_cancel_requests SET state='creating' WHERE user_id=p_user AND request_id=p_request;
      RETURN jsonb_build_object('creationClaimAcquired',true,'subscriptionId',p_subscription,'status','creating');
    END IF;
    RETURN jsonb_build_object('creationClaimAcquired',false,'subscriptionId',p_subscription,'status',c.state);
  END IF;
  IF p_version IS NULL OR p_version<>s.revision THEN RAISE EXCEPTION 'LOOP_BILLING_SUBSCRIPTION_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_cancel_requests WHERE subscription_id=p_subscription AND state IN('creating','uncertain','retryable')) THEN
    IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_cancel_requests WHERE subscription_id=p_subscription AND auth_session=p_auth_session AND generation=p_generation AND state IN('creating','uncertain','retryable')) THEN RAISE EXCEPTION 'LOOP_CANCELLATION_PENDING'; END IF;
    -- A fresh authenticated session may explicitly inspect/reconcile an older
    -- ambiguous cancellation. Its new intent never owns permission to PATCH.
    INSERT INTO jobvance_private.loop_billing_cancel_requests(user_id,request_id,auth_session,generation,subscription_revision,mode,subscription_id,state)
      VALUES(p_user,p_request,p_auth_session,p_generation,p_version,p_mode,p_subscription,'uncertain');
    RETURN jsonb_build_object('creationClaimAcquired',false,'subscriptionId',p_subscription,'status','uncertain');
  END IF;
  INSERT INTO jobvance_private.loop_billing_cancel_requests(user_id,request_id,auth_session,generation,subscription_revision,mode,subscription_id,state)
    VALUES(p_user,p_request,p_auth_session,p_generation,p_version,p_mode,p_subscription,CASE WHEN s.cancel_at_period_end OR s.status IN('cancelled','failed','expired') THEN 'confirmed' ELSE 'creating' END) RETURNING * INTO c;
  RETURN jsonb_build_object('creationClaimAcquired',c.state='creating','subscriptionId',p_subscription,'status',c.state);
END $$;

-- Called only by the trusted handler that acquired this exact original claim
-- and failed before attempting PATCH. Ambiguous provider writes never release.
CREATE FUNCTION public.job_loop_billing_cancel_retryable(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_subscription text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  IF p_generation IS NULL OR p_generation<>COALESCE(current_generation,0) THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR c.auth_session<>p_auth_session OR c.generation<>p_generation OR c.mode IS DISTINCT FROM p_mode OR c.subscription_id IS DISTINCT FROM p_subscription THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF c.state<>'confirmed' THEN UPDATE jobvance_private.loop_billing_cancel_requests SET state='retryable' WHERE user_id=p_user AND request_id=p_request RETURNING * INTO c; END IF;
  RETURN jsonb_build_object('subscriptionId',p_subscription,'status',c.state);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_billing_cancel_finalize(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_subscription text,p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_confirmed IS NULL OR p_auth_session IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  IF p_generation IS NULL OR p_generation<>COALESCE(current_generation,0) THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR c.auth_session<>p_auth_session OR c.generation<>p_generation OR c.mode IS DISTINCT FROM p_mode OR c.subscription_id IS DISTINCT FROM p_subscription THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  UPDATE jobvance_private.loop_billing_cancel_requests SET state=CASE WHEN p_confirmed OR c.state='confirmed' THEN 'confirmed' WHEN c.state='retryable' THEN 'retryable' ELSE 'uncertain' END WHERE user_id=p_user AND request_id=p_request RETURNING * INTO c;
  IF p_confirmed THEN UPDATE jobvance_private.loop_subscriptions SET cancel_at_period_end=true,revision=revision+1,updated_at=now() WHERE subscription_id=p_subscription AND user_id=p_user AND mode=p_mode AND NOT cancel_at_period_end; END IF;
  RETURN jsonb_build_object('subscriptionId',p_subscription,'status',c.state);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_billing_cancel_claim(uuid,uuid,bigint,uuid,text,text,bigint),public.job_loop_billing_cancel_retryable(uuid,uuid,bigint,uuid,text,text),public.job_loop_billing_cancel_finalize(uuid,uuid,bigint,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_cancel_claim(uuid,uuid,bigint,uuid,text,text,bigint),public.job_loop_billing_cancel_retryable(uuid,uuid,bigint,uuid,text,text),public.job_loop_billing_cancel_finalize(uuid,uuid,bigint,uuid,text,text,boolean) TO service_role;
COMMIT;
