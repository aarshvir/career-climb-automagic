BEGIN;

-- Seven-day free trial for the three monthly Automated Job Loop plans.
-- A card is required (Dodo card-optional trial settings are rejected by the
-- edge validator). The trial is a server-owned property of the original order,
-- never of a browser request or provider metadata. A $0 trial window is stored
-- separately from paid service periods, so revenue, purchase reporting and paid
-- period evidence are unchanged. One trial per account and billing mode.

ALTER TABLE jobvance_private.loop_billing_orders
  ADD COLUMN trial_days smallint NOT NULL DEFAULT 0 CHECK(trial_days IN(0,7));

-- trial_days may only be set once, inside the original creation claim, before a
-- provider checkout exists. It can never be added to or removed from a session.
CREATE FUNCTION jobvance_private.guard_loop_order_trial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.trial_days IS DISTINCT FROM OLD.trial_days AND NOT (OLD.trial_days=0 AND NEW.trial_days=7 AND OLD.session_id IS NULL AND NEW.session_id IS NULL AND NEW.state='creating') THEN
    RAISE EXCEPTION 'LOOP_TRIAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loop_order_trial_immutable BEFORE UPDATE OF trial_days ON jobvance_private.loop_billing_orders
  FOR EACH ROW EXECUTE FUNCTION jobvance_private.guard_loop_order_trial();

CREATE TABLE jobvance_private.loop_subscription_trials (
  mode text NOT NULL CHECK(mode IN('test','live')),
  subscription_id text PRIMARY KEY REFERENCES jobvance_private.loop_subscriptions(subscription_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  -- The provider's $0 initial payment. It is never a paid service period.
  payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9_-]{1,100}$'),
  quote_id uuid REFERENCES jobvance_private.loop_price_quotes(quote_id),
  currency text NOT NULL CHECK(currency IN('USD','EUR','GBP','INR','AED','CAD','AUD','SGD','JPY')),
  amount bigint NOT NULL DEFAULT 0 CHECK(amount=0),
  starts_at timestamptz NOT NULL,
  -- Access end: never later than seven days after the verified trial start.
  ends_at timestamptz NOT NULL,
  -- Provider next_billing_date at trial start: the scheduled first charge.
  first_charge_at timestamptz NOT NULL,
  -- Card-network and consumer rules: remind at least two days before charging.
  reminder_at timestamptz NOT NULL,
  -- TODO(trial-reminder-email): no transactional mail provider is wired up. A
  -- sender must call job_loop_billing_trial_reminders_due and then mark rows.
  reminder_sent_at timestamptz,
  granted boolean NOT NULL,
  ineligible_reason text CHECK(ineligible_reason IS NULL OR ineligible_reason IN('trial_used','capacity_full')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mode,payment_id),
  FOREIGN KEY(user_id,request_id) REFERENCES jobvance_private.loop_billing_orders(user_id,request_id),
  CHECK(isfinite(starts_at) AND isfinite(ends_at) AND isfinite(first_charge_at)),
  CHECK(starts_at<ends_at AND ends_at<=starts_at+interval '7 days' AND ends_at<=first_charge_at),
  CHECK(first_charge_at>=starts_at+interval '7 days'-interval '1 hour' AND first_charge_at<=starts_at+interval '7 days'+interval '1 hour'),
  CHECK(reminder_at=first_charge_at-interval '2 days'),
  CHECK(granted=(ineligible_reason IS NULL))
);
CREATE INDEX loop_subscription_trials_owner ON jobvance_private.loop_subscription_trials(user_id,mode);
CREATE INDEX loop_subscription_trials_reminder ON jobvance_private.loop_subscription_trials(reminder_at) WHERE reminder_sent_at IS NULL AND granted;
ALTER TABLE jobvance_private.loop_subscription_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_subscription_trials FROM PUBLIC,anon,authenticated,service_role;

-- Trial evidence is immutable except the one-way reminder delivery marker.
CREATE FUNCTION jobvance_private.immutable_loop_trial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-'reminder_sent_at') IS DISTINCT FROM (to_jsonb(OLD)-'reminder_sent_at') OR (OLD.reminder_sent_at IS NOT NULL AND NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at) THEN
    RAISE EXCEPTION 'LOOP_TRIAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loop_trial_immutable BEFORE UPDATE ON jobvance_private.loop_subscription_trials
  FOR EACH ROW EXECUTE FUNCTION jobvance_private.immutable_loop_trial();

