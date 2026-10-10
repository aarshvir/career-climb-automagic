-- Additive MVP migration. Do not replay the destructive legacy initialization file
-- against an existing project. Apply this migration once through the reviewed process.
BEGIN;

CREATE TABLE public.cv_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  text_content text NOT NULL CHECK (char_length(btrim(text_content)) >= 80 AND char_length(text_content) <= 60000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, storage_path),
  CHECK (split_part(storage_path, '/', 1) = user_id::text AND storage_path !~ '(^|/)\.\.(/|$)')
);

CREATE TABLE public.billing_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('paddle','stripe')),
  billing_mode text NOT NULL CHECK (billing_mode IN ('test','live')),
  checkout_creation_claimed boolean NOT NULL DEFAULT false,
  checkout_session_id text UNIQUE,
  checkout_url text,
  checkout_expires_at timestamptz,
  payment_intent text UNIQUE,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','refunded')),
  amount integer NOT NULL DEFAULT 2900 CHECK (amount = 2900),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE TABLE public.billing_payments (
  payment_intent text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('paddle','stripe')),
  billing_mode text NOT NULL CHECK (billing_mode IN ('test','live')),
  paid_at timestamptz,
  refunded_at timestamptz,
  refund_amount integer NOT NULL DEFAULT 0 CHECK (refund_amount BETWEEN 0 AND 2900),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, request_id) REFERENCES public.billing_orders(user_id, request_id) ON DELETE CASCADE
);
CREATE TABLE public.billing_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('free','paid')),
  provider text CHECK (provider IN ('paddle','stripe')),
  billing_mode text CHECK (billing_mode IN ('test','live')),
  source_id text NOT NULL,
  credits_total integer NOT NULL CHECK (credits_total IN (1,10)),
  credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0 AND credits_used <= credits_total),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, source_id),
  CHECK ((kind = 'free' AND credits_total = 1 AND source_id = 'signup' AND expires_at IS NULL AND provider IS NULL AND billing_mode IS NULL) OR (kind = 'paid' AND credits_total = 10 AND expires_at IS NOT NULL AND provider IS NOT NULL AND billing_mode IS NOT NULL))
);
CREATE TABLE public.billing_refund_adjustments (
  adjustment_id text PRIMARY KEY CHECK (adjustment_id ~ '^paddle_adj_[a-z0-9]{26}$'),
  payment_intent text NOT NULL REFERENCES public.billing_payments(payment_intent) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 2900),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_payment_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.application_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES public.cv_documents(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  credit_grant_id uuid REFERENCES public.billing_credit_grants(id) ON DELETE SET NULL,
  job_title text NOT NULL CHECK (char_length(job_title) BETWEEN 1 AND 200),
  company text NOT NULL CHECK (char_length(company) <= 200),
  job_url text CHECK (job_url IS NULL OR (char_length(job_url) <= 2000 AND job_url ~ '^https://')),
  job_description text NOT NULL CHECK (char_length(job_description) BETWEEN 80 AND 20000),
  original_text text NOT NULL CHECK (char_length(original_text) BETWEEN 80 AND 60000),
  tailored_text text NOT NULL CHECK (char_length(tailored_text) BETWEEN 80 AND 60000),
  matched_keywords text[] NOT NULL DEFAULT '{}',
  missing_keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE TABLE public.tracked_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id uuid REFERENCES public.application_packs(id) ON DELETE SET NULL,
  job_title text NOT NULL CHECK (char_length(job_title) BETWEEN 1 AND 200),
  company text NOT NULL CHECK (char_length(company) <= 200),
  job_url text CHECK (job_url IS NULL OR (char_length(job_url) <= 2000 AND job_url ~ '^https://')),
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','applied','interview','offer','rejected','withdrawn')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 10000),
  applied_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pack_id)
);
CREATE INDEX cv_documents_user_created ON public.cv_documents(user_id, created_at DESC);
CREATE INDEX application_packs_user_created ON public.application_packs(user_id, created_at DESC);
CREATE INDEX tracked_applications_user_created ON public.tracked_applications(user_id, created_at DESC);
CREATE INDEX billing_grants_user ON public.billing_credit_grants(user_id);

