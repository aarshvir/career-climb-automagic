BEGIN;

-- Tells Meta (Conversions API) that a signed-in owner opened checkout or paid, so ads can later be
-- optimised for purchases. Read-only against the payment ledgers: no payment, entitlement or webhook
-- code is touched. Each event is claimed once (with a short lease) and marked sent after Meta accepts it.
CREATE TABLE jobvance_private.meta_commerce_events (
  kind text NOT NULL CHECK(kind IN('checkout','purchase')),
  event_key text NOT NULL CHECK(char_length(event_key) BETWEEN 8 AND 120),
  mode text NOT NULL CHECK(mode IN('test','live')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY(mode,kind,event_key)
);
ALTER TABLE jobvance_private.meta_commerce_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.meta_commerce_events FROM PUBLIC,anon,authenticated,service_role;

-- Staff, QA fixtures and reserved test domains are never reported to Meta as live customers.
CREATE FUNCTION public.jobvance_meta_reportable_user(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.jobvance_admin_members m WHERE m.user_id=p_user)
    AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user
      AND COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true'
      AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net|test)|test\.invalid)$')
$$;

-- Only the first paid cycle of a subscription is a purchase; renewals are not new customers and refunded
-- or revoked cycles are skipped. Meta rejects events older than seven days, so only the last six are offered.
CREATE FUNCTION public.jobvance_meta_claim_purchases(p_user uuid,p_include_test boolean DEFAULT false)
RETURNS TABLE(event_key text,occurred_at timestamptz,plan_label text,amount_minor bigint,currency text,usd numeric,mode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'META_COMMERCE_INVALID'; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT p.mode,p.payment_id,p.starts_at,p.amount,p.currency,s.user_id,s.plan,
      CASE WHEN p.currency='USD' THEN p.amount ELSE a.accounting_amount_minor END AS usd_minor
    FROM jobvance_private.loop_subscription_periods p
    JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=p.subscription_id AND s.mode=p.mode
    LEFT JOIN jobvance_private.loop_provider_accounting a ON a.mode=p.mode AND a.payment_id=p.payment_id
    WHERE s.user_id=p_user AND NOT p.revoked AND (p.mode='live' OR p_include_test)
      AND p.starts_at>now()-interval '6 days' AND p.starts_at<=now()+interval '5 minutes'
      AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_periods q
        WHERE q.subscription_id=p.subscription_id AND q.mode=p.mode
          AND (q.starts_at,q.payment_id)<(p.starts_at,p.payment_id))
    ORDER BY p.starts_at,p.payment_id LIMIT 50
  ), eligible AS (
    SELECT d.* FROM due d WHERE d.mode='test' OR public.jobvance_meta_reportable_user(d.user_id)
  ), claimed AS (
    INSERT INTO jobvance_private.meta_commerce_events AS e(kind,event_key,mode,user_id)
    SELECT 'purchase',el.payment_id,el.mode,el.user_id FROM eligible el
    ON CONFLICT(mode,kind,event_key) DO UPDATE SET claimed_at=now()
      WHERE e.user_id=EXCLUDED.user_id AND e.sent_at IS NULL AND e.claimed_at<now()-interval '5 minutes'
    RETURNING e.event_key AS claimed_key,e.mode AS claimed_mode
  )
  SELECT el.payment_id,el.starts_at,
    CASE el.plan WHEN 'weekly' THEN 'Job Loop Starter' WHEN 'three_weekly' THEN 'Job Loop Advanced' ELSE 'Job Loop Pro' END,
    el.amount,el.currency,CASE WHEN el.usd_minor IS NULL THEN NULL ELSE round(el.usd_minor/100.0,2) END,el.mode
  FROM eligible el JOIN claimed c ON c.claimed_key=el.payment_id AND c.claimed_mode=el.mode;
END $$;

-- A checkout counts when the owner's own order reached a provider checkout session.
CREATE FUNCTION public.jobvance_meta_claim_checkout(p_user uuid,p_request uuid,p_include_test boolean DEFAULT false)
RETURNS TABLE(event_key text,plan_label text,mode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
BEGIN
  IF p_user IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'META_COMMERCE_INVALID'; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT o.mode,o.request_id,o.user_id,o.plan
    FROM jobvance_private.loop_billing_orders o
    WHERE o.user_id=p_user AND o.request_id=p_request AND o.state='ready' AND o.session_id IS NOT NULL
      AND (o.mode='live' OR p_include_test) AND o.created_at>now()-interval '6 days'
  ), eligible AS (
    SELECT d.* FROM due d WHERE d.mode='test' OR public.jobvance_meta_reportable_user(d.user_id)
  ), claimed AS (
    INSERT INTO jobvance_private.meta_commerce_events AS e(kind,event_key,mode,user_id)
    SELECT 'checkout',el.request_id::text,el.mode,el.user_id FROM eligible el
    ON CONFLICT(mode,kind,event_key) DO UPDATE SET claimed_at=now()
      WHERE e.user_id=EXCLUDED.user_id AND e.sent_at IS NULL AND e.claimed_at<now()-interval '5 minutes'
    RETURNING e.event_key AS claimed_key,e.mode AS claimed_mode
  )
  SELECT el.request_id::text,
    CASE el.plan WHEN 'weekly' THEN 'Job Loop Starter' WHEN 'three_weekly' THEN 'Job Loop Advanced' ELSE 'Job Loop Pro' END,el.mode
  FROM eligible el JOIN claimed c ON c.claimed_key=el.request_id::text AND c.claimed_mode=el.mode;
END $$;

CREATE FUNCTION public.jobvance_meta_mark_sent(p_user uuid,p_kind text,p_keys text[],p_mode text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
  IF p_user IS NULL OR p_mode IS NULL OR p_mode NOT IN('live','test') OR p_kind IS NULL OR p_kind NOT IN('checkout','purchase') OR p_keys IS NULL OR cardinality(p_keys)>50 THEN RAISE EXCEPTION 'META_COMMERCE_INVALID'; END IF;
  UPDATE jobvance_private.meta_commerce_events SET sent_at=now()
    WHERE mode=p_mode AND kind=p_kind AND user_id=p_user AND event_key=ANY(p_keys) AND sent_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.jobvance_meta_reportable_user(uuid),public.jobvance_meta_claim_purchases(uuid,boolean),
  public.jobvance_meta_claim_checkout(uuid,uuid,boolean),public.jobvance_meta_mark_sent(uuid,text,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_meta_reportable_user(uuid),public.jobvance_meta_claim_purchases(uuid,boolean),
  public.jobvance_meta_claim_checkout(uuid,uuid,boolean),public.jobvance_meta_mark_sent(uuid,text,text[],text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