-- An account that has never had a subscription or trial in this billing mode.
-- Free pilot places already include daily runs, so a live pilot is not offered
-- a trial (a later cancellation would otherwise end the pilot place).
CREATE FUNCTION jobvance_private.loop_trial_eligible(p_user uuid,p_mode text,p_except_subscription text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_user IS NOT NULL AND p_mode IN('test','live')
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions s WHERE s.user_id=p_user AND s.mode=p_mode AND s.subscription_id IS DISTINCT FROM p_except_subscription)
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_trials t WHERE t.user_id=p_user AND t.mode=p_mode AND t.subscription_id IS DISTINCT FROM p_except_subscription)
    AND NOT (p_mode='live' AND EXISTS(SELECT 1 FROM public.job_loop_pilot_users p WHERE p.user_id=p_user AND p.active))
$$;

-- Trial checkout claim. It reuses the existing v1 (legacy USD) or v2 (quoted)
-- claim unchanged, under the same owner billing lock, then binds trial_days=7
-- to a newly created order. An existing order keeps its original trial binding.
CREATE FUNCTION public.job_loop_billing_checkout_claim_trial(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text,p_quote uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders; result jsonb; existed boolean;
BEGIN
  IF p_user IS NULL OR p_auth_session IS NULL OR p_request IS NULL OR p_mode IS NULL OR p_mode NOT IN('test','live') THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  existed:=FOUND;
  IF existed AND o.trial_days<>7 THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  -- Checked for new and retried requests: a subscription or trial recorded since
  -- the original request was created ends trial eligibility.
  IF NOT jobvance_private.loop_trial_eligible(p_user,p_mode) THEN RAISE EXCEPTION 'LOOP_TRIAL_USED'; END IF;
  result:=CASE WHEN p_quote IS NULL THEN public.job_loop_billing_checkout_claim(p_user,p_auth_session,p_generation,p_request,p_mode,p_plan,p_product)
    ELSE public.job_loop_billing_checkout_claim_v2(p_user,p_auth_session,p_generation,p_request,p_mode,p_plan,p_product,p_quote) END;
  IF NOT existed THEN
    UPDATE jobvance_private.loop_billing_orders SET trial_days=7 WHERE user_id=p_user AND request_id=p_request AND session_id IS NULL AND state='creating' RETURNING * INTO o;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  ELSE SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request; END IF;
  RETURN result||jsonb_build_object('trial_days',o.trial_days,'state',o.state);
END $$;

-- Records the verified $0 trial start for a trial order, then applies the
-- subscription status through the unchanged price-bound event function (event
-- de-duplication, ordering, cancellation flag and revision stay identical).
CREATE FUNCTION jobvance_private.apply_loop_trial_event(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_trial_start timestamptz,p_first_charge timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_payload_hash text,p_payment text,p_quote uuid,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders; s jobvance_private.loop_subscriptions; t jobvance_private.loop_subscription_trials;
  access_end timestamptz; is_granted boolean; reason text; pricing jsonb; result jsonb; has_paid boolean;
BEGIN
  IF p_user IS NULL OR p_request IS NULL OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9_-]{1,100}$' OR p_status IS NULL OR p_status NOT IN('pending','active','on_hold','paused','cancelled','failed','expired','past_due')
    OR p_payment IS NULL OR p_payment !~ '^pay_[A-Za-z0-9_-]{1,100}$' OR p_cancel_at_period_end IS NULL
    OR p_trial_start IS NULL OR p_first_charge IS NULL OR NOT isfinite(p_trial_start) OR NOT isfinite(p_first_charge)
    OR p_first_charge<p_trial_start+interval '7 days'-interval '1 hour' OR p_first_charge>p_trial_start+interval '7 days'+interval '1 hour'
    OR p_trial_start>now()+interval '5 minutes'
    THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RETURN jsonb_build_object('accountDeleted',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR o.mode IS DISTINCT FROM p_mode OR o.plan IS DISTINCT FROM p_plan OR o.product_id IS DISTINCT FROM p_product OR o.session_id IS DISTINCT FROM p_session OR p_session IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF o.trial_days<>7 THEN RAISE EXCEPTION 'LOOP_TRIAL_CONFLICT'; END IF;
  IF o.quote_id IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  pricing:=jobvance_private.loop_order_pricing(o);
  IF p_currency IS DISTINCT FROM pricing->>'currency' THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription FOR UPDATE;
  IF FOUND AND (s.user_id<>p_user OR s.request_id<>p_request OR s.mode<>p_mode OR s.plan<>p_plan OR s.customer_id<>p_customer OR s.quote_id IS DISTINCT FROM p_quote) THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE subscription_id=p_subscription FOR UPDATE;
  IF FOUND THEN
    IF t.user_id<>p_user OR t.request_id<>p_request OR t.mode<>p_mode OR t.payment_id<>p_payment OR t.starts_at<>p_trial_start OR t.first_charge_at<>p_first_charge THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_trials WHERE mode=p_mode AND payment_id=p_payment) THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
    access_end:=least(p_first_charge,p_trial_start+interval '7 days');
    -- Server-side one-trial enforcement independent of the checkout claim and of
    -- Dodo, which skips its own per-customer trial check for explicit trial days.
    is_granted:=jobvance_private.loop_trial_eligible(p_user,p_mode,p_subscription);
    reason:=CASE WHEN is_granted THEN NULL ELSE 'trial_used' END;
    IF is_granted AND p_mode='live' AND s.subscription_id IS NULL AND (o.generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle WHERE user_id=p_user AND generation=o.generation AND state='active')) THEN
      BEGIN
        PERFORM public.job_loop_billing_assert_capacity(p_user);
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM<>'LOOP_PILOT_FULL' THEN RAISE; END IF;
        is_granted:=false; reason:='capacity_full';
      END;
    END IF;
    IF s.subscription_id IS NULL THEN
      INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,revoked,generation,period_start,cancel_at_period_end,quote_id)
        VALUES(p_subscription,p_user,p_request,p_mode,p_plan,p_customer,'pending',CASE WHEN is_granted THEN access_end ELSE now() END,p_created,false,o.generation,CASE WHEN is_granted THEN p_trial_start ELSE NULL END,false,p_quote) RETURNING * INTO s;
    ELSE
      -- A paid cycle recorded first (out-of-order delivery) keeps its own dates.
      has_paid:=EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods WHERE mode=p_mode AND subscription_id=p_subscription);
      IF is_granted AND NOT has_paid THEN
        UPDATE jobvance_private.loop_subscriptions SET valid_until=greatest(valid_until,access_end),period_start=COALESCE(period_start,p_trial_start),updated_at=now() WHERE subscription_id=p_subscription;
      END IF;
    END IF;
    INSERT INTO jobvance_private.loop_subscription_trials(mode,subscription_id,user_id,request_id,payment_id,quote_id,currency,starts_at,ends_at,first_charge_at,reminder_at,granted,ineligible_reason)
      VALUES(p_mode,p_subscription,p_user,p_request,p_payment,p_quote,p_currency,p_trial_start,access_end,p_first_charge,p_first_charge-interval '2 days',is_granted,reason);
  END IF;
  result:=jobvance_private.apply_loop_price_event(p_user,p_request,p_mode,p_plan,p_product,p_session,p_subscription,p_customer,p_status,p_trial_start,p_first_charge,p_cancel_at_period_end,p_event,p_created,false,p_payload_hash,NULL,NULL,NULL,p_quote,p_currency);
  SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE subscription_id=p_subscription;
  RETURN result||jsonb_build_object('trial',jsonb_build_object('granted',t.granted,'endsAt',t.ends_at,'firstChargeAt',t.first_charge_at,'reason',t.ineligible_reason));
