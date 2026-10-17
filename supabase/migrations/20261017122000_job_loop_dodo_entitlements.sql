BEGIN;
CREATE SCHEMA IF NOT EXISTS jobvance_private;
CREATE TABLE jobvance_private.loop_billing_orders (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('test','live')), plan text NOT NULL CHECK(plan IN('weekly','three_weekly','daily')),
 product_id text NOT NULL CHECK(product_id ~ '^pdt_[A-Za-z0-9_-]{1,100}$'),
 session_id text UNIQUE, checkout_url text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id), CHECK(session_id IS NULL OR session_id ~ '^cks_[A-Za-z0-9_-]{1,100}$')
);
CREATE TABLE jobvance_private.loop_subscriptions (
 subscription_id text PRIMARY KEY CHECK(subscription_id ~ '^sub_[A-Za-z0-9_-]{1,100}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('test','live')), plan text NOT NULL CHECK(plan IN('weekly','three_weekly','daily')),
 customer_id text NOT NULL, status text NOT NULL CHECK(status IN('pending','active','on_hold','paused','cancelled','failed','expired','past_due')),
 valid_until timestamptz NOT NULL, event_created bigint NOT NULL, revoked boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(user_id,request_id) REFERENCES jobvance_private.loop_billing_orders(user_id,request_id)
);
CREATE TABLE jobvance_private.loop_billing_events(mode text NOT NULL,event_id text NOT NULL,subscription_id text NOT NULL,event_created bigint NOT NULL,PRIMARY KEY(mode,event_id));
ALTER TABLE jobvance_private.loop_billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_billing_orders,jobvance_private.loop_subscriptions,jobvance_private.loop_billing_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.job_loop_begin_billing_checkout(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;
BEGIN
 IF p_user IS NULL OR p_request IS NULL OR p_mode IS NULL OR p_mode NOT IN('live','test') OR p_plan IS NULL OR p_plan NOT IN('weekly','three_weekly','daily') OR p_product IS NULL OR p_product !~ '^pdt_[A-Za-z0-9_-]{1,100}$' THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
 SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF o.mode<>p_mode OR o.plan<>p_plan OR o.product_id<>p_product THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
  RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',false);
 END IF;
 IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode=p_mode AND status='active' AND valid_until>now() AND NOT revoked) THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_EXISTS'; END IF;
 -- A still-open checkout must be resumed, not duplicated under another request ID.
 IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND mode=p_mode AND created_at>now()-interval '24 hours') THEN RAISE EXCEPTION 'LOOP_CHECKOUT_PENDING'; END IF;
 INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES(p_user,p_request,p_mode,p_plan,p_product) RETURNING * INTO o;
 RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',true);
