BEGIN;

-- Dodo can express a localized subscription's provider accounting in USD while
-- the actual customer invoice remains in its quoted local currency. These
-- immutable API evidence anchors never grant access or perform FX conversion.
CREATE TABLE jobvance_private.loop_provider_accounting (
  mode text NOT NULL CHECK(mode IN('test','live')),
  payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9_-]{1,100}$'),
  user_id uuid NOT NULL,request_id uuid NOT NULL,
  quote_id uuid NOT NULL REFERENCES jobvance_private.loop_price_quotes(quote_id),
  subscription_id text NOT NULL CHECK(subscription_id ~ '^sub_[A-Za-z0-9_-]{1,100}$'),
  customer_id text NOT NULL CHECK(customer_id ~ '^cus_[A-Za-z0-9_-]{1,100}$'),
  currency text NOT NULL CHECK(currency<>'USD'),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),
  settlement_currency text CHECK(settlement_currency IS NULL OR settlement_currency ~ '^[A-Z]{3}$'),
  settlement_amount_minor bigint CHECK(settlement_amount_minor IS NULL OR settlement_amount_minor BETWEEN 0 AND 1000000000),
  settlement_tax_minor bigint CHECK(settlement_tax_minor IS NULL OR settlement_tax_minor BETWEEN 0 AND 1000000000),
  accounting_currency text NOT NULL CHECK(accounting_currency='USD'),
  accounting_amount_minor bigint NOT NULL CHECK(accounting_amount_minor BETWEEN 1 AND 1000000000),
  period_start timestamptz NOT NULL,valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(mode,payment_id),
  FOREIGN KEY(user_id,request_id) REFERENCES jobvance_private.loop_billing_orders(user_id,request_id) ON DELETE CASCADE,
  CHECK((settlement_currency IS NULL)=(settlement_amount_minor IS NULL)),
  CHECK(settlement_tax_minor IS NULL OR settlement_currency IS NOT NULL),
  CHECK(isfinite(period_start) AND isfinite(valid_until) AND period_start<valid_until AND valid_until<=period_start+interval '35 days')
);
CREATE INDEX loop_provider_accounting_order ON jobvance_private.loop_provider_accounting(user_id,request_id,mode,period_start,payment_id);
ALTER TABLE jobvance_private.loop_provider_accounting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_provider_accounting FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.immutable_loop_accounting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_IMMUTABLE'; END $$;
CREATE TRIGGER loop_provider_accounting_immutable BEFORE UPDATE ON jobvance_private.loop_provider_accounting FOR EACH ROW EXECUTE FUNCTION jobvance_private.immutable_loop_accounting();

CREATE FUNCTION jobvance_private.loop_accounting_json(a jobvance_private.loop_provider_accounting) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('paymentId',a.payment_id,'subscriptionId',a.subscription_id,'customerId',a.customer_id,'quoteId',a.quote_id,'currency',a.currency,'amountMinor',a.amount_minor,'accountingCurrency',a.accounting_currency,'accountingAmountMinor',a.accounting_amount_minor,'settlementCurrency',a.settlement_currency,'settlementAmountMinor',a.settlement_amount_minor,'settlementTaxMinor',a.settlement_tax_minor,'periodStart',a.period_start,'validUntil',a.valid_until)
$$;

