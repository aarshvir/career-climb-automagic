-- Additive billing migration: allow Dodo Payments as a third provider beside Paddle and Stripe.
-- Written for review only. Billing stays disabled until JOBVANCE_BILLING_ENABLED=true and
-- JOBVANCE_PAYMENT_PROVIDER=dodo are set. Apply once through the reviewed process.
-- Constraints are dropped by their exact names, without IF EXISTS, so an unexpected schema
-- aborts the whole transaction instead of leaving an old provider check in place.
BEGIN;

ALTER TABLE public.billing_orders DROP CONSTRAINT billing_orders_provider_check,
  ADD CONSTRAINT billing_orders_provider_check CHECK (provider IN ('paddle','stripe','dodo'));
ALTER TABLE public.billing_payments DROP CONSTRAINT billing_payments_provider_check,
  ADD CONSTRAINT billing_payments_provider_check CHECK (provider IN ('paddle','stripe','dodo'));
ALTER TABLE public.billing_credit_grants DROP CONSTRAINT billing_credit_grants_provider_check,
  ADD CONSTRAINT billing_credit_grants_provider_check CHECK (provider IN ('paddle','stripe','dodo'));
-- Dodo refunds share the per-refund ledger, so partial refunds are deduplicated and capped like Paddle's.
ALTER TABLE public.billing_refund_adjustments DROP CONSTRAINT billing_refund_adjustments_adjustment_id_check,
  ADD CONSTRAINT billing_refund_adjustments_adjustment_id_check CHECK (adjustment_id ~ '^paddle_adj_[a-z0-9]{26}$' OR adjustment_id ~ '^dodo_ref_[A-Za-z0-9_-]{1,100}$');