ALTER TABLE public.cv_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refund_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_documents_read ON public.cv_documents FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY cv_documents_insert ON public.cv_documents FOR INSERT TO authenticated WITH CHECK (
  (select auth.uid()) = user_id AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'cv-documents' AND name = storage_path)
);
CREATE POLICY cv_documents_edit ON public.cv_documents FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY cv_documents_delete ON public.cv_documents FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY application_packs_read ON public.application_packs FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY application_packs_edit ON public.application_packs FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY tracked_applications_read ON public.tracked_applications FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY tracked_applications_write ON public.tracked_applications FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK (
  (select auth.uid()) = user_id AND (pack_id IS NULL OR EXISTS (SELECT 1 FROM public.application_packs p WHERE p.id = pack_id AND p.user_id = (select auth.uid())))
);
REVOKE ALL ON public.cv_documents, public.application_packs, public.tracked_applications, public.billing_entitlements, public.billing_orders, public.billing_payments, public.billing_credit_grants, public.billing_payment_events, public.billing_refund_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.cv_documents TO authenticated;
GRANT UPDATE (text_content) ON public.cv_documents TO authenticated;
GRANT SELECT ON public.application_packs TO authenticated;
GRANT UPDATE (tailored_text, status) ON public.application_packs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_applications TO authenticated;
GRANT ALL ON public.cv_documents, public.application_packs, public.tracked_applications, public.billing_entitlements, public.billing_orders, public.billing_payments, public.billing_credit_grants, public.billing_payment_events, public.billing_refund_adjustments TO service_role;

-- Restrict known self-service fields without assuming a particular old profiles shape.
-- Signup's SECURITY DEFINER trigger can still create the server-owned free profile.
DO $$
DECLARE editable text;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
    GRANT SELECT ON public.profiles TO authenticated;
    SELECT string_agg(quote_ident(column_name), ', ') INTO editable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('email','full_name','name','avatar_url');
    IF editable IS NOT NULL THEN EXECUTE 'GRANT UPDATE (' || editable || ') ON public.profiles TO authenticated'; END IF;
    -- Table revocation alone does not remove existing column grants.
    SELECT string_agg(quote_ident(column_name), ', ') INTO editable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name NOT IN ('email','full_name','name','avatar_url');
    IF editable IS NOT NULL THEN
      EXECUTE 'REVOKE INSERT (' || editable || '), UPDATE (' || editable || ') ON public.profiles FROM anon, authenticated';
    END IF;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cv-documents', 'cv-documents', false, 5242880, ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
CREATE POLICY jobvance_cv_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cv-documents' AND split_part(name, '/', 1) = (select auth.uid())::text);
CREATE POLICY jobvance_cv_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cv-documents' AND split_part(name, '/', 1) = (select auth.uid())::text AND name !~ '(^|/)\.\.(/|$)');
CREATE POLICY jobvance_cv_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cv-documents' AND split_part(name, '/', 1) = (select auth.uid())::text);
-- Restrictive policies also fence broad permissive policies left by older schemas.
CREATE POLICY jobvance_cv_storage_fence ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'cv-documents' OR split_part(name, '/', 1) = (select auth.uid())::text)
  WITH CHECK (bucket_id <> 'cv-documents' OR (split_part(name, '/', 1) = (select auth.uid())::text AND name !~ '(^|/)\.\.(/|$)'));
CREATE POLICY jobvance_cv_storage_no_replace ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (bucket_id <> 'cv-documents') WITH CHECK (bucket_id <> 'cv-documents');