CREATE FUNCTION public.job_loop_billing_accounting_bind(p_user uuid,p_request uuid,p_mode text,p_quote uuid,p_subscription text,p_customer text,p_payment text,p_currency text,p_amount bigint,
 p_settlement_currency text,p_settlement_amount bigint,p_settlement_tax bigint,p_accounting_currency text,p_accounting_amount bigint,p_period_start timestamptz,p_valid_until timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jobvance_private.loop_billing_orders;q jobvance_private.loop_price_quotes;s jobvance_private.loop_subscriptions;p jobvance_private.loop_subscription_periods;a jobvance_private.loop_provider_accounting;
BEGIN
  IF p_user IS NULL OR p_request IS NULL OR p_mode IS NULL OR p_mode NOT IN('test','live') OR p_quote IS NULL
    OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$' OR p_customer IS NULL OR p_customer !~ '^cus_[A-Za-z0-9_-]{1,100}$'
    OR p_payment IS NULL OR p_payment !~ '^pay_[A-Za-z0-9_-]{1,100}$' OR p_accounting_currency IS DISTINCT FROM 'USD'
    OR p_accounting_amount IS NULL OR p_accounting_amount NOT BETWEEN 1 AND 1000000000
    OR (p_settlement_currency IS NULL)<>(p_settlement_amount IS NULL) OR (p_settlement_currency IS NOT NULL AND p_settlement_currency !~ '^[A-Z]{3}$')
    OR (p_settlement_amount IS NOT NULL AND p_settlement_amount NOT BETWEEN 0 AND 1000000000) OR (p_settlement_tax IS NOT NULL AND (p_settlement_currency IS NULL OR p_settlement_tax NOT BETWEEN 0 AND 1000000000))
    OR p_period_start IS NULL OR p_valid_until IS NULL OR NOT isfinite(p_period_start) OR NOT isfinite(p_valid_until) OR p_period_start>=p_valid_until OR p_valid_until>p_period_start+interval '35 days'
    THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR o.mode IS DISTINCT FROM p_mode OR o.quote_id IS DISTINCT FROM p_quote OR o.session_id IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
  SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE quote_id=p_quote;
  IF NOT FOUND OR (q.user_id,q.mode,q.plan,q.product_id,q.currency,q.amount_minor) IS DISTINCT FROM (p_user,p_mode,o.plan,o.product_id,p_currency,p_amount) OR q.currency='USD' THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
  SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=p_subscription;
  IF FOUND AND (s.user_id,s.request_id,s.mode,s.quote_id,s.customer_id) IS DISTINCT FROM (p_user,p_request,p_mode,p_quote,p_customer) THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_provider_accounting b WHERE b.user_id=p_user AND b.request_id=p_request AND b.mode=p_mode AND (b.subscription_id,b.customer_id) IS DISTINCT FROM (p_subscription,p_customer)) THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
  SELECT * INTO p FROM jobvance_private.loop_subscription_periods WHERE mode=p_mode AND payment_id=p_payment;
  IF FOUND AND (p.subscription_id,p.quote_id,p.currency,p.amount,p.starts_at,p.ends_at) IS DISTINCT FROM (p_subscription,p_quote,p_currency,p_amount,p_period_start,p_valid_until) THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
  SELECT * INTO a FROM jobvance_private.loop_provider_accounting WHERE mode=p_mode AND payment_id=p_payment FOR UPDATE;
  IF FOUND THEN
    IF (a.user_id,a.request_id,a.quote_id,a.subscription_id,a.customer_id,a.currency,a.amount_minor,a.settlement_currency,a.settlement_amount_minor,a.settlement_tax_minor,a.accounting_currency,a.accounting_amount_minor,a.period_start,a.valid_until)
      IS DISTINCT FROM (p_user,p_request,p_quote,p_subscription,p_customer,p_currency,p_amount,p_settlement_currency,p_settlement_amount,p_settlement_tax,p_accounting_currency,p_accounting_amount,p_period_start,p_valid_until) THEN RAISE EXCEPTION 'LOOP_BILLING_ACCOUNTING_CONFLICT'; END IF;
    RETURN jobvance_private.loop_accounting_json(a);
  END IF;
  INSERT INTO jobvance_private.loop_provider_accounting(mode,payment_id,user_id,request_id,quote_id,subscription_id,customer_id,currency,amount_minor,settlement_currency,settlement_amount_minor,settlement_tax_minor,accounting_currency,accounting_amount_minor,period_start,valid_until)
    VALUES(p_mode,p_payment,p_user,p_request,p_quote,p_subscription,p_customer,p_currency,p_amount,p_settlement_currency,p_settlement_amount,p_settlement_tax,p_accounting_currency,p_accounting_amount,p_period_start,p_valid_until) RETURNING * INTO a;
  RETURN jobvance_private.loop_accounting_json(a);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_billing_order(p_user uuid,p_request uuid,p_mode text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(o)||jsonb_build_object('pricing',jobvance_private.loop_order_pricing(o),'providerAccounting',COALESCE((SELECT jsonb_agg(jobvance_private.loop_accounting_json(a) ORDER BY a.period_start,a.payment_id) FROM jobvance_private.loop_provider_accounting a WHERE a.user_id=o.user_id AND a.request_id=o.request_id AND a.mode=o.mode),'[]'::jsonb)) FROM jobvance_private.loop_billing_orders o WHERE user_id=p_user AND request_id=p_request AND mode=p_mode
$$;
REVOKE ALL ON FUNCTION public.job_loop_billing_accounting_bind(uuid,uuid,text,uuid,text,text,text,text,bigint,text,bigint,bigint,text,bigint,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_accounting_bind(uuid,uuid,text,uuid,text,text,text,text,bigint,text,bigint,bigint,text,bigint,timestamptz,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION jobvance_private.immutable_loop_accounting(),jobvance_private.loop_accounting_json(jobvance_private.loop_provider_accounting) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