END $$;
CREATE FUNCTION public.job_loop_finish_billing_checkout(p_user uuid,p_request uuid,p_session text,p_url text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;
BEGIN
 SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR p_session IS NULL OR p_session !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR p_url IS NULL OR
 p_url !~ (CASE o.mode WHEN 'live' THEN '^https://checkout\.dodopayments\.com/' ELSE '^https://test\.checkout\.dodopayments\.com/' END) OR
 (o.session_id IS NOT NULL AND (o.session_id<>p_session OR o.checkout_url<>p_url)) THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
 UPDATE jobvance_private.loop_billing_orders SET session_id=p_session,checkout_url=p_url WHERE user_id=p_user AND request_id=p_request;
END $$;
CREATE FUNCTION public.job_loop_billing_order(p_user uuid,p_request uuid,p_mode text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT to_jsonb(o) FROM jobvance_private.loop_billing_orders o WHERE user_id=p_user AND request_id=p_request AND mode=p_mode $$;
CREATE FUNCTION public.job_loop_apply_subscription(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,p_valid_until timestamptz,p_event text,p_created bigint,p_revoked boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders; s jobvance_private.loop_subscriptions; e jobvance_private.loop_billing_events;
BEGIN
 IF p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$' OR p_customer IS NULL OR length(p_customer) NOT BETWEEN 1 AND 120 OR p_status IS NULL OR p_status NOT IN('pending','active','on_hold','paused','cancelled','failed','expired','past_due') OR p_created IS NULL OR p_created<0 OR p_event IS NULL OR p_event !~ '^[A-Za-z0-9_.:-]{1,200}$' OR p_revoked IS NULL OR p_valid_until IS NULL OR NOT isfinite(p_valid_until) THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RETURN jsonb_build_object('accountDeleted',true); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
 PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
 SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR o.mode IS DISTINCT FROM p_mode OR o.plan IS DISTINCT FROM p_plan OR o.product_id IS DISTINCT FROM p_product OR o.session_id IS DISTINCT FROM p_session OR p_session IS NULL THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
 SELECT * INTO e FROM jobvance_private.loop_billing_events WHERE mode=p_mode AND event_id=p_event;
 IF FOUND THEN
  IF e.subscription_id<>p_subscription OR e.event_created<>p_created THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
  RETURN jsonb_build_object('duplicate',true);
 END IF;
 SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription FOR UPDATE;
 IF FOUND AND (s.user_id<>p_user OR s.request_id<>p_request OR s.mode<>p_mode OR s.plan<>p_plan OR s.customer_id<>p_customer) THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
 INSERT INTO jobvance_private.loop_billing_events VALUES(p_mode,p_event,p_subscription,p_created);
 IF s.subscription_id IS NOT NULL AND p_created<s.event_created AND NOT p_revoked THEN RETURN jsonb_build_object('stale',true); END IF;
 -- Refund/dispute revocation is permanent for this subscription. Reordered activation cannot undo it.
 INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,revoked)
 VALUES(p_subscription,p_user,p_request,p_mode,p_plan,p_customer,p_status,p_valid_until,p_created,p_revoked)
 ON CONFLICT(subscription_id) DO UPDATE SET status=CASE WHEN EXCLUDED.event_created>=loop_subscriptions.event_created THEN EXCLUDED.status ELSE loop_subscriptions.status END,
 valid_until=CASE WHEN EXCLUDED.event_created>=loop_subscriptions.event_created THEN EXCLUDED.valid_until ELSE loop_subscriptions.valid_until END,
 event_created=greatest(loop_subscriptions.event_created,EXCLUDED.event_created),revoked=loop_subscriptions.revoked OR EXCLUDED.revoked,updated_at=now();
 RETURN jsonb_build_object('duplicate',false);
END $$;
CREATE FUNCTION public.job_loop_billing_entitlement(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jobvance_private.loop_subscriptions;
BEGIN
 SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live' AND status='active' AND valid_until>now() AND NOT revoked
 ORDER BY CASE plan WHEN 'daily' THEN 3 WHEN 'three_weekly' THEN 2 ELSE 1 END DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('active',true,'plan',s.plan,'cadence',s.plan,'variantLimit',3,'maxWeeklyRuns',CASE s.plan WHEN 'weekly' THEN 1 WHEN 'three_weekly' THEN 3 ELSE 7 END,'validUntil',s.valid_until); END IF;
 IF NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') AND EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active) THEN
 RETURN jsonb_build_object('active',true,'plan','pilot','cadence','daily','variantLimit',3,'maxWeeklyRuns',7,'validUntil',NULL); END IF;
 RETURN jsonb_build_object('active',false,'plan',NULL,'cadence',NULL,'variantLimit',3,'maxWeeklyRuns',0,'validUntil',NULL);
END $$;
CREATE OR REPLACE FUNCTION public.job_loop_enroll_pilot(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
 PERFORM public.job_loop_assert_writable(p_user,true);
 IF (public.job_loop_billing_entitlement(p_user)->>'active')::boolean THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_REQUIRED'; END IF;
 PERFORM public.job_loop_enroll_pilot_unfenced(p_user);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_begin_billing_checkout(uuid,uuid,text,text,text),public.job_loop_finish_billing_checkout(uuid,uuid,text,text),public.job_loop_billing_order(uuid,uuid,text),public.job_loop_apply_subscription(uuid,uuid,text,text,text,text,text,text,text,timestamptz,text,bigint,boolean),public.job_loop_billing_entitlement(uuid),public.job_loop_enroll_pilot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_begin_billing_checkout(uuid,uuid,text,text,text),public.job_loop_finish_billing_checkout(uuid,uuid,text,text),public.job_loop_billing_order(uuid,uuid,text),public.job_loop_apply_subscription(uuid,uuid,text,text,text,text,text,text,text,timestamptz,text,bigint,boolean),public.job_loop_billing_entitlement(uuid),public.job_loop_enroll_pilot(uuid) TO service_role;
COMMIT;