END $$;

-- Unchanged price-bound event function from 20261018095409, except that the
-- first paid period of a subscription whose free trial was not granted is
-- admitted through the paid-place capacity check (pending fulfillment if full).
CREATE OR REPLACE FUNCTION jobvance_private.apply_loop_price_event(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_period_start timestamptz,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_revoked boolean,p_payload_hash text,p_payment text,p_paid_amount bigint,p_grace_until timestamptz,p_quote uuid,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders; s jobvance_private.loop_subscriptions; e jobvance_private.loop_billing_events;
  period jobvance_private.loop_subscription_periods; normalized jsonb; is_stale boolean; new_payment boolean:=false; paid_until timestamptz; paid_start timestamptz; pricing jsonb; expected_amount bigint; expected_currency text;
BEGIN
  IF p_user IS NULL OR p_request IS NULL OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9_-]{1,100}$' OR p_status IS NULL OR p_status NOT IN('pending','active','on_hold','paused','cancelled','failed','expired','past_due')
    OR p_event IS NULL OR p_event !~ '^[A-Za-z0-9_.:-]{1,200}$' OR p_created IS NULL OR p_created<0 OR p_created>extract(epoch FROM now())+300
    OR p_revoked IS NULL OR p_cancel_at_period_end IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
    OR p_period_start IS NULL OR p_valid_until IS NULL OR NOT isfinite(p_period_start) OR NOT isfinite(p_valid_until) OR p_period_start>=p_valid_until OR p_valid_until>p_period_start+interval '35 days'
    OR (p_grace_until IS NOT NULL AND (NOT isfinite(p_grace_until) OR p_grace_until>now()+interval '35 days' OR p_status<>'past_due'))
    OR (p_payment IS NULL)<>(p_paid_amount IS NULL) OR (p_payment IS NOT NULL AND (p_payment !~ '^pay_[A-Za-z0-9_-]{1,100}$' OR p_paid_amount NOT BETWEEN 1 AND 1000000000))
    THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RETURN jsonb_build_object('accountDeleted',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR o.mode IS DISTINCT FROM p_mode OR o.plan IS DISTINCT FROM p_plan OR o.product_id IS DISTINCT FROM p_product OR o.session_id IS DISTINCT FROM p_session OR p_session IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF o.quote_id IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  pricing:=jobvance_private.loop_order_pricing(o);expected_currency:=pricing->>'currency';expected_amount:=(pricing->>'amountMinor')::bigint;
  IF p_currency IS DISTINCT FROM expected_currency OR (p_payment IS NOT NULL AND p_paid_amount IS DISTINCT FROM expected_amount) THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
  normalized:=jsonb_build_object('user',p_user,'request',p_request,'mode',p_mode,'plan',p_plan,'product',p_product,'session',p_session,'subscription',p_subscription,'customer',p_customer,'status',p_status,'periodStart',p_period_start,'validUntil',p_valid_until,'cancelAtPeriodEnd',p_cancel_at_period_end,'created',p_created,'revoked',p_revoked,'payment',p_payment,'amount',p_paid_amount,'graceUntil',p_grace_until);
  IF p_quote IS NOT NULL THEN normalized:=normalized||jsonb_build_object('quoteId',p_quote,'currency',p_currency); END IF;
  SELECT * INTO e FROM jobvance_private.loop_billing_events WHERE mode=p_mode AND event_id=p_event;
  IF FOUND THEN
    IF e.subscription_id<>p_subscription OR e.event_created<>p_created OR e.authority IS DISTINCT FROM normalized OR e.payload_hash IS DISTINCT FROM p_payload_hash THEN RAISE EXCEPTION 'LOOP_BILLING_EVENT_CONFLICT'; END IF;
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription FOR UPDATE;
  IF FOUND AND (s.user_id<>p_user OR s.request_id<>p_request OR s.mode<>p_mode OR s.plan<>p_plan OR s.customer_id<>p_customer OR s.quote_id IS DISTINCT FROM p_quote) THEN RAISE EXCEPTION 'LOOP_BILLING_REQUEST_CONFLICT'; END IF;
  IF NOT FOUND AND p_status='active' AND p_payment IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_PAID_PERIOD_REQUIRED'; END IF;
  -- API-verified recurring payment service_periods are the only authority that
  -- can extend paid access. subscription.next_billing_date alone grants nothing.
  IF p_payment IS NOT NULL THEN
    SELECT * INTO period FROM jobvance_private.loop_subscription_periods WHERE mode=p_mode AND payment_id=p_payment FOR UPDATE;
    new_payment:=NOT FOUND;
    IF FOUND AND (period.subscription_id<>p_subscription OR period.starts_at<>p_period_start OR period.ends_at<>p_valid_until OR period.amount<>p_paid_amount OR period.currency<>p_currency OR period.quote_id IS DISTINCT FROM p_quote) THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
  END IF;
  is_stale:=s.subscription_id IS NOT NULL AND p_created<s.event_created;
  INSERT INTO jobvance_private.loop_billing_events(mode,event_id,subscription_id,event_created,authority,payload_hash) VALUES(p_mode,p_event,p_subscription,p_created,normalized,p_payload_hash);
  -- Occurrence order governs status, not evidence that a customer already paid.
  -- A late renewal must still record its immutable paid service period after a
  -- newer status-only event; it cannot undo that newer cancellation/hold.
  IF is_stale AND p_payment IS NULL AND NOT p_revoked THEN RETURN jsonb_build_object('duplicate',false,'stale',true); END IF;
  -- Paid-place admission happens when a subscription's first verified paid
  -- period is admitted. A subscription row created for a trial that was NOT
  -- granted (trial already used, or no place free) has never been admitted, so
  -- its first real charge passes the same capacity check as a new subscription.
  IF s.subscription_id IS NULL OR (new_payment AND NOT p_revoked
    AND EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_trials t WHERE t.subscription_id=p_subscription AND NOT t.granted)
    AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=p_mode AND p.subscription_id=p_subscription)) THEN
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
    IF s.subscription_id IS NULL THEN
      INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,revoked,generation,period_start,cancel_at_period_end,quote_id)
        VALUES(p_subscription,p_user,p_request,p_mode,p_plan,p_customer,'pending',now(),p_created,false,o.generation,NULL,false,p_quote) RETURNING * INTO s;
    END IF;
  END IF;
  IF p_payment IS NOT NULL THEN
    INSERT INTO jobvance_private.loop_subscription_periods(mode,payment_id,subscription_id,starts_at,ends_at,amount,revoked,quote_id,currency)
      VALUES(p_mode,p_payment,p_subscription,p_period_start,p_valid_until,p_paid_amount,p_revoked,p_quote,p_currency)
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


