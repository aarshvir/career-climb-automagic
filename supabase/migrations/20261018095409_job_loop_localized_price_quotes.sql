BEGIN;

-- Monetary authority is append-only and independent of CV/Loop data. Existing
-- NULL-quote records keep their original USD contract and are never repriced.
CREATE TABLE jobvance_private.loop_price_revisions (
  mode text NOT NULL CHECK(mode IN('test','live')),catalog_version text NOT NULL,
  plan text NOT NULL CHECK(plan IN('weekly','three_weekly','daily')),
  product_id text NOT NULL CHECK(product_id ~ '^pdt_[A-Za-z0-9_-]{1,100}$'),
  currency text NOT NULL CHECK(currency IN('USD','EUR','GBP','INR','AED','CAD','AUD','SGD','JPY')),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),
  exponent smallint NOT NULL CHECK(exponent=CASE WHEN currency='JPY' THEN 0 ELSE 2 END),
  usd_base_minor bigint NOT NULL CHECK(usd_base_minor=CASE plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END),
  tax_inclusive boolean NOT NULL DEFAULT true CHECK(tax_inclusive),
  provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object'),
  active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mode,catalog_version,plan,currency)
);
CREATE UNIQUE INDEX loop_price_one_active_revision ON jobvance_private.loop_price_revisions(mode,plan,currency) WHERE active;

