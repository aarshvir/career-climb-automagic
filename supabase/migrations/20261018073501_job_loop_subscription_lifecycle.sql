BEGIN;

-- Financial state is separate from CV/Loop records. Erasing career data cannot
-- cancel a provider charge; it also must never reactivate a workspace or pilot.
ALTER TABLE jobvance_private.loop_billing_orders
  ADD COLUMN auth_session uuid,
  ADD COLUMN generation bigint CHECK(generation>=0),
  ADD COLUMN capacity_until timestamptz CHECK(capacity_until IS NULL OR isfinite(capacity_until)),
  ADD COLUMN state text NOT NULL DEFAULT 'ready' CHECK(state IN('creating','ready','failed','uncertain'));
ALTER TABLE jobvance_private.loop_subscriptions
  ADD COLUMN generation bigint CHECK(generation>=0),
  ADD COLUMN period_start timestamptz,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN grace_until timestamptz CHECK(grace_until IS NULL OR isfinite(grace_until)),
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE jobvance_private.loop_billing_events ADD COLUMN authority jsonb, ADD COLUMN payload_hash text;

CREATE TABLE jobvance_private.loop_subscription_periods (
  mode text NOT NULL CHECK(mode IN('test','live')),
  payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9_-]{1,100}$'),
  subscription_id text NOT NULL REFERENCES jobvance_private.loop_subscriptions(subscription_id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000000),
  revoked boolean NOT NULL DEFAULT false,
  PRIMARY KEY(mode,payment_id), CHECK(isfinite(starts_at) AND isfinite(ends_at) AND starts_at<ends_at AND ends_at<=starts_at+interval '35 days')
);
CREATE TABLE jobvance_private.loop_billing_cancel_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, auth_session uuid NOT NULL, generation bigint NOT NULL CHECK(generation>=0),
  subscription_revision bigint NOT NULL CHECK(subscription_revision>0),
  mode text NOT NULL CHECK(mode IN('test','live')),
  subscription_id text NOT NULL REFERENCES jobvance_private.loop_subscriptions(subscription_id) ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN('creating','confirmed','uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);
CREATE TABLE jobvance_private.loop_billing_pending_fulfillment (
  mode text NOT NULL CHECK(mode IN('test','live')),event_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id text NOT NULL,payload_hash text NOT NULL,authority jsonb NOT NULL,
  reason text NOT NULL CHECK(reason='LOOP_PILOT_FULL'),resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(mode,event_id)
);
ALTER TABLE jobvance_private.loop_subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_billing_cancel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_billing_pending_fulfillment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_subscription_periods,jobvance_private.loop_billing_cancel_requests,jobvance_private.loop_billing_pending_fulfillment FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.job_loop_billing_assert_session(p_user uuid,p_auth_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR p_auth_session IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_SESSION_STALE'; END IF;
  PERFORM 1 FROM auth.sessions WHERE id=p_auth_session AND user_id=p_user AND (not_after IS NULL OR not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_SESSION_STALE'; END IF;
END $$;

CREATE FUNCTION public.job_loop_billing_assert_capacity(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owners uuid[];
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(8190710);
  SELECT array_agg(DISTINCT id) INTO owners FROM (
    SELECT user_id id FROM public.job_loop_pilot_users WHERE active
    UNION SELECT b.user_id FROM jobvance_private.loop_subscriptions b WHERE mode='live' AND NOT revoked
      AND ((status IN('active','cancelled') AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
      AND (generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle l WHERE l.user_id=b.user_id AND l.generation=b.generation AND l.state='active'))
    UNION SELECT user_id FROM jobvance_private.loop_billing_orders WHERE mode='live' AND state IN('creating','ready','uncertain') AND capacity_until>now()
  ) occupied;
  IF p_user=ANY(COALESCE(owners,'{}'::uuid[])) THEN RETURN; END IF;
  IF COALESCE(array_length(owners,1),0)>=10 THEN RAISE EXCEPTION 'LOOP_PILOT_FULL'; END IF;
END $$;

CREATE FUNCTION public.job_loop_billing_event(p_mode text,p_event text,p_payload_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row jobvance_private.loop_billing_events;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN('test','live') OR p_event IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_INVALID'; END IF;
  SELECT * INTO event_row FROM jobvance_private.loop_billing_events WHERE mode=p_mode AND event_id=p_event;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate',false); END IF;
  IF event_row.payload_hash IS DISTINCT FROM p_payload_hash THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_CONFLICT'; END IF;
  RETURN jsonb_build_object('duplicate',true);
END $$;

CREATE FUNCTION public.job_loop_billing_checkout_claim(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text)
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
    IF o.state='failed' THEN
      IF p_mode='live' THEN PERFORM public.job_loop_billing_assert_capacity(p_user); END IF;
      UPDATE jobvance_private.loop_billing_orders SET state='creating',capacity_until=CASE WHEN p_mode='live' THEN now()+interval '96 hours' ELSE NULL END WHERE user_id=p_user AND request_id=p_request RETURNING * INTO o;
      RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',true);
    END IF;
    RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',false);
  END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode=p_mode AND NOT revoked
    AND ((status IN('active','cancelled') AND valid_until>now()) OR status IN('pending','on_hold','paused','past_due'))) THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_EXISTS'; END IF;
  -- An ambiguous provider request is never retried under a fresh identifier.
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND state IN('creating','uncertain')) THEN RAISE EXCEPTION 'LOOP_CHECKOUT_PENDING'; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND state='ready' AND (capacity_until>now() OR created_at>now()-interval '24 hours')
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions s WHERE s.user_id=p_user AND s.request_id=loop_billing_orders.request_id)) THEN RAISE EXCEPTION 'LOOP_CHECKOUT_PENDING'; END IF;
  IF p_mode='live' THEN PERFORM public.job_loop_billing_assert_capacity(p_user); END IF;
  INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,auth_session,generation,state,capacity_until)
    VALUES(p_user,p_request,p_mode,p_plan,p_product,p_auth_session,p_generation,'creating',CASE WHEN p_mode='live' THEN now()+interval '96 hours' ELSE NULL END) RETURNING * INTO o;
  RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',true);
END $$;

CREATE FUNCTION public.job_loop_billing_checkout_finalize(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_session text,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR p_auth_session IS NULL OR o.auth_session IS DISTINCT FROM p_auth_session OR o.generation IS DISTINCT FROM p_generation
    OR p_session IS NULL OR p_session !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR p_url IS NULL OR length(p_url)>2048
    OR p_url !~ (CASE o.mode WHEN 'live' THEN '^https://checkout\.dodopayments\.com/' ELSE '^https://test\.checkout\.dodopayments\.com/' END)
    OR p_url ~ '[[:cntrl:]]' OR (o.session_id IS NOT NULL AND (o.session_id<>p_session OR o.checkout_url<>p_url))
    THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  UPDATE jobvance_private.loop_billing_orders SET session_id=p_session,checkout_url=p_url,state='ready' WHERE user_id=p_user AND request_id=p_request RETURNING * INTO o;
  RETURN to_jsonb(o);
END $$;

CREATE FUNCTION public.job_loop_billing_checkout_fail(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_retryable boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR p_auth_session IS NULL OR o.auth_session IS DISTINCT FROM p_auth_session OR o.generation IS DISTINCT FROM p_generation OR p_retryable IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF o.session_id IS NULL THEN
    UPDATE jobvance_private.loop_billing_orders SET state=CASE WHEN p_retryable THEN 'failed' ELSE 'uncertain' END WHERE user_id=p_user AND request_id=p_request RETURNING * INTO o;
  END IF;
  RETURN to_jsonb(o);
END $$;

CREATE FUNCTION public.job_loop_billing_apply_event(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_period_start timestamptz,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_revoked boolean,p_payload_hash text,p_payment text DEFAULT NULL,p_paid_amount bigint DEFAULT NULL,p_grace_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders; s jobvance_private.loop_subscriptions; e jobvance_private.loop_billing_events;
  period jobvance_private.loop_subscription_periods; normalized jsonb; is_stale boolean; new_payment boolean:=false; paid_until timestamptz; paid_start timestamptz;
BEGIN
  IF p_user IS NULL OR p_request IS NULL OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9_-]{1,100}$' OR p_status IS NULL OR p_status NOT IN('pending','active','on_hold','paused','cancelled','failed','expired','past_due')
    OR p_event IS NULL OR p_event !~ '^[A-Za-z0-9_.:-]{1,200}$' OR p_created IS NULL OR p_created<0 OR p_created>extract(epoch FROM now())+300
    OR p_revoked IS NULL OR p_cancel_at_period_end IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
    OR p_period_start IS NULL OR p_valid_until IS NULL OR NOT isfinite(p_period_start) OR NOT isfinite(p_valid_until) OR p_period_start>=p_valid_until OR p_valid_until>p_period_start+interval '35 days'
    OR (p_grace_until IS NOT NULL AND (NOT isfinite(p_grace_until) OR p_grace_until>now()+interval '35 days' OR p_status<>'past_due'))
    OR (p_payment IS NULL)<>(p_paid_amount IS NULL) OR (p_payment IS NOT NULL AND (p_payment !~ '^pay_[A-Za-z0-9_-]{1,100}$' OR p_paid_amount NOT BETWEEN CASE p_plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 WHEN 'daily' THEN 9900 ELSE 1000000001 END AND 1000000000))
    THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RETURN jsonb_build_object('accountDeleted',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR o.mode IS DISTINCT FROM p_mode OR o.plan IS DISTINCT FROM p_plan OR o.product_id IS DISTINCT FROM p_product OR o.session_id IS DISTINCT FROM p_session OR p_session IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  normalized:=jsonb_build_object('user',p_user,'request',p_request,'mode',p_mode,'plan',p_plan,'product',p_product,'session',p_session,'subscription',p_subscription,'customer',p_customer,'status',p_status,'periodStart',p_period_start,'validUntil',p_valid_until,'cancelAtPeriodEnd',p_cancel_at_period_end,'created',p_created,'revoked',p_revoked,'payment',p_payment,'amount',p_paid_amount,'graceUntil',p_grace_until);
  SELECT * INTO e FROM jobvance_private.loop_billing_events WHERE mode=p_mode AND event_id=p_event;
  IF FOUND THEN
    IF e.subscription_id<>p_subscription OR e.event_created<>p_created OR e.authority IS DISTINCT FROM normalized OR e.payload_hash IS DISTINCT FROM p_payload_hash THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_CONFLICT'; END IF;
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription FOR UPDATE;
  IF FOUND AND (s.user_id<>p_user OR s.request_id<>p_request OR s.mode<>p_mode OR s.plan<>p_plan OR s.customer_id<>p_customer) THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF NOT FOUND AND p_status='active' AND p_payment IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_PAID_PERIOD_REQUIRED'; END IF;
  -- API-verified recurring payment service_periods are the only authority that
  -- can extend paid access. subscription.next_billing_date alone grants nothing.
  IF p_payment IS NOT NULL THEN
    SELECT * INTO period FROM jobvance_private.loop_subscription_periods WHERE mode=p_mode AND payment_id=p_payment FOR UPDATE;
    new_payment:=NOT FOUND;
    IF FOUND AND (period.subscription_id<>p_subscription OR period.starts_at<>p_period_start OR period.ends_at<>p_valid_until OR period.amount<>p_paid_amount) THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
  END IF;
  is_stale:=s.subscription_id IS NOT NULL AND p_created<s.event_created;
  INSERT INTO jobvance_private.loop_billing_events(mode,event_id,subscription_id,event_created,authority,payload_hash) VALUES(p_mode,p_event,p_subscription,p_created,normalized,p_payload_hash);
  -- Occurrence order governs status, not evidence that a customer already paid.
  -- A late renewal must still record its immutable paid service period after a
  -- newer status-only event; it cannot undo that newer cancellation/hold.
  IF is_stale AND p_payment IS NULL AND NOT p_revoked THEN RETURN jsonb_build_object('duplicate',false,'stale',true); END IF;
  IF s.subscription_id IS NULL THEN
    IF p_mode='live' AND p_payment IS NOT NULL AND (o.generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle WHERE user_id=p_user AND generation=o.generation AND state='active')) THEN
      BEGIN
        PERFORM public.job_loop_billing_assert_capacity(p_user);
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM<>'LOOP_PILOT_FULL' THEN RAISE; END IF;
        IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_pending_fulfillment WHERE mode=p_mode AND event_id=p_event AND
          (payload_hash<>p_payload_hash OR (authority-ARRAY['status','cancelAtPeriodEnd','graceUntil'])<>(normalized-ARRAY['status','cancelAtPeriodEnd','graceUntil']))) THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_CONFLICT'; END IF;
        INSERT INTO jobvance_private.loop_billing_pending_fulfillment(mode,event_id,user_id,subscription_id,payload_hash,authority,reason)
          VALUES(p_mode,p_event,p_user,p_subscription,p_payload_hash,normalized,'LOOP_PILOT_FULL') ON CONFLICT(mode,event_id) DO NOTHING;
        DELETE FROM jobvance_private.loop_billing_events WHERE mode=p_mode AND event_id=p_event;
        RETURN jsonb_build_object('duplicate',false,'pendingFulfillment',true,'reason','LOOP_PILOT_FULL');
      END;
    END IF;
    INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,revoked,generation,period_start,cancel_at_period_end)
      VALUES(p_subscription,p_user,p_request,p_mode,p_plan,p_customer,'pending',now(),p_created,false,o.generation,NULL,false) RETURNING * INTO s;
  END IF;
  IF p_payment IS NOT NULL THEN
    INSERT INTO jobvance_private.loop_subscription_periods(mode,payment_id,subscription_id,starts_at,ends_at,amount,revoked)
      VALUES(p_mode,p_payment,p_subscription,p_period_start,p_valid_until,p_paid_amount,p_revoked)
      ON CONFLICT(mode,payment_id) DO UPDATE SET revoked=loop_subscription_periods.revoked OR EXCLUDED.revoked;
  ELSIF p_revoked THEN RAISE EXCEPTION 'LOOP_BILLING_PAID_PERIOD_REQUIRED'; END IF;
  SELECT min(starts_at),max(ends_at) INTO paid_start,paid_until FROM jobvance_private.loop_subscription_periods WHERE mode=p_mode AND subscription_id=p_subscription AND NOT revoked;
  -- Legacy paid records keep their previous receipt until a verified new cycle
  -- replaces it. A new subscription without payment never gains paid time.
  paid_until:=COALESCE(paid_until,s.valid_until); paid_start:=COALESCE(paid_start,s.period_start);
  UPDATE jobvance_private.loop_subscriptions SET
    status=CASE WHEN is_stale THEN s.status WHEN p_created=s.event_created AND s.status IN('failed','expired','cancelled','on_hold','paused','past_due') AND p_status='active' AND NOT new_payment THEN s.status ELSE p_status END,
    period_start=paid_start,valid_until=paid_until,event_created=greatest(s.event_created,p_created),revoked=s.revoked OR p_revoked,
    cancel_at_period_end=CASE WHEN is_stale THEN s.cancel_at_period_end ELSE p_cancel_at_period_end END,revision=s.revision+1,updated_at=now()
    ,grace_until=CASE WHEN is_stale THEN s.grace_until WHEN p_status='past_due' THEN COALESCE(p_grace_until,s.grace_until) WHEN p_status='active' AND p_payment IS NOT NULL THEN NULL ELSE s.grace_until END
    WHERE subscription_id=p_subscription RETURNING * INTO s;
  UPDATE jobvance_private.loop_billing_pending_fulfillment SET resolved=true WHERE mode=p_mode AND event_id=p_event;
  RETURN jsonb_build_object('duplicate',false,'stale',is_stale,'revision',s.revision,'lifecycleStale',o.generation IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_loop_lifecycle WHERE user_id=p_user AND generation=o.generation AND state='active'));
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_billing_entitlement(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions;
BEGIN
  SELECT * INTO s FROM jobvance_private.loop_subscriptions b WHERE user_id=p_user AND mode='live' AND NOT revoked
    AND (((status='active' OR (status='cancelled' AND cancel_at_period_end)) AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
    AND (period_start IS NULL OR period_start<=now())
    AND (generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle l WHERE l.user_id=p_user AND l.generation=b.generation AND l.state='active'))
    AND (generation IS NULL OR EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=b.mode AND p.subscription_id=b.subscription_id AND NOT p.revoked AND p.starts_at<=now() AND (p.ends_at>now() OR b.status='past_due')))
    ORDER BY CASE plan WHEN 'daily' THEN 3 WHEN 'three_weekly' THEN 2 ELSE 1 END DESC,updated_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('active',true,'plan',s.plan,'cadence',s.plan,'variantLimit',3,'maxWeeklyRuns',CASE s.plan WHEN 'weekly' THEN 1 WHEN 'three_weekly' THEN 3 ELSE 7 END,'validUntil',CASE WHEN s.status='past_due' THEN s.grace_until ELSE s.valid_until END); END IF;
  IF NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') AND EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active) THEN
    RETURN jsonb_build_object('active',true,'plan','pilot','cadence','daily','variantLimit',3,'maxWeeklyRuns',7,'validUntil',NULL); END IF;
  RETURN jsonb_build_object('active',false,'plan',NULL,'cadence',NULL,'variantLimit',3,'maxWeeklyRuns',0,'validUntil',NULL);
END $$;

CREATE FUNCTION public.job_loop_billing_status(p_user uuid,p_auth_session uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions; o jobvance_private.loop_billing_orders; c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_user IS NULL OR p_auth_session IS NULL OR p_mode IS NULL OR p_mode NOT IN('test','live') OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  -- A delayed historical failure must not hide the current paid subscription's
  -- renewal/cancellation controls. Prefer effective access, then nonterminal
  -- provider state, before historical terminal receipts.
  SELECT * INTO s FROM jobvance_private.loop_subscriptions b WHERE user_id=p_user AND mode=p_mode
    ORDER BY CASE WHEN NOT revoked
      AND (((status='active' OR (status='cancelled' AND cancel_at_period_end)) AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
      AND (period_start IS NULL OR period_start<=now())
      AND (generation IS NULL OR generation=COALESCE(current_generation,0))
      AND (generation IS NULL OR EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=b.mode AND p.subscription_id=b.subscription_id AND NOT p.revoked AND p.starts_at<=now() AND (p.ends_at>now() OR b.status='past_due')))
      THEN 0 WHEN NOT revoked AND status IN('pending','active','on_hold','paused','past_due') THEN 1 ELSE 2 END,
      CASE plan WHEN 'daily' THEN 3 WHEN 'three_weekly' THEN 2 ELSE 1 END DESC,updated_at DESC,subscription_id LIMIT 1;
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND auth_session=p_auth_session AND generation=COALESCE(current_generation,0) ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND auth_session=p_auth_session AND mode=p_mode AND generation=COALESCE(current_generation,0) AND subscription_id=s.subscription_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('generation',COALESCE(current_generation,0),'entitlement',public.job_loop_billing_entitlement(p_user),
    'fulfillmentPending',EXISTS(SELECT 1 FROM jobvance_private.loop_billing_pending_fulfillment WHERE user_id=p_user AND mode=p_mode AND NOT resolved),
    'subscription',CASE WHEN s.subscription_id IS NULL THEN NULL ELSE jsonb_build_object('subscriptionId',s.subscription_id,'plan',s.plan,'status',s.status,'validUntil',s.valid_until,'periodStart',s.period_start,'graceUntil',s.grace_until,'cancelAtPeriodEnd',s.cancel_at_period_end,'revoked',s.revoked,'revision',s.revision) END,
    'checkout',CASE WHEN o.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',o.request_id,'plan',o.plan,'status',o.state,'checkoutUrl',o.checkout_url,'createdAt',o.created_at,'expiresAt',o.created_at+interval '24 hours','reservationUntil',o.capacity_until) END,
    'cancelRequest',CASE WHEN c.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',c.request_id,'subscriptionId',c.subscription_id,'status',c.state,'version',c.subscription_revision,'generation',c.generation) END);
END $$;

CREATE FUNCTION public.job_loop_billing_cancel_claim(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_subscription text,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions; c jobvance_private.loop_billing_cancel_requests; current_generation bigint;
BEGIN
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_user IS NULL OR p_auth_session IS NULL OR p_request IS NULL OR p_generation IS NULL OR p_generation<0 OR p_mode IS NULL OR p_mode NOT IN('test','live') THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  -- Billing cancellation remains available after career-data erasure, while the
  -- original displayed generation still binds the exact cancellation intent.
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  SELECT l.generation INTO current_generation FROM public.job_loop_lifecycle l WHERE l.user_id=p_user;
  IF p_generation<>COALESCE(current_generation,0) THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription AND user_id=p_user AND mode=p_mode FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_NOT_FOUND'; END IF;
  SELECT * INTO c FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF c.auth_session<>p_auth_session OR c.generation<>p_generation OR c.mode<>p_mode OR c.subscription_id<>p_subscription OR c.subscription_revision IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('creationClaimAcquired',false,'subscriptionId',p_subscription,'status',c.state);
  END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_cancel_requests WHERE subscription_id=p_subscription AND state IN('creating','uncertain')) THEN RAISE EXCEPTION 'LOOP_CANCELLATION_PENDING'; END IF;
  IF p_version IS NULL OR p_version<>s.revision THEN RAISE EXCEPTION 'LOOP_BILLING_SUBSCRIPTION_CHANGED'; END IF;
  INSERT INTO jobvance_private.loop_billing_cancel_requests(user_id,request_id,auth_session,generation,subscription_revision,mode,subscription_id,state) VALUES(p_user,p_request,p_auth_session,p_generation,p_version,p_mode,p_subscription,CASE WHEN s.cancel_at_period_end OR s.status IN('cancelled','failed','expired') THEN 'confirmed' ELSE 'creating' END) RETURNING * INTO c;
  RETURN jsonb_build_object('creationClaimAcquired',c.state='creating','subscriptionId',p_subscription,'status',c.state);
END $$;

CREATE FUNCTION public.job_loop_billing_cancel_finalize(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_subscription text,p_confirmed boolean)
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
  UPDATE jobvance_private.loop_billing_cancel_requests SET state=CASE WHEN p_confirmed OR c.state='confirmed' THEN 'confirmed' ELSE 'uncertain' END WHERE user_id=p_user AND request_id=p_request RETURNING * INTO c;
  IF p_confirmed THEN UPDATE jobvance_private.loop_subscriptions SET cancel_at_period_end=true,revision=revision+1,updated_at=now() WHERE subscription_id=p_subscription AND user_id=p_user AND mode=p_mode AND NOT cancel_at_period_end; END IF;
  RETURN jsonb_build_object('subscriptionId',p_subscription,'status',c.state);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_enroll_pilot(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  PERFORM public.job_loop_assert_writable(p_user,true);
  IF (public.job_loop_billing_entitlement(p_user)->>'active')::boolean THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_REQUIRED'; END IF;
  PERFORM public.job_loop_billing_assert_capacity(p_user);
  PERFORM public.job_loop_enroll_pilot_unfenced(p_user);
END $$;

-- Superseded write contracts did not carry original browser session/generation
-- or payment service-period evidence. Retain historical definitions for restore
-- comparison, but no deployed handler may invoke these weaker entry points.
REVOKE ALL ON FUNCTION public.job_loop_begin_billing_checkout(uuid,uuid,text,text,text),public.job_loop_finish_billing_checkout(uuid,uuid,text,text),public.job_loop_apply_subscription(uuid,uuid,text,text,text,text,text,text,text,timestamptz,text,bigint,boolean),public.job_loop_enroll_pilot_unfenced(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.job_loop_billing_checkout_claim(uuid,uuid,bigint,uuid,text,text,text),public.job_loop_billing_checkout_finalize(uuid,uuid,bigint,uuid,text,text),public.job_loop_billing_checkout_fail(uuid,uuid,bigint,uuid,boolean),public.job_loop_billing_apply_event(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,boolean,text,text,bigint,timestamptz),public.job_loop_billing_status(uuid,uuid,text),public.job_loop_billing_cancel_claim(uuid,uuid,bigint,uuid,text,text,bigint),public.job_loop_billing_cancel_finalize(uuid,uuid,bigint,uuid,text,text,boolean),public.job_loop_billing_assert_capacity(uuid),public.job_loop_billing_assert_session(uuid,uuid),public.job_loop_billing_event(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_checkout_claim(uuid,uuid,bigint,uuid,text,text,text),public.job_loop_billing_checkout_finalize(uuid,uuid,bigint,uuid,text,text),public.job_loop_billing_checkout_fail(uuid,uuid,bigint,uuid,boolean),public.job_loop_billing_apply_event(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,boolean,text,text,bigint,timestamptz),public.job_loop_billing_status(uuid,uuid,text),public.job_loop_billing_cancel_claim(uuid,uuid,bigint,uuid,text,text,bigint),public.job_loop_billing_cancel_finalize(uuid,uuid,bigint,uuid,text,text,boolean),public.job_loop_billing_assert_capacity(uuid),public.job_loop_billing_assert_session(uuid,uuid),public.job_loop_billing_event(text,text,text) TO service_role;
COMMIT;