CREATE OR REPLACE FUNCTION public.jobvance_begin_checkout(p_user_id uuid, p_request_id uuid, p_provider text DEFAULT 'paddle', p_billing_mode text DEFAULT 'test') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders;
BEGIN
  PERFORM public.jobvance_ensure_account(p_user_id);
  IF p_provider NOT IN ('paddle','stripe','dodo') OR p_billing_mode NOT IN ('test','live') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF result.provider <> p_provider OR result.billing_mode <> p_billing_mode THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    RETURN to_jsonb(result) || jsonb_build_object('creationClaimAcquired',false);
  END IF;
  IF (SELECT count(*) FROM public.billing_orders WHERE user_id = p_user_id AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'CHECKOUT_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_orders(user_id,request_id,provider,billing_mode,checkout_creation_claimed) VALUES(p_user_id,p_request_id,p_provider,p_billing_mode,true);
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id;
  RETURN to_jsonb(result) || jsonb_build_object('creationClaimAcquired',true);
END $$;

CREATE OR REPLACE FUNCTION public.jobvance_finish_checkout(p_user_id uuid,p_request_id uuid,p_session_id text,p_url text,p_expires_at timestamptz,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders;
BEGIN
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR result.provider <> p_provider OR result.billing_mode <> p_billing_mode OR (result.checkout_session_id IS NOT NULL AND result.checkout_session_id <> p_session_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  IF p_provider = 'paddle' AND p_session_id !~ '^txn_[a-z0-9]{26}$' THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  -- A Dodo order stores the hosted session it was given; the payment ID only exists after payment.
  IF p_provider = 'dodo' AND (p_session_id IS NULL OR p_session_id !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR p_url IS NULL OR
    p_url !~ CASE p_billing_mode WHEN 'live' THEN '^https://checkout\.dodopayments\.com/' ELSE '^https://test\.checkout\.dodopayments\.com/' END) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.billing_orders SET checkout_session_id = p_session_id, checkout_url = p_url, checkout_expires_at = p_expires_at,
    payment_intent = CASE WHEN p_provider = 'paddle' THEN 'paddle_' || p_session_id ELSE payment_intent END WHERE id = result.id;
END $$;

CREATE OR REPLACE FUNCTION public.jobvance_apply_payment_event(p_event_id text,p_event_type text,p_event_created bigint,p_action text,p_user_id uuid,p_request_id uuid,p_payment_intent text,p_session_id text,p_refund_amount integer,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test',p_refund_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inserted text; order_row public.billing_orders; payment public.billing_payments; happened timestamptz; refund_total integer;
BEGIN
  IF p_action IS NULL OR p_provider IS NULL OR p_billing_mode IS NULL OR p_event_id IS NULL OR p_payment_intent IS NULL OR p_event_created IS NULL OR p_refund_amount IS NULL OR
    p_action NOT IN ('paid','refund') OR p_provider NOT IN ('paddle','stripe','dodo') OR p_billing_mode NOT IN ('test','live') OR
    (p_provider = 'stripe' AND (p_event_id !~ '^evt_[A-Za-z0-9]+$' OR p_payment_intent !~ '^pi_[A-Za-z0-9]+$')) OR
    (p_provider = 'paddle' AND (p_event_id !~ '^paddle_evt_[a-z0-9]{26}$' OR p_payment_intent !~ '^paddle_txn_[a-z0-9]{26}$' OR (p_action = 'refund' AND (p_refund_id IS NULL OR p_refund_id !~ '^paddle_adj_[a-z0-9]{26}$')))) OR
    (p_provider = 'dodo' AND (p_event_id !~ '^dodo_[A-Za-z0-9_.:-]{1,200}$' OR p_payment_intent !~ '^dodo_pay_[A-Za-z0-9_-]{1,100}$' OR p_session_id IS NULL OR p_session_id !~ '^cks_[A-Za-z0-9_-]{1,100}$' OR
      (p_action = 'refund' AND (p_refund_id IS NULL OR p_refund_id !~ '^dodo_ref_[A-Za-z0-9_-]{1,100}$')))) OR
    p_event_created < 0 OR p_refund_amount NOT BETWEEN 0 AND 2900 OR (p_action = 'refund' AND p_refund_amount = 0) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_payment_events(event_id,event_type,event_created) VALUES(p_event_id,p_event_type,p_event_created) ON CONFLICT DO NOTHING RETURNING event_id INTO inserted;
  IF inserted IS NULL THEN RETURN jsonb_build_object('duplicate',true); END IF;
  -- Account deletion makes old paid events irrelevant; acknowledge without recreating PII.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN jsonb_build_object('duplicate',false,'accountDeleted',true); END IF;
  PERFORM public.jobvance_ensure_account(p_user_id);
  happened := to_timestamp(p_event_created);
  IF p_provider = 'paddle' AND NOT EXISTS(SELECT 1 FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id AND provider = p_provider AND billing_mode = p_billing_mode AND payment_intent = p_payment_intent) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  -- Dodo static payment links accept arbitrary metadata, so only a hosted session that the
  -- authenticated backend created and stored for this exact order may grant or revoke credits.
  IF p_provider = 'dodo' AND NOT EXISTS(SELECT 1 FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id AND provider = p_provider AND billing_mode = p_billing_mode AND checkout_session_id = p_session_id) THEN
    RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.billing_orders(user_id,request_id,provider,billing_mode) VALUES(p_user_id,p_request_id,p_provider,p_billing_mode) ON CONFLICT(user_id,request_id) DO NOTHING;
  SELECT * INTO order_row FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF order_row.provider <> p_provider OR order_row.billing_mode <> p_billing_mode OR (order_row.payment_intent IS NOT NULL AND order_row.payment_intent <> p_payment_intent) OR
     (p_session_id IS NOT NULL AND order_row.checkout_session_id IS NOT NULL AND order_row.checkout_session_id <> p_session_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
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
      IF refund_total > 2900 THEN RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = 'P0001'; END IF;
    END IF;
    UPDATE public.billing_payments SET refunded_at = COALESCE(refunded_at,happened), refund_amount = greatest(refund_amount,refund_total) WHERE payment_intent = p_payment_intent;
    UPDATE public.billing_credit_grants SET revoked_at = COALESCE(revoked_at,happened) WHERE user_id = p_user_id AND kind = 'paid' AND source_id = p_payment_intent;
    UPDATE public.billing_orders SET status = 'refunded' WHERE id = order_row.id;
  ELSE
    UPDATE public.billing_payments SET paid_at = COALESCE(paid_at,happened) WHERE payment_intent = p_payment_intent;
    IF payment.refunded_at IS NULL THEN
      INSERT INTO public.billing_credit_grants(user_id,kind,source_id,credits_total,expires_at,provider,billing_mode)
        VALUES(p_user_id,'paid',p_payment_intent,10,COALESCE(payment.paid_at,happened) + interval '30 days',p_provider,p_billing_mode) ON CONFLICT(user_id,kind,source_id) DO NOTHING;
      UPDATE public.billing_orders SET status = 'paid' WHERE id = order_row.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('duplicate',false);
END $$;

-- CREATE OR REPLACE keeps existing privileges; restate them so the boundary is explicit.
REVOKE ALL ON FUNCTION public.jobvance_begin_checkout(uuid,uuid,text,text),public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text),public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_begin_checkout(uuid,uuid,text,text),public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text),public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text) TO service_role;

COMMIT;