CREATE TABLE jobvance_private.loop_price_quotes (
  quote_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,auth_session uuid NOT NULL,generation bigint NOT NULL CHECK(generation>=0),
  mode text NOT NULL,catalog_version text NOT NULL,plan text NOT NULL,
  product_id text NOT NULL,country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
  currency text NOT NULL,amount_minor bigint NOT NULL,exponent smallint NOT NULL,
  localized_price_id text,provider_revision text NOT NULL CHECK(provider_revision ~ '^[a-f0-9]{64}$'),
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  initial_amount_minor bigint NOT NULL,recurring_amount_minor bigint NOT NULL,
  tax_inclusive boolean NOT NULL CHECK(tax_inclusive),
  created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  UNIQUE(user_id,request_id),FOREIGN KEY(mode,catalog_version,plan,currency) REFERENCES jobvance_private.loop_price_revisions(mode,catalog_version,plan,currency),
  CHECK(initial_amount_minor=amount_minor AND recurring_amount_minor=amount_minor),
  CHECK((currency='USD' AND localized_price_id IS NULL) OR (currency<>'USD' AND localized_price_id ~ '^lcp_[A-Za-z0-9_-]{1,100}$')),
  CHECK(isfinite(expires_at) AND expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
ALTER TABLE jobvance_private.loop_price_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_price_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_price_revisions,jobvance_private.loop_price_quotes FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE jobvance_private.loop_billing_orders ADD COLUMN quote_id uuid UNIQUE REFERENCES jobvance_private.loop_price_quotes(quote_id);
ALTER TABLE jobvance_private.loop_subscriptions ADD COLUMN quote_id uuid REFERENCES jobvance_private.loop_price_quotes(quote_id);
ALTER TABLE jobvance_private.loop_subscription_periods ADD COLUMN quote_id uuid REFERENCES jobvance_private.loop_price_quotes(quote_id),ADD COLUMN currency text NOT NULL DEFAULT 'USD' CHECK(currency IN('USD','EUR','GBP','INR','AED','CAD','AUD','SGD','JPY'));

CREATE FUNCTION jobvance_private.immutable_loop_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='loop_price_revisions' THEN
    IF (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN RAISE EXCEPTION 'LOOP_PRICE_IMMUTABLE'; END IF;
  ELSE RAISE EXCEPTION 'LOOP_PRICE_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loop_price_revision_immutable BEFORE UPDATE ON jobvance_private.loop_price_revisions FOR EACH ROW EXECUTE FUNCTION jobvance_private.immutable_loop_price();
CREATE TRIGGER loop_price_quote_immutable BEFORE UPDATE ON jobvance_private.loop_price_quotes FOR EACH ROW EXECUTE FUNCTION jobvance_private.immutable_loop_price();

CREATE FUNCTION jobvance_private.loop_quote_json(q jobvance_private.loop_price_quotes) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN q.quote_id IS NULL THEN NULL ELSE jsonb_build_object('quoteId',q.quote_id,'requestId',q.request_id,'generation',q.generation,'mode',q.mode,'plan',q.plan,'productId',q.product_id,'country',q.country,'currency',q.currency,'amountMinor',q.amount_minor,'exponent',q.exponent,'catalogVersion',q.catalog_version,'localizedPriceId',q.localized_price_id,'providerRevision',q.provider_revision,'previewHash',q.preview_hash,'fingerprint',q.fingerprint,'taxInclusive',q.tax_inclusive,'initialAmountMinor',q.initial_amount_minor,'recurringAmountMinor',q.recurring_amount_minor,'interval','month','expiresAt',q.expires_at) END
$$;
CREATE FUNCTION jobvance_private.loop_order_pricing(o jobvance_private.loop_billing_orders) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN o.quote_id IS NULL THEN jsonb_build_object('quoteId',NULL,'requestId',o.request_id,'generation',o.generation,'mode',o.mode,'plan',o.plan,'productId',o.product_id,'country',NULL,'currency','USD','amountMinor',CASE o.plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END,'exponent',2,'catalogVersion','legacy-usd-v1','localizedPriceId',NULL,'taxInclusive',true,'initialAmountMinor',CASE o.plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END,'recurringAmountMinor',CASE o.plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END,'interval','month','expiresAt',NULL)
 ELSE (SELECT jobvance_private.loop_quote_json(q) FROM jobvance_private.loop_price_quotes q WHERE q.quote_id=o.quote_id) END
$$;

CREATE FUNCTION jobvance_private.guard_loop_price_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jobvance_private.loop_price_quotes; o jobvance_private.loop_billing_orders; s jobvance_private.loop_subscriptions;
BEGIN
  IF TG_TABLE_NAME='loop_billing_orders' THEN
    IF TG_OP='UPDATE' AND OLD.quote_id IS NOT NULL AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN RAISE EXCEPTION 'LOOP_PRICE_IMMUTABLE'; END IF;
    IF NEW.quote_id IS NOT NULL THEN
      SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE quote_id=NEW.quote_id;
      IF NOT FOUND OR (q.user_id,q.auth_session,q.generation,q.mode,q.plan,q.product_id) IS DISTINCT FROM (NEW.user_id,NEW.auth_session,NEW.generation,NEW.mode,NEW.plan,NEW.product_id) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='loop_subscriptions' THEN
    SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=NEW.user_id AND request_id=NEW.request_id;
    IF NOT FOUND OR o.quote_id IS DISTINCT FROM NEW.quote_id THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  ELSE
    SELECT * INTO s FROM jobvance_private.loop_subscriptions WHERE subscription_id=NEW.subscription_id;
    IF NOT FOUND OR s.mode<>NEW.mode OR s.quote_id IS DISTINCT FROM NEW.quote_id THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
    SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=s.user_id AND request_id=s.request_id;
    IF NEW.quote_id IS NULL THEN
      IF NEW.currency<>'USD' OR NEW.amount<>(CASE s.plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END) THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
    ELSE
      SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE quote_id=NEW.quote_id;
      IF NEW.currency<>q.currency OR NEW.amount<>q.amount_minor THEN RAISE EXCEPTION 'LOOP_BILLING_PAYMENT_CONFLICT'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND (OLD.amount,OLD.currency,OLD.quote_id,OLD.subscription_id) IS DISTINCT FROM (NEW.amount,NEW.currency,NEW.quote_id,NEW.subscription_id) THEN RAISE EXCEPTION 'LOOP_PRICE_IMMUTABLE'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loop_order_price_binding BEFORE INSERT OR UPDATE OF quote_id ON jobvance_private.loop_billing_orders FOR EACH ROW EXECUTE FUNCTION jobvance_private.guard_loop_price_binding();
CREATE TRIGGER loop_subscription_price_binding BEFORE INSERT OR UPDATE OF quote_id ON jobvance_private.loop_subscriptions FOR EACH ROW EXECUTE FUNCTION jobvance_private.guard_loop_price_binding();
CREATE TRIGGER loop_period_price_binding BEFORE INSERT OR UPDATE OF amount,currency,quote_id,subscription_id ON jobvance_private.loop_subscription_periods FOR EACH ROW EXECUTE FUNCTION jobvance_private.guard_loop_price_binding();

CREATE FUNCTION public.job_loop_billing_quote_candidate(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_country text,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jobvance_private.loop_price_quotes; c jobvance_private.loop_price_revisions;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_request IS NULL OR p_country IS NULL OR p_country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_INVALID'; END IF;
  SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE user_id=p_user AND request_id=p_request;
  IF FOUND THEN
    IF (q.auth_session,q.generation,q.mode,q.plan,q.country,q.currency) IS DISTINCT FROM (p_auth_session,p_generation,p_mode,p_plan,p_country,p_currency) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
    RETURN jsonb_build_object('quote',jobvance_private.loop_quote_json(q),'catalog',NULL);
  END IF;
  SELECT * INTO c FROM jobvance_private.loop_price_revisions WHERE mode=p_mode AND plan=p_plan AND currency=p_currency AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_PRICE_UNAVAILABLE'; END IF;
  RETURN jsonb_build_object('quote',NULL,'catalog',jsonb_build_object('catalogVersion',c.catalog_version,'productId',c.product_id,'currency',c.currency,'amountMinor',c.amount_minor,'exponent',c.exponent,'plan',c.plan,'taxInclusive',true));
END $$;

CREATE FUNCTION public.job_loop_billing_quote_issue(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_country text,p_currency text,
 p_catalog_version text,p_product text,p_rule text,p_provider_revision text,p_preview_hash text,p_initial_amount bigint,p_recurring_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jobvance_private.loop_price_quotes; c jobvance_private.loop_price_revisions; at_time timestamptz:=now(); canonical jsonb;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  IF p_request IS NULL OR p_country IS NULL OR p_country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE user_id=p_user AND request_id=p_request;
  IF FOUND THEN
    IF (q.auth_session,q.generation,q.mode,q.plan,q.country,q.currency,q.catalog_version,q.product_id,q.localized_price_id,q.provider_revision,q.preview_hash,q.initial_amount_minor,q.recurring_amount_minor)
      IS DISTINCT FROM (p_auth_session,p_generation,p_mode,p_plan,p_country,p_currency,p_catalog_version,p_product,p_rule,p_provider_revision,p_preview_hash,p_initial_amount,p_recurring_amount) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
    RETURN jobvance_private.loop_quote_json(q);
  END IF;
  SELECT * INTO c FROM jobvance_private.loop_price_revisions WHERE mode=p_mode AND catalog_version=p_catalog_version AND plan=p_plan AND currency=p_currency AND active;
  IF NOT FOUND OR c.product_id IS DISTINCT FROM p_product OR p_initial_amount IS DISTINCT FROM c.amount_minor OR p_recurring_amount IS DISTINCT FROM c.amount_minor
    OR p_provider_revision IS NULL OR p_provider_revision !~ '^[a-f0-9]{64}$' OR p_preview_hash IS NULL OR p_preview_hash !~ '^[a-f0-9]{64}$'
    OR (p_currency='USD' AND p_rule IS NOT NULL) OR (p_currency<>'USD' AND (p_rule IS NULL OR p_rule !~ '^lcp_[A-Za-z0-9_-]{1,100}$')) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_INVALID'; END IF;
  canonical:=jsonb_build_object('owner',p_user,'session',p_auth_session,'generation',p_generation,'request',p_request,'mode',p_mode,'plan',p_plan,'country',p_country,'currency',p_currency,'catalog',p_catalog_version,'product',p_product,'rule',p_rule,'provider',p_provider_revision,'preview',p_preview_hash,'amount',c.amount_minor,'exponent',c.exponent,'created',at_time);
  INSERT INTO jobvance_private.loop_price_quotes(user_id,request_id,auth_session,generation,mode,catalog_version,plan,product_id,country,currency,amount_minor,exponent,localized_price_id,provider_revision,preview_hash,fingerprint,initial_amount_minor,recurring_amount_minor,tax_inclusive,created_at,expires_at)
    VALUES(p_user,p_request,p_auth_session,p_generation,p_mode,p_catalog_version,p_plan,p_product,p_country,p_currency,c.amount_minor,c.exponent,p_rule,p_provider_revision,p_preview_hash,encode(sha256(convert_to(canonical::text,'UTF8')),'hex'),p_initial_amount,p_recurring_amount,true,at_time,at_time+interval '15 minutes') RETURNING * INTO q;
  RETURN jobvance_private.loop_quote_json(q);
END $$;

CREATE FUNCTION public.job_loop_billing_quote_read(p_user uuid,p_auth_session uuid,p_generation bigint,p_mode text,p_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jobvance_private.loop_price_quotes;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE quote_id=p_quote AND user_id=p_user;
  IF NOT FOUND OR (q.auth_session,q.generation,q.mode) IS DISTINCT FROM (p_auth_session,p_generation,p_mode) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  RETURN jobvance_private.loop_quote_json(q);
END $$;



CREATE FUNCTION jobvance_private.claim_loop_price_checkout(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text,p_quote uuid)
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
    IF o.quote_id IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
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

CREATE OR REPLACE FUNCTION public.job_loop_billing_checkout_claim(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jobvance_private.claim_loop_price_checkout(p_user,p_auth_session,p_generation,p_request,p_mode,p_plan,p_product,NULL)
$$;

CREATE FUNCTION public.job_loop_billing_checkout_claim_v2(p_user uuid,p_auth_session uuid,p_generation bigint,p_request uuid,p_mode text,p_plan text,p_product text,p_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jobvance_private.loop_price_quotes; o jobvance_private.loop_billing_orders; result jsonb;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);PERFORM public.job_loop_billing_assert_session(p_user,p_auth_session);
  PERFORM pg_advisory_xact_lock(hashtextextended('loop-billing:'||p_user::text,0));
  SELECT * INTO q FROM jobvance_private.loop_price_quotes WHERE quote_id=p_quote AND user_id=p_user;
  IF NOT FOUND OR (q.auth_session,q.generation,q.mode,q.plan,q.product_id) IS DISTINCT FROM (p_auth_session,p_generation,p_mode,p_plan,p_product) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_billing_orders b WHERE b.quote_id=p_quote AND (b.user_id,b.request_id) IS DISTINCT FROM (p_user,p_request)) THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
  IF FOUND THEN
    IF o.quote_id IS DISTINCT FROM p_quote THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_CONFLICT'; END IF;
    IF o.state='failed' AND q.expires_at<=now() THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_EXPIRED'; END IF;
  ELSIF q.expires_at<=now() THEN RAISE EXCEPTION 'LOOP_BILLING_QUOTE_EXPIRED'; END IF;
  result:=jobvance_private.claim_loop_price_checkout(p_user,p_auth_session,p_generation,p_request,p_mode,p_plan,p_product,p_quote);
  IF o.request_id IS NULL THEN UPDATE jobvance_private.loop_billing_orders SET quote_id=p_quote WHERE user_id=p_user AND request_id=p_request RETURNING * INTO o;
  ELSE SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=p_request; END IF;
  RETURN to_jsonb(o)||jsonb_build_object('creationClaimAcquired',(result->>'creationClaimAcquired')::boolean,'pricing',jobvance_private.loop_order_pricing(o));
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_billing_order(p_user uuid,p_request uuid,p_mode text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT to_jsonb(o)||jsonb_build_object('pricing',jobvance_private.loop_order_pricing(o)) FROM jobvance_private.loop_billing_orders o WHERE user_id=p_user AND request_id=p_request AND mode=p_mode $$;

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
    'subscription',CASE WHEN s.subscription_id IS NULL THEN NULL ELSE jsonb_build_object('subscriptionId',s.subscription_id,'plan',s.plan,'status',s.status,'validUntil',s.valid_until,'periodStart',s.period_start,'graceUntil',s.grace_until,'cancelAtPeriodEnd',s.cancel_at_period_end,'revoked',s.revoked,'revision',s.revision,'pricing',(SELECT jobvance_private.loop_order_pricing(b) FROM jobvance_private.loop_billing_orders b WHERE b.user_id=s.user_id AND b.request_id=s.request_id)) END,
    'checkout',CASE WHEN o.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',o.request_id,'plan',o.plan,'status',o.state,'checkoutUrl',o.checkout_url,'createdAt',o.created_at,'expiresAt',o.created_at+interval '24 hours','reservationUntil',o.capacity_until,'pricing',jobvance_private.loop_order_pricing(o)) END,
    'cancelRequest',CASE WHEN c.request_id IS NULL THEN NULL ELSE jsonb_build_object('requestId',c.request_id,'subscriptionId',c.subscription_id,'status',CASE WHEN c.state='retryable' THEN 'creating' ELSE c.state END,'version',c.subscription_revision,'generation',c.generation) END);
END $$;

CREATE FUNCTION public.job_loop_billing_status_v2(p_user uuid,p_auth_session uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; o jobvance_private.loop_billing_orders; sub_id text; checkout_request uuid;
BEGIN
  result:=public.job_loop_billing_status(p_user,p_auth_session,p_mode);sub_id:=result->'subscription'->>'subscriptionId';
  IF sub_id IS NOT NULL THEN
    SELECT b.* INTO o FROM jobvance_private.loop_billing_orders b JOIN jobvance_private.loop_subscriptions s ON s.user_id=b.user_id AND s.request_id=b.request_id WHERE s.subscription_id=sub_id AND s.user_id=p_user AND s.mode=p_mode;
    result:=jsonb_set(result,'{subscription,pricing}',jobvance_private.loop_order_pricing(o));
  END IF;
  checkout_request:=(result->'checkout'->>'requestId')::uuid;
  IF checkout_request IS NOT NULL THEN
    SELECT * INTO o FROM jobvance_private.loop_billing_orders WHERE user_id=p_user AND request_id=checkout_request AND mode=p_mode;
    result:=jsonb_set(result,'{checkout,pricing}',jobvance_private.loop_order_pricing(o));
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION jobvance_private.apply_loop_price_event(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
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
    INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,revoked,generation,period_start,cancel_at_period_end,quote_id)
      VALUES(p_subscription,p_user,p_request,p_mode,p_plan,p_customer,'pending',now(),p_created,false,o.generation,NULL,false,p_quote) RETURNING * INTO s;
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

CREATE OR REPLACE FUNCTION public.job_loop_billing_apply_event(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_period_start timestamptz,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_revoked boolean,p_payload_hash text,p_payment text DEFAULT NULL,p_paid_amount bigint DEFAULT NULL,p_grace_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jobvance_private.apply_loop_price_event(p_user,p_request,p_mode,p_plan,p_product,p_session,p_subscription,p_customer,p_status,p_period_start,p_valid_until,p_cancel_at_period_end,p_event,p_created,p_revoked,p_payload_hash,p_payment,p_paid_amount,p_grace_until,NULL,'USD')
$$;

CREATE FUNCTION public.job_loop_billing_apply_event_v2(p_user uuid,p_request uuid,p_mode text,p_plan text,p_product text,p_session text,p_subscription text,p_customer text,p_status text,
  p_period_start timestamptz,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event text,p_created bigint,p_revoked boolean,p_payload_hash text,p_payment text,p_paid_amount bigint,p_grace_until timestamptz,p_quote uuid,p_currency text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jobvance_private.apply_loop_price_event(p_user,p_request,p_mode,p_plan,p_product,p_session,p_subscription,p_customer,p_status,p_period_start,p_valid_until,p_cancel_at_period_end,p_event,p_created,p_revoked,p_payload_hash,p_payment,p_paid_amount,p_grace_until,p_quote,p_currency)
$$;

INSERT INTO jobvance_private.loop_price_revisions(mode,catalog_version,plan,product_id,currency,amount_minor,exponent,usd_base_minor,provenance) VALUES
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','USD',2900,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','USD',5900,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','USD',9900,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','EUR',2599,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','EUR',5199,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','EUR',8799,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','GBP',2199,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','GBP',4399,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','GBP',7399,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','INR',279900,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','INR',559900,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','INR',939900,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','AED',10999,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','AED',21999,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','AED',35999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','CAD',4099,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','CAD',8399,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','CAD',13999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','AUD',4199,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','AUD',8499,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','AUD',13999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','SGD',3699,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','SGD',7499,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','SGD',12999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','weekly','pdt_0NpzVnWkzvNbKUPtHzZGo','JPY',4599,0,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','three_weekly','pdt_0NpzW2tG9N28jjBuUzYLB','JPY',9299,0,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('live','loop-local-2026-10-18-v1','daily','pdt_0NpzWGsuzZZJfaeMXNPQV','JPY',15599,0,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','USD',2900,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','USD',5900,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','USD',9900,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','EUR',2599,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','EUR',5199,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','EUR',8799,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','GBP',2199,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','GBP',4399,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','GBP',7399,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','INR',279900,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','INR',559900,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','INR',939900,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','AED',10999,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','AED',21999,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','AED',35999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','CAD',4099,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','CAD',8399,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','CAD',13999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','AUD',4199,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','AUD',8499,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','AUD',13999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','SGD',3699,2,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','SGD',7499,2,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','SGD',12999,2,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','weekly','pdt_0NpzelsHACoM4LDOWv3B4','JPY',4599,0,2900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','three_weekly','pdt_0Npzf8PoOs4n8UQxLW8pO','JPY',9299,0,5900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb),
('test','loop-local-2026-10-18-v1','daily','pdt_0NpzfK6ykcqXCgIvn9YDx','JPY',15599,0,9900,'{"asOf":"2026-10-16","publishedAt":"2026-10-18","ecb":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml","aed":"https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency","eurRates":{"USD":"1.1253","EUR":"1","GBP":"0.84385","INR":"106.8640","CAD":"1.5935","AUD":"1.6171","SGD":"1.4395","JPY":"177.82"},"aedPerUsd":"3.6725","roundingPolicy":"nearest-clean-ending-v1"}'::jsonb);

REVOKE ALL ON FUNCTION public.job_loop_billing_quote_candidate(uuid,uuid,bigint,uuid,text,text,text,text),public.job_loop_billing_quote_issue(uuid,uuid,bigint,uuid,text,text,text,text,text,text,text,text,text,bigint,bigint),public.job_loop_billing_quote_read(uuid,uuid,bigint,text,uuid),public.job_loop_billing_checkout_claim_v2(uuid,uuid,bigint,uuid,text,text,text,uuid),public.job_loop_billing_status_v2(uuid,uuid,text),public.job_loop_billing_apply_event_v2(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,boolean,text,text,bigint,timestamptz,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_quote_candidate(uuid,uuid,bigint,uuid,text,text,text,text),public.job_loop_billing_quote_issue(uuid,uuid,bigint,uuid,text,text,text,text,text,text,text,text,text,bigint,bigint),public.job_loop_billing_quote_read(uuid,uuid,bigint,text,uuid),public.job_loop_billing_checkout_claim_v2(uuid,uuid,bigint,uuid,text,text,text,uuid),public.job_loop_billing_status_v2(uuid,uuid,text),public.job_loop_billing_apply_event_v2(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,boolean,text,text,bigint,timestamptz,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION jobvance_private.claim_loop_price_checkout(uuid,uuid,bigint,uuid,text,text,text,uuid),jobvance_private.immutable_loop_price(),jobvance_private.loop_quote_json(jobvance_private.loop_price_quotes),jobvance_private.loop_order_pricing(jobvance_private.loop_billing_orders),jobvance_private.guard_loop_price_binding(),jobvance_private.apply_loop_price_event(uuid,uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,text,bigint,boolean,text,text,bigint,timestamptz,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