CREATE FUNCTION public.jobvance_ensure_account(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.billing_entitlements(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.billing_entitlements WHERE user_id = p_user_id FOR UPDATE;
  INSERT INTO public.billing_credit_grants(user_id,kind,source_id,credits_total)
    VALUES(p_user_id,'free','signup',1) ON CONFLICT(user_id,kind,source_id) DO NOTHING;
END $$;

CREATE FUNCTION public.jobvance_get_entitlement(p_user_id uuid, p_billing_mode text DEFAULT 'test') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE remaining integer; expiry timestamptz;
BEGIN
  PERFORM public.jobvance_ensure_account(p_user_id);
  SELECT COALESCE(sum(credits_total - credits_used),0)::integer, min(expires_at) INTO remaining, expiry
    FROM public.billing_credit_grants WHERE user_id = p_user_id AND (kind = 'free' OR billing_mode = p_billing_mode) AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) AND credits_used < credits_total;
  RETURN jsonb_build_object('creditsRemaining',remaining,'expiresAt',expiry);
END $$;

CREATE FUNCTION public.jobvance_create_pack(
  p_user_id uuid, p_resume_id uuid, p_request_id uuid, p_fingerprint text,
  p_job_title text, p_company text, p_job_url text, p_job_description text,
  p_original_text text, p_tailored_text text, p_matched text[], p_missing text[], p_billing_mode text DEFAULT 'test'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE document public.cv_documents; existing public.application_packs; grant_id uuid; created public.application_packs;
BEGIN
  PERFORM public.jobvance_ensure_account(p_user_id);
  SELECT * INTO existing FROM public.application_packs WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF existing.request_fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    RETURN to_jsonb(existing);
  END IF;
  SELECT * INTO document FROM public.cv_documents WHERE id = p_resume_id AND user_id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CV_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF document.text_content IS DISTINCT FROM p_original_text THEN RAISE EXCEPTION 'CV_CHANGED' USING ERRCODE = 'P0001'; END IF;
  IF p_fingerprint IS NULL OR p_request_id IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_tailored_text IS NULL OR char_length(p_tailored_text) NOT BETWEEN 80 AND 60000 THEN
    RAISE EXCEPTION 'INVALID_PACK' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO grant_id FROM public.billing_credit_grants WHERE user_id = p_user_id AND (kind = 'free' OR billing_mode = p_billing_mode) AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now()) AND credits_used < credits_total
    ORDER BY expires_at NULLS LAST, created_at, id LIMIT 1 FOR UPDATE;
  IF grant_id IS NULL THEN RAISE EXCEPTION 'NO_CREDITS' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.billing_credit_grants SET credits_used = credits_used + 1 WHERE id = grant_id;
  INSERT INTO public.application_packs(user_id,resume_id,request_id,request_fingerprint,credit_grant_id,job_title,company,job_url,job_description,original_text,tailored_text,matched_keywords,missing_keywords)
    VALUES(p_user_id,p_resume_id,p_request_id,p_fingerprint,grant_id,p_job_title,p_company,p_job_url,p_job_description,p_original_text,p_tailored_text,COALESCE(p_matched,'{}'),COALESCE(p_missing,'{}')) RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;

CREATE FUNCTION public.jobvance_begin_checkout(p_user_id uuid, p_request_id uuid, p_provider text DEFAULT 'paddle', p_billing_mode text DEFAULT 'test') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders;
BEGIN
  PERFORM public.jobvance_ensure_account(p_user_id);
  IF p_provider NOT IN ('paddle','stripe') OR p_billing_mode NOT IN ('test','live') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
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

CREATE FUNCTION public.jobvance_finish_checkout(p_user_id uuid,p_request_id uuid,p_session_id text,p_url text,p_expires_at timestamptz,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.billing_orders;
BEGIN
  SELECT * INTO result FROM public.billing_orders WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR result.provider <> p_provider OR result.billing_mode <> p_billing_mode OR (result.checkout_session_id IS NOT NULL AND result.checkout_session_id <> p_session_id) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  IF p_provider = 'paddle' AND p_session_id !~ '^txn_[a-z0-9]{26}$' THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.billing_orders SET checkout_session_id = p_session_id, checkout_url = p_url, checkout_expires_at = p_expires_at,
    payment_intent = CASE WHEN p_provider = 'paddle' THEN 'paddle_' || p_session_id ELSE payment_intent END WHERE id = result.id;
END $$;

CREATE FUNCTION public.jobvance_apply_payment_event(p_event_id text,p_event_type text,p_event_created bigint,p_action text,p_user_id uuid,p_request_id uuid,p_payment_intent text,p_session_id text,p_refund_amount integer,p_provider text DEFAULT 'stripe',p_billing_mode text DEFAULT 'test',p_refund_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inserted text; order_row public.billing_orders; payment public.billing_payments; happened timestamptz; refund_total integer;
BEGIN
  IF p_action IS NULL OR p_provider IS NULL OR p_billing_mode IS NULL OR p_event_id IS NULL OR p_payment_intent IS NULL OR p_event_created IS NULL OR p_refund_amount IS NULL OR
    p_action NOT IN ('paid','refund') OR p_provider NOT IN ('paddle','stripe') OR p_billing_mode NOT IN ('test','live') OR
    (p_provider = 'stripe' AND (p_event_id !~ '^evt_[A-Za-z0-9]+$' OR p_payment_intent !~ '^pi_[A-Za-z0-9]+$')) OR
    (p_provider = 'paddle' AND (p_event_id !~ '^paddle_evt_[a-z0-9]{26}$' OR p_payment_intent !~ '^paddle_txn_[a-z0-9]{26}$' OR (p_action = 'refund' AND (p_refund_id IS NULL OR p_refund_id !~ '^paddle_adj_[a-z0-9]{26}$')))) OR
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
    IF p_provider = 'paddle' THEN
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

-- None of these privileged functions may be invoked by browser roles.
REVOKE ALL ON FUNCTION public.jobvance_ensure_account(uuid),public.jobvance_get_entitlement(uuid,text),public.jobvance_create_pack(uuid,uuid,uuid,text,text,text,text,text,text,text,text[],text[],text),public.jobvance_begin_checkout(uuid,uuid,text,text),public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text),public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_ensure_account(uuid),public.jobvance_get_entitlement(uuid,text),public.jobvance_create_pack(uuid,uuid,uuid,text,text,text,text,text,text,text,text[],text[],text),public.jobvance_begin_checkout(uuid,uuid,text,text),public.jobvance_finish_checkout(uuid,uuid,text,text,timestamptz,text,text),public.jobvance_apply_payment_event(text,text,bigint,text,uuid,uuid,text,text,integer,text,text,text) TO service_role;

CREATE FUNCTION public.jobvance_touch_tracking() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER jobvance_touch_tracking BEFORE UPDATE ON public.tracked_applications FOR EACH ROW EXECUTE FUNCTION public.jobvance_touch_tracking();

COMMIT;
