-- One-time job-search passes sold through Dodo Payments, and the tiered AI-tailoring allowance.
-- Written for review only. Apply once through the reviewed process, together with the matching
-- create-checkout, dodo-webhook, get-entitlement and tailor-for-job deployments. Billing stays
-- disabled until JOBVANCE_BILLING_ENABLED=true and JOBVANCE_PAYMENT_PROVIDER=dodo are set.
--
-- Free:  signed-in users get 3 AI-tailored CVs per UTC calendar month; guests get 1 per UTC day per
--        rate hash, with the global guest cap of 200 a day. Free and guest reservations stop once
--        committed spend would pass 80% of the owner's monthly cap.
-- Paid:  the soonest-expiring active pass is consumed first, with a fair-use cap of 40 a UTC day.
--        Paid reservations may use the whole cap, never more.
-- Usage is always counted from jobvance_tailor_usage rows: reserved, uncertain, and settled with a
-- cost above zero all count; a call settled at zero cost (rejected before any model usage) does not.
-- There is deliberately no separate counter that could drift.
--
-- Functions whose argument lists change are dropped by exact signature, without IF EXISTS, so an
-- unexpected schema aborts the whole transaction instead of leaving an ambiguous overload behind.
BEGIN;

CREATE TABLE public.jobvance_pass_plans (
  plan text PRIMARY KEY CHECK (plan ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 100 AND 100000),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  days integer NOT NULL CHECK (days BETWEEN 1 AND 366),
  tailor_quota integer NOT NULL CHECK (tailor_quota BETWEEN 1 AND 10000),
  active boolean NOT NULL DEFAULT true
);
INSERT INTO public.jobvance_pass_plans(plan, name, price_cents, currency, days, tailor_quota) VALUES
  ('sprint_7d', 'Sprint', 900, 'usd', 7, 25),
  ('search_30d', 'Job Search', 1900, 'usd', 30, 100),
  ('move_90d', 'Career Move', 3900, 'usd', 90, 300);

-- A plan order records its plan and that plan's price when the checkout is claimed. Legacy orders
-- keep a null plan and the fixed $29 amount. Passes are sold only through Dodo.
ALTER TABLE public.billing_orders ADD COLUMN plan text REFERENCES public.jobvance_pass_plans(plan);
ALTER TABLE public.billing_orders DROP CONSTRAINT billing_orders_amount_check,
  ADD CONSTRAINT billing_orders_amount_check CHECK (amount BETWEEN 100 AND 100000 AND (plan IS NOT NULL OR amount = 2900)),
  ADD CONSTRAINT billing_orders_plan_provider_check CHECK (plan IS NULL OR provider = 'dodo'),
  ADD CONSTRAINT billing_orders_id_user_key UNIQUE (id, user_id);
-- Refund ledgers are kept in the order's own price units, which can now exceed $29.
ALTER TABLE public.billing_payments DROP CONSTRAINT billing_payments_refund_amount_check,
  ADD CONSTRAINT billing_payments_refund_amount_check CHECK (refund_amount BETWEEN 0 AND 100000);
ALTER TABLE public.billing_refund_adjustments DROP CONSTRAINT billing_refund_adjustments_amount_check,
  ADD CONSTRAINT billing_refund_adjustments_amount_check CHECK (amount BETWEEN 1 AND 100000);