CREATE FUNCTION public.job_loop_billing_apply_trial(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_trial_start timestamptz,p_first_charge timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_payload_hash text,p_payment text,p_quote uuid DEFAULT NULL,p_currency text DEFAULT 'USD')
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jobvance_private.apply_loop_trial_event(p_user,p_request,p_mode,p_plan,p_product,p_session,p_subscription,p_customer,p_status,p_trial_start,p_first_charge,p_cancel_at_period_end,p_event,p_created,p_payload_hash,p_payment,p_quote,p_currency)
$$;

-- Entitlement keeps its exact JSON shape. A granted trial window gives the
-- subscribed plan's cadence until the trial ends, and only while the provider
-- subscription is active or cancelled-at-period-end. It never grants overdue
-- grace: if the first charge fails, access ends at the trial end.
CREATE OR REPLACE FUNCTION public.job_loop_billing_entitlement(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions; until timestamptz;
BEGIN
  SELECT * INTO s FROM jobvance_private.loop_subscriptions b WHERE user_id=p_user AND mode='live' AND NOT revoked
    AND (generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle l WHERE l.user_id=p_user AND l.generation=b.generation AND l.state='active'))
    AND ((
      (((status='active' OR (status='cancelled' AND cancel_at_period_end)) AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
      AND (period_start IS NULL OR period_start<=now())
      AND (generation IS NULL OR EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=b.mode AND p.subscription_id=b.subscription_id AND NOT p.revoked AND p.starts_at<=now() AND (p.ends_at>now() OR b.status='past_due')))
    ) OR (
      (status='active' OR (status='cancelled' AND cancel_at_period_end))
      AND EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_trials t WHERE t.mode=b.mode AND t.subscription_id=b.subscription_id AND t.granted AND t.starts_at<=now() AND t.ends_at>now())
    ))
    ORDER BY CASE plan WHEN 'daily' THEN 3 WHEN 'three_weekly' THEN 2 ELSE 1 END DESC,updated_at DESC LIMIT 1;
  IF FOUND THEN
    until:=CASE WHEN s.status='past_due' THEN s.grace_until ELSE s.valid_until END;
    IF NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods p WHERE p.mode=s.mode AND p.subscription_id=s.subscription_id AND NOT p.revoked AND p.starts_at<=now() AND (p.ends_at>now() OR s.status='past_due')) THEN
      SELECT COALESCE(max(t.ends_at),until) INTO until FROM jobvance_private.loop_subscription_trials t WHERE t.mode=s.mode AND t.subscription_id=s.subscription_id AND t.granted AND t.starts_at<=now() AND t.ends_at>now();
    END IF;
    RETURN jsonb_build_object('active',true,'plan',s.plan,'cadence',s.plan,'variantLimit',3,'maxWeeklyRuns',CASE s.plan WHEN 'weekly' THEN 1 WHEN 'three_weekly' THEN 3 ELSE 7 END,'validUntil',until);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') AND EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active) THEN
    RETURN jsonb_build_object('active',true,'plan','pilot','cadence','daily','variantLimit',3,'maxWeeklyRuns',7,'validUntil',NULL); END IF;
  RETURN jsonb_build_object('active',false,'plan',NULL,'cadence',NULL,'variantLimit',3,'maxWeeklyRuns',0,'validUntil',NULL);
END $$;

CREATE FUNCTION jobvance_private.loop_trial_json(t jobvance_private.loop_subscription_trials) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT CASE WHEN t.subscription_id IS NULL THEN NULL ELSE jsonb_build_object('startsAt',t.starts_at,'endsAt',t.ends_at,'firstChargeAt',t.first_charge_at,'reminderAt',t.reminder_at,'granted',t.granted) END
$$;

-- Additive status fields: v2 clients ignore them (the edge function only exposes
-- them to contract version 3).
CREATE OR REPLACE FUNCTION public.job_loop_billing_status_v2(p_user uuid,p_auth_session uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; o jobvance_private.loop_billing_orders; t jobvance_private.loop_subscription_trials; sub_id text; checkout_request uuid;
BEGIN
  result:=public.job_loop_billing_status(p_user,p_auth_session,p_mode);sub_id:=result->'subscription'->>'subscriptionId';
  IF sub_id IS NOT NULL THEN
    SELECT b.* INTO o FROM jobvance_private.loop_billing_orders b JOIN jobvance_private.loop_subscriptions s ON s.user_id=b.user_id AND s.request_id=b.request_id WHERE s.subscription_id=sub_id AND s.user_id=p_user AND s.mode=p_mode;
    result:=jsonb_set(result,'{subscription,pricing}',jobvance_private.loop_order_pricing(o));
    SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE subscription_id=sub_id AND user_id=p_user AND mode=p_mode;
    result:=jsonb_set(result,'{subscription,trial}',COALESCE(jobvance_private.loop_trial_json(t),'null'::jsonb));
  END IF;
  checkout_request:=(result->'checkout'->>'requestId')::uuid;
  IF checkout_request IS NOT NULL THEN
    SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=checkout_request AND mode=p_mode;
    result:=jsonb_set(result,'{checkout,pricing}',jobvance_private.loop_order_pricing(o));
    result:=jsonb_set(result,'{checkout,trialDays}',to_jsonb(o.trial_days));
  END IF;
  RETURN result||jsonb_build_object('trialEligible',jobvance_private.loop_trial_eligible(p_user,p_mode));
END $$;

-- TODO(trial-reminder-email): wire a transactional mail sender (none exists in
-- this project yet) to read due reminders and mark each one after delivery.
CREATE FUNCTION public.job_loop_billing_trial_reminders_due(p_mode text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',t.user_id,'subscriptionId',t.subscription_id,'plan',s.plan,'firstChargeAt',t.first_charge_at,'reminderAt',t.reminder_at,'pricing',jobvance_private.loop_order_pricing(o)) ORDER BY t.reminder_at),'[]'::jsonb)
  FROM (SELECT * FROM jobvance_private.loop_subscription_trials WHERE mode=p_mode AND granted AND reminder_sent_at IS NULL AND reminder_at<=now() AND first_charge_at>now() ORDER BY reminder_at LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)) t
  JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND NOT s.cancel_at_period_end AND s.status='active' AND NOT s.revoked
  JOIN jobvance_private.loop_billing_orders o ON o.user_id=t.user_id AND o.request_id=t.request_id
$$;
CREATE FUNCTION public.job_loop_billing_trial_reminder_sent(p_mode text,p_subscription text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  WITH changed AS (UPDATE jobvance_private.loop_subscription_trials SET reminder_sent_at=now() WHERE mode=p_mode AND subscription_id=p_subscription AND reminder_sent_at IS NULL RETURNING 1)
  SELECT EXISTS(SELECT 1 FROM changed)
$$;

REVOKE ALL ON FUNCTION jobvance_private.guard_loop_order_trial(),jobvance_private.immutable_loop_trial(),jobvance_private.loop_trial_eligible(uuid,text,text),jobvance_private.loop_trial_json(jobvance_private.loop_subscription_trials),
  jobvance_private.apply_loop_trial_event(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,text,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.job_loop_billing_checkout_claim_trial(uuid,uuid,bigint,uuid,text,text,text,uuid),
  public.job_loop_billing_apply_trial(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,text,text,uuid,text),
  public.job_loop_billing_entitlement(uuid),public.job_loop_billing_status_v2(uuid,uuid,text),
  public.job_loop_billing_trial_reminders_due(text,integer),public.job_loop_billing_trial_reminder_sent(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_checkout_claim_trial(uuid,uuid,bigint,uuid,text,text,text,uuid),
  public.job_loop_billing_apply_trial(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,text,text,uuid,text),
  public.job_loop_billing_status_v2(uuid,uuid,text),
  public.job_loop_billing_trial_reminders_due(text,integer),public.job_loop_billing_trial_reminder_sent(text,text) TO service_role;
COMMIT;