CREATE TABLE public.jobvance_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL REFERENCES public.jobvance_pass_plans(plan),
  -- One pass per paid order: the unique order makes granting idempotent.
  billing_order_id uuid NOT NULL UNIQUE,
  billing_mode text NOT NULL CHECK (billing_mode IN ('test','live')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  quota integer NOT NULL CHECK (quota BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','refunded')),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (billing_order_id, user_id) REFERENCES public.billing_orders(id, user_id) ON DELETE CASCADE,
  CHECK (expires_at > starts_at),
  CHECK ((status = 'refunded') = (refunded_at IS NOT NULL))
);
CREATE INDEX jobvance_passes_user_active ON public.jobvance_passes(user_id, billing_mode, expires_at) WHERE status = 'active';

-- Which pass paid for a reservation. Null for free and guest use.
ALTER TABLE public.jobvance_tailor_usage ADD COLUMN pass_id uuid REFERENCES public.jobvance_passes(id) ON DELETE SET NULL;
CREATE INDEX jobvance_tailor_usage_pass ON public.jobvance_tailor_usage(pass_id) WHERE pass_id IS NOT NULL;
CREATE INDEX jobvance_tailor_usage_user_month ON public.jobvance_tailor_usage(user_id, month) WHERE user_id IS NOT NULL;

ALTER TABLE public.jobvance_pass_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_passes ENABLE ROW LEVEL SECURITY;
-- Like every billing table, passes are read through the authenticated get-entitlement function only.
REVOKE ALL ON public.jobvance_pass_plans, public.jobvance_passes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jobvance_pass_plans, public.jobvance_passes TO service_role;

DROP FUNCTION public.jobvance_begin_checkout(uuid,uuid,text,text);
CREATE FUNCTION public.jobvance_begin_checkout(p_user_id uuid, p_request_id uuid, p_provider text DEFAULT 'paddle', p_billing_mode text DEFAULT 'test', p_plan text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders; plan_row public.jobvance_pass_plans;
BEGIN
  PERFORM public.jobvance_ensure_account(p_user_id);
  IF p_provider NOT IN ('paddle','stripe','dodo') OR p_billing_mode NOT IN ('test','live') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  IF p_plan IS NOT NULL THEN
    SELECT * INTO plan_row FROM public.jobvance_pass_plans WHERE plan = p_plan AND active;
    IF NOT FOUND OR p_provider <> 'dodo' THEN RAISE EXCEPTION 'INVALID_PLAN' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF result.provider <> p_provider OR result.billing_mode <> p_billing_mode OR result.plan IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    RETURN to_jsonb(result) || jsonb_build_object('creationClaimAcquired',false);
  END IF;
  IF (SELECT count(*) FROM public.billing_orders WHERE user_id = p_user_id AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'CHECKOUT_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_orders(user_id,request_id,provider,billing_mode,checkout_creation_claimed,plan,amount)
    VALUES(p_user_id,p_request_id,p_provider,p_billing_mode,true,p_plan,COALESCE(plan_row.price_cents,2900));
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id;
  RETURN to_jsonb(result) || jsonb_build_object('creationClaimAcquired',true);
END $$;

DROP FUNCTION public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text);
CREATE FUNCTION public.jobvance_finish_checkout(p_user_id uuid,p_request_id uuid,p_session_id text,p_url text,p_expires_at timestamptz,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test',p_plan text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders;
BEGIN
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR result.provider <> p_provider OR result.billing_mode <> p_billing_mode OR result.plan IS DISTINCT FROM p_plan OR
    (result.checkout_session_id IS NOT NULL AND result.checkout_session_id <> p_session_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  IF p_provider = 'paddle' AND p_session_id !~ '^txn_[a-z0-9]{26}$' THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  -- A Dodo order stores the hosted session it was given; the payment ID only exists after payment.
  IF p_provider = 'dodo' AND (p_session_id IS NULL OR p_session_id !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR p_url IS NULL OR
    p_url !~ CASE p_billing_mode WHEN 'live' THEN '^https://checkout\.dodopayments\.com/' ELSE '^https://test\.checkout\.dodopayments\.com/' END) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.billing_orders SET checkout_session_id = p_session_id, checkout_url = p_url, checkout_expires_at = p_expires_at,
    payment_intent = CASE WHEN p_provider = 'paddle' THEN 'paddle_' || p_session_id ELSE payment_intent END WHERE id = result.id;
END $$;

-- p_paid_amount and p_paid_tax are the processor's total and tax in cents. A Dodo plan order cannot
-- be paid without them, and the plan always comes from the bound order, never from the event.
DROP FUNCTION public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text);
CREATE FUNCTION public.jobvance_apply_payment_event(p_event_id text,p_event_type text,p_event_created bigint,p_action text,p_user_id uuid,p_request_id uuid,p_payment_intent text,p_session_id text,p_refund_amount integer,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test',p_refund_id text DEFAULT NULL,p_paid_amount integer DEFAULT NULL,p_paid_tax integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inserted text; order_row public.billing_orders; payment public.billing_payments; happened timestamptz; refund_total integer;
  plan_row public.jobvance_pass_plans; stack_from timestamptz;
BEGIN
  IF p_action IS NULL OR p_provider IS NULL OR p_billing_mode IS NULL OR p_event_id IS NULL OR p_payment_intent IS NULL OR p_event_created IS NULL OR p_refund_amount IS NULL OR
    p_action NOT IN ('paid','refund') OR p_provider NOT IN ('paddle','stripe','dodo') OR p_billing_mode NOT IN ('test','live') OR
    (p_provider = 'stripe' AND (p_event_id !~ '^evt_[A-Za-z0-9]+$' OR p_payment_intent !~ '^pi_[A-Za-z0-9]+$')) OR
    (p_provider = 'paddle' AND (p_event_id !~ '^paddle_evt_[a-z0-9]{26}$' OR p_payment_intent !~ '^paddle_txn_[a-z0-9]{26}$' OR (p_action = 'refund' AND (p_refund_id IS NULL OR p_refund_id !~ '^paddle_adj_[a-z0-9]{26}$')))) OR
    (p_provider = 'dodo' AND (p_event_id !~ '^dodo_[A-Za-z0-9_.:-]{1,200}$' OR p_payment_intent !~ '^dodo_pay_[A-Za-z0-9_-]{1,100}$' OR p_session_id IS NULL OR p_session_id !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR
      (p_action = 'refund' AND (p_refund_id IS NULL OR p_refund_id !~ '^dodo_ref_[A-Za-z0-9_-]{1,100}$')))) OR
    p_event_created < 0 OR p_refund_amount NOT BETWEEN 0 AND 100000 OR (p_action = 'refund' AND p_refund_amount = 0) OR
    (p_paid_amount IS NOT NULL AND p_paid_amount NOT BETWEEN 0 AND 1000000) OR (p_paid_tax IS NOT NULL AND (p_paid_amount IS NULL OR p_paid_tax NOT BETWEEN 0 AND p_paid_amount)) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_payment_events(event_id,event_type,event_created) VALUES(p_event_id,p_event_type,p_event_created) ON CONFLICT DO NOTHING RETURNING event_id INTO inserted;
  IF inserted IS NULL THEN RETURN jsonb_build_object('duplicate',true); END IF;
  -- Account deletion makes old paid events irrelevant; acknowledge without recreating PII.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN jsonb_build_object('duplicate',false,'accountDeleted',true); END IF;
  -- Also takes this account's billing lock, so pass stacking below is computed one grant at a time.
  PERFORM public.jobvance_ensure_account(p_user_id);
  happened := to_timestamp(p_event_created);
  IF p_provider = 'paddle' AND NOT EXISTS(SELECT 1 FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id AND provider = p_provider AND billing_mode = p_billing_mode AND payment_intent = p_payment_intent) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  -- Dodo static payment links accept arbitrary metadata, so only a hosted session that the
  -- authenticated backend created and stored for this exact order may grant or revoke access.
  IF p_provider = 'dodo' AND NOT EXISTS(SELECT 1 FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id AND provider = p_provider AND billing_mode = p_billing_mode AND checkout_session_id = p_session_id) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_orders(user_id,request_id,provider,billing_mode) VALUES(p_user_id,p_request_id,p_provider,p_billing_mode) ON CONFLICT(user_id,request_id) DO NOTHING;
  SELECT * INTO order_row FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF order_row.provider <> p_provider OR order_row.billing_mode <> p_billing_mode OR (order_row.payment_intent IS NOT NULL AND order_row.payment_intent <> p_payment_intent) OR
     (p_session_id IS NOT NULL AND order_row.checkout_session_id IS NOT NULL AND order_row.checkout_session_id <> p_session_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  IF p_refund_amount > order_row.amount THEN RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001'; END IF;
  IF order_row.plan IS NOT NULL THEN
    SELECT * INTO plan_row FROM public.jobvance_pass_plans WHERE plan = order_row.plan;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001'; END IF;
  END IF;
  -- A paid Dodo event must carry this order's price, either as the total or as the total less tax
  -- (Dodo is the merchant of record and may include tax or add it on top).
  IF p_action = 'paid' AND p_provider = 'dodo' AND (p_paid_amount IS NOT NULL OR order_row.plan IS NOT NULL) AND
    (p_paid_amount IS NULL OR (p_paid_amount <> order_row.amount AND p_paid_amount - COALESCE(p_paid_tax,0) <> order_row.amount)) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_payments(payment_intent,user_id,request_id,provider,billing_mode) VALUES(p_payment_intent,p_user_id,p_request_id,p_provider,p_billing_mode) ON CONFLICT DO NOTHING;
  SELECT * INTO payment FROM public.billing_payments WHERE payment_intent = p_payment_intent FOR UPDATE;
  IF payment.user_id <> p_user_id OR payment.request_id <> p_request_id OR payment.provider <> p_provider OR payment.billing_mode <> p_billing_mode THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.billing_orders SET payment_intent = p_payment_intent, checkout_session_id = COALESCE(checkout_session_id,p_session_id) WHERE id = order_row.id;
  IF p_action = 'refund' THEN
    refund_total := p_refund_amount;
    IF p_provider IN ('paddle','dodo') THEN
      INSERT INTO public.billing_refund_adjustments(adjustment_id,payment_intent,amount) VALUES(p_refund_id,p_payment_intent,p_refund_amount) ON CONFLICT DO NOTHING;
      IF NOT EXISTS(SELECT 1 FROM public.billing_refund_adjustments WHERE adjustment_id = p_refund_id AND payment_intent = p_payment_intent AND amount = p_refund_amount) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
      SELECT sum(amount)::integer INTO refund_total FROM public.billing_refund_adjustments WHERE payment_intent = p_payment_intent;
      IF refund_total > order_row.amount THEN RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001'; END IF;
    END IF;
    UPDATE public.billing_payments SET refunded_at = COALESCE(refunded_at,happened), refund_amount = greatest(refund_amount,refund_total) WHERE payment_intent = p_payment_intent;
    UPDATE public.billing_credit_grants SET revoked_at = COALESCE(revoked_at,happened) WHERE user_id = p_user_id AND kind = 'paid' AND source_id = p_payment_intent;
    -- Any refund, full or partial, revokes the pass bought with this order and its remaining quota.
    UPDATE public.jobvance_passes SET status = 'refunded', refunded_at = COALESCE(refunded_at,happened) WHERE billing_order_id = order_row.id;
    UPDATE public.billing_orders SET status = 'refunded' WHERE id = order_row.id;
  ELSE
    UPDATE public.billing_payments SET paid_at = COALESCE(paid_at,happened) WHERE payment_intent = p_payment_intent;
    IF payment.refunded_at IS NULL THEN
      IF order_row.plan IS NULL THEN
        INSERT INTO public.billing_credit_grants(user_id,kind,source_id,credits_total,expires_at,provider,billing_mode)
          VALUES(p_user_id,'paid',p_payment_intent,10,COALESCE(payment.paid_at,happened) + interval '30 days',p_provider,p_billing_mode) ON CONFLICT(user_id,kind,source_id) DO NOTHING;
      ELSE
        -- Stack after the latest pass that is still usable, so buying again never wastes days already bought.
        SELECT max(p.expires_at) INTO stack_from FROM public.jobvance_passes p
          WHERE p.user_id = p_user_id AND p.billing_mode = p_billing_mode AND p.status = 'active' AND p.expires_at > now()
            AND p.quota > (SELECT count(*) FROM public.jobvance_tailor_usage u WHERE u.pass_id = p.id AND (u.status <> 'settled' OR u.actual_micros > 0));
        INSERT INTO public.jobvance_passes(user_id,plan,billing_order_id,billing_mode,starts_at,expires_at,quota)
          VALUES(p_user_id,plan_row.plan,order_row.id,p_billing_mode,now(),greatest(now(),COALESCE(stack_from,now())) + make_interval(days => plan_row.days),plan_row.tailor_quota)
          ON CONFLICT (billing_order_id) DO NOTHING;
      END IF;
      UPDATE public.billing_orders SET status = 'paid' WHERE id = order_row.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('duplicate',false);
END $$;

DROP FUNCTION public.jobvance_tailor_reserve(uuid, text, text, text, text, bigint, integer, integer, integer, bigint);
CREATE FUNCTION public.jobvance_tailor_reserve(
  p_user uuid, p_rate_hash text, p_request text, p_provider text, p_model text, p_micros bigint,
  p_billing_mode text DEFAULT 'test', p_free_monthly integer DEFAULT 3, p_pass_daily integer DEFAULT 40,
  p_guest_daily integer DEFAULT 1, p_guest_global_daily integer DEFAULT 200, p_cap_micros bigint DEFAULT 50000000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing public.jobvance_tailor_usage; created public.jobvance_tailor_usage; chosen public.jobvance_passes;
  month_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  today date := (now() AT TIME ZONE 'UTC')::date;
  effective_cap bigint; spend_limit bigint; used integer; tier text;
BEGIN
  IF p_micros IS NULL OR p_cap_micros IS NULL OR p_micros NOT BETWEEN 1 AND 500000 OR p_cap_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  IF p_request IS NULL OR p_billing_mode IS NULL OR p_billing_mode NOT IN ('test','live') OR p_free_monthly IS NULL OR p_pass_daily IS NULL OR p_guest_daily IS NULL OR p_guest_global_daily IS NULL OR
    least(p_free_monthly, p_pass_daily, p_guest_daily, p_guest_global_daily) < 0 THEN RAISE EXCEPTION 'TAILOR_INVALID'; END IF;
  IF p_user IS NULL AND (p_rate_hash IS NULL OR p_rate_hash !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'TAILOR_INVALID'; END IF;
  -- One lock serialises spending, quota counts and replays with every other Jobvance reservation.
  INSERT INTO public.job_loop_budget_months(month) VALUES (month_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.job_loop_budget_months WHERE month = month_key FOR UPDATE;
  SELECT * INTO existing FROM public.jobvance_tailor_usage WHERE request_id = p_request;
  IF FOUND THEN
    IF existing.user_id IS DISTINCT FROM p_user OR (p_user IS NULL AND existing.rate_hash IS DISTINCT FROM p_rate_hash) THEN RAISE EXCEPTION 'TAILOR_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(existing) || jsonb_build_object('is_new', false, 'tier', CASE WHEN existing.pass_id IS NOT NULL THEN 'pass' WHEN existing.user_id IS NOT NULL THEN 'free' ELSE 'guest' END);
  END IF;
  SELECT least(p_cap_micros, monthly_cap_micros) INTO effective_cap FROM public.jobvance_admin_config WHERE singleton;
  IF effective_cap IS NULL THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  IF p_user IS NOT NULL THEN
    -- Paid quota first: the soonest-expiring pass that is unrefunded, unexpired and has quota left.
    SELECT p.* INTO chosen FROM public.jobvance_passes p
      WHERE p.user_id = p_user AND p.billing_mode = p_billing_mode AND p.status = 'active' AND p.expires_at > now()
        AND p.quota > (SELECT count(*) FROM public.jobvance_tailor_usage u WHERE u.pass_id = p.id AND (u.status <> 'settled' OR u.actual_micros > 0))
      ORDER BY p.expires_at, p.created_at, p.id LIMIT 1 FOR UPDATE OF p;
    IF FOUND THEN
      SELECT count(*) INTO used FROM public.jobvance_tailor_usage u WHERE u.user_id = p_user AND u.day = today AND (u.status <> 'settled' OR u.actual_micros > 0);
      IF used >= p_pass_daily THEN RAISE EXCEPTION 'TAILOR_PASS_DAILY_LIMIT'; END IF;
      tier := 'pass';
    ELSE
      SELECT count(*) INTO used FROM public.jobvance_tailor_usage u WHERE u.user_id = p_user AND u.pass_id IS NULL AND u.month = month_key AND (u.status <> 'settled' OR u.actual_micros > 0);
      IF used >= p_free_monthly THEN RAISE EXCEPTION 'TAILOR_FREE_LIMIT'; END IF;
      tier := 'free';
    END IF;
  ELSE
    SELECT count(*) INTO used FROM public.jobvance_tailor_usage u WHERE u.user_id IS NULL AND u.rate_hash = p_rate_hash AND u.day = today AND (u.status <> 'settled' OR u.actual_micros > 0);
    IF used >= p_guest_daily THEN RAISE EXCEPTION 'TAILOR_GUEST_LIMIT'; END IF;
    SELECT count(*) INTO used FROM public.jobvance_tailor_usage u WHERE u.user_id IS NULL AND u.day = today AND (u.status <> 'settled' OR u.actual_micros > 0);
    IF used >= p_guest_global_daily THEN RAISE EXCEPTION 'TAILOR_GUEST_CAPACITY'; END IF;
    tier := 'guest';
  END IF;
  -- Free and guest use stops at 80% of the cap, keeping the rest for paying users. Nothing exceeds the cap.
  spend_limit := CASE WHEN tier = 'pass' THEN effective_cap ELSE effective_cap * 4 / 5 END;
  UPDATE public.job_loop_budget_months SET committed_micros = committed_micros + p_micros
    WHERE month = month_key AND committed_micros + p_micros <= spend_limit;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  INSERT INTO public.jobvance_tailor_usage (month, day, user_id, rate_hash, request_id, provider, model, reserved_micros, pass_id)
    VALUES (month_key, today, p_user, CASE WHEN p_user IS NULL THEN p_rate_hash END, p_request, p_provider, p_model, p_micros, chosen.id)
    RETURNING * INTO created;
  RETURN to_jsonb(created) || jsonb_build_object('is_new', true, 'tier', tier);
END $$;

-- The signed-in summary shown on the Pricing page, Applications home and workspace.
CREATE FUNCTION public.jobvance_get_tailor_access(p_user_id uuid, p_billing_mode text DEFAULT 'test', p_free_monthly integer DEFAULT 3, p_pass_daily integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  month_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  today date := (now() AT TIME ZONE 'UTC')::date;
  free_used integer; used_today integer; passes jsonb; paid_remaining integer;
BEGIN
  IF p_user_id IS NULL OR p_billing_mode IS NULL OR p_billing_mode NOT IN ('test','live') OR p_free_monthly IS NULL OR p_pass_daily IS NULL OR least(p_free_monthly, p_pass_daily) < 0 THEN
    RAISE EXCEPTION 'TAILOR_INVALID';
  END IF;
  SELECT count(*) INTO free_used FROM public.jobvance_tailor_usage u WHERE u.user_id = p_user_id AND u.pass_id IS NULL AND u.month = month_key AND (u.status <> 'settled' OR u.actual_micros > 0);
  SELECT count(*) INTO used_today FROM public.jobvance_tailor_usage u WHERE u.user_id = p_user_id AND u.day = today AND (u.status <> 'settled' OR u.actual_micros > 0);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('plan', a.plan, 'name', a.name, 'expiresAt', a.expires_at, 'quota', a.quota, 'used', a.used, 'remaining', a.quota - a.used)
      ORDER BY a.expires_at, a.created_at, a.id), '[]'::jsonb), COALESCE(sum(a.quota - a.used), 0)::integer
    INTO passes, paid_remaining
    FROM (SELECT p.id, p.plan, plan_row.name, p.expires_at, p.quota, p.created_at,
            (SELECT count(*)::integer FROM public.jobvance_tailor_usage u WHERE u.pass_id = p.id AND (u.status <> 'settled' OR u.actual_micros > 0)) AS used
          FROM public.jobvance_passes p JOIN public.jobvance_pass_plans plan_row ON plan_row.plan = p.plan
          WHERE p.user_id = p_user_id AND p.billing_mode = p_billing_mode AND p.status = 'active' AND p.expires_at > now()) a
    WHERE a.used < a.quota;
  RETURN jsonb_build_object('freeMonthlyLimit', p_free_monthly, 'freeUsedThisMonth', free_used, 'freeRemainingThisMonth', greatest(p_free_monthly - free_used, 0),
    'passes', passes, 'paidRemaining', paid_remaining, 'dailyLimit', p_pass_daily, 'usedToday', used_today);
END $$;

-- Dropped and recreated functions start with default privileges; restate the boundary explicitly.
REVOKE ALL ON FUNCTION public.jobvance_begin_checkout(uuid,uuid,text,text,text),
  public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text,text),
  public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text,integer,integer),
  public.jobvance_tailor_reserve(uuid,text,text,text,text,bigint,text,integer,integer,integer,integer,bigint),
  public.jobvance_get_tailor_access(uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_begin_checkout(uuid,uuid,text,text,text),
  public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text,text),
  public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text,integer,integer),
  public.jobvance_tailor_reserve(uuid,text,text,text,text,bigint,text,integer,integer,integer,integer,bigint),
  public.jobvance_get_tailor_access(uuid,text,integer,integer) TO service_role;

COMMIT;
