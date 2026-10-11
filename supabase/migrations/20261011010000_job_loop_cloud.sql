BEGIN;

CREATE TABLE public.job_loop_records (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0 CHECK(version >= 0),
  input_version bigint NOT NULL DEFAULT 0 CHECK(input_version >= 0),
  data jsonb NOT NULL DEFAULT '{"profile":null,"claims":[],"opportunities":[],"inbox":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=2000000)
);
CREATE TABLE public.job_loop_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), input_version bigint NOT NULL,
  snapshot jsonb NOT NULL, provider text NOT NULL CHECK(provider IN('rules','anthropic','openai','moonshot')), model text NOT NULL,
  consents jsonb NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','partial','blocked','cancelled','failed')),
  phase integer NOT NULL DEFAULT 0 CHECK(phase BETWEEN 0 AND 9),
  lease_token uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(user_id,request_id), UNIQUE(id,user_id),
  CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=2000000),
  CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=2000000)
);
CREATE INDEX job_loop_runs_owner_date ON public.job_loop_runs(user_id,created_at DESC);
CREATE TABLE public.job_loop_packets (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, opportunity_id uuid NOT NULL, input_version bigint NOT NULL,
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), data jsonb NOT NULL,
  status text NOT NULL CHECK(status IN('review_required','approved','held','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  FOREIGN KEY(run_id,user_id) REFERENCES public.job_loop_runs(id,user_id) ON DELETE CASCADE,
  UNIQUE(run_id,opportunity_id), UNIQUE(id,user_id),
  CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=1000000)
);
CREATE TABLE public.job_loop_budget_months (
  month text PRIMARY KEY CHECK(month ~ '^\d{4}-\d{2}$'),
  committed_micros bigint NOT NULL DEFAULT 0 CHECK(committed_micros BETWEEN 0 AND 50000000)
);
CREATE TABLE public.job_loop_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL, operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 100),
  month text NOT NULL REFERENCES public.job_loop_budget_months(month), provider text NOT NULL,
  reserved_micros bigint NOT NULL CHECK(reserved_micros BETWEEN 1 AND 50000000), actual_micros bigint,
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','settled','uncertain')),
  result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(run_id,user_id) REFERENCES public.job_loop_runs(id,user_id) ON DELETE CASCADE,
  UNIQUE(run_id,operation_key), CHECK(actual_micros IS NULL OR actual_micros BETWEEN 0 AND reserved_micros),
  CHECK(result IS NULL OR octet_length(result::text)<=1000000)
);
CREATE TABLE public.job_loop_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_ciphertext text NOT NULL, email text, allow_drafts boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.job_loop_oauth_states (
  state_hash text PRIMARY KEY CHECK(state_hash ~ '^[a-f0-9]{64}$'), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allow_drafts boolean NOT NULL, verifier_ciphertext text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz, activated_at timestamptz
);
CREATE TABLE public.job_loop_gmail_drafts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
  packet_id uuid NOT NULL, fingerprint text NOT NULL, status text NOT NULL CHECK(status IN('creating','created','uncertain')),
  draft_id text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id),UNIQUE(user_id,packet_id,fingerprint),
  FOREIGN KEY(packet_id,user_id) REFERENCES public.job_loop_packets(id,user_id) ON DELETE CASCADE
);

ALTER TABLE public.job_loop_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_budget_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_gmail_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_records,public.job_loop_runs,public.job_loop_packets,public.job_loop_usage,public.job_loop_budget_months,public.job_loop_connections,public.job_loop_oauth_states,public.job_loop_gmail_drafts FROM anon,authenticated;
GRANT ALL ON public.job_loop_records,public.job_loop_runs,public.job_loop_packets,public.job_loop_usage,public.job_loop_budget_months,public.job_loop_connections,public.job_loop_oauth_states,public.job_loop_gmail_drafts TO service_role;
GRANT SELECT ON public.job_loop_records,public.job_loop_runs,public.job_loop_packets TO authenticated;
CREATE POLICY loop_record_owner_read ON public.job_loop_records FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY loop_run_owner_read ON public.job_loop_runs FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY loop_packet_owner_read ON public.job_loop_packets FOR SELECT TO authenticated USING(auth.uid()=user_id);

CREATE FUNCTION public.job_loop_write_record(p_user uuid,p_expected bigint,p_data jsonb,p_inputs_changed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records;
BEGIN
  INSERT INTO public.job_loop_records(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'claims') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'opportunities') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'inbox') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'LOOP_INVALID_RECORD'; END IF;
  UPDATE public.job_loop_records SET version=version+1,input_version=input_version+CASE WHEN p_inputs_changed THEN 1 ELSE 0 END,data=p_data,updated_at=now() WHERE user_id=p_user RETURNING * INTO r;
  IF p_inputs_changed THEN
    UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now(),data=data||jsonb_build_object('nextAction','Your inputs changed. Start a new run using the current record.') WHERE user_id=p_user AND status IN('queued','running');
    UPDATE public.job_loop_packets p SET status='revoked',data=jsonb_set(p.data,'{status}','"revoked"')
    WHERE p.user_id=p_user AND p.status<>'revoked' AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_data->'opportunities') o WHERE o->>'id'=p.opportunity_id::text AND o->>'status' IN('applied','interview','offer','rejected','withdrawn'));
  END IF;
  RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.job_loop_start_run(p_user uuid,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; existing public.job_loop_runs; created public.job_loop_runs;
BEGIN
  INSERT INTO public.job_loop_records(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  SELECT * INTO existing FROM public.job_loop_runs WHERE user_id=p_user AND request_id=p_request;
  IF FOUND THEN
    IF existing.request_hash<>p_request_hash THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(existing);
  END IF;
  IF r.version<>p_expected OR r.data->'profile'='null'::jsonb THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=p_user AND status IN('queued','running') AND input_version<>r.input_version;
  IF EXISTS(SELECT 1 FROM public.job_loop_runs WHERE user_id=p_user AND status IN('queued','running')) THEN RAISE EXCEPTION 'LOOP_ACTIVE_RUN'; END IF;
  IF (SELECT count(*) FROM public.job_loop_runs WHERE user_id=p_user AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=3 THEN RAISE EXCEPTION 'LOOP_DAILY_LIMIT'; END IF;
  INSERT INTO public.job_loop_runs(user_id,request_id,request_hash,input_hash,input_version,snapshot,provider,model,consents)
  VALUES(p_user,p_request,p_request_hash,p_input_hash,r.input_version,r.data,p_provider,p_model,p_consents) RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;

CREATE FUNCTION public.job_loop_claim_run(p_run uuid,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs;
BEGIN
  UPDATE public.job_loop_runs SET status='running',lease_token=p_lease,lease_until=now()+interval '100 seconds'
  WHERE id=p_run AND status IN('queued','running') AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_records c WHERE c.user_id=r.user_id AND c.input_version=r.input_version) THEN
    UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now(),data=data||'{"messages":["Your career record changed. Start a new run."],"nextAction":"Start a run using the current record."}'::jsonb WHERE id=p_run;
    RETURN NULL;
  END IF;
  RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.job_loop_commit_phase(p_run uuid,p_lease uuid,p_phase integer,p_status text,p_data jsonb,p_packets jsonb DEFAULT '[]',p_opportunities jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs; c public.job_loop_records; p jsonb; o jsonb; old jsonb; combined jsonb; art record;
BEGIN
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p_run FOR UPDATE;
  IF r.lease_token IS DISTINCT FROM p_lease OR r.lease_until<now() OR r.status<>'running' THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  SELECT * INTO c FROM public.job_loop_records WHERE user_id=r.user_id FOR UPDATE;
  IF c.input_version<>r.input_version THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_packets) LOOP
    IF p->>'runId' IS DISTINCT FROM p_run::text OR p->>'inputHash' IS NULL OR p->>'inputHash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'LOOP_INVALID_PACKET'; END IF;
    FOR art IN SELECT key,value FROM jsonb_each(p->'artifacts') LOOP
      IF art.key NOT IN('pdf','docx','txt','report','letter') OR art.value->>'sha256' !~ '^[a-f0-9]{64}$' OR art.value->>'path' IS DISTINCT FROM r.user_id::text||'/'||(p->>'id')||'/'||(art.value->>'sha256')||'/'||art.key THEN RAISE EXCEPTION 'LOOP_ARTIFACT_PATH'; END IF;
    END LOOP;
    INSERT INTO public.job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status)
      VALUES((p->>'id')::uuid,r.user_id,p_run,(p->>'opportunityId')::uuid,r.input_version,p->>'inputHash',p,p->>'status') ON CONFLICT(run_id,opportunity_id) DO NOTHING;
  END LOOP;
  combined:=c.data->'opportunities';
  FOR o IN SELECT value FROM jsonb_array_elements(p_opportunities) LOOP
    SELECT value INTO old FROM jsonb_array_elements(combined) WHERE value->>'sourceKey'=o->>'sourceKey' OR value->>'id'=o->>'id' LIMIT 1;
    IF old IS NULL THEN combined:=combined||jsonb_build_array(o);
    ELSIF old->>'source'<>'manual' THEN
      o:=o||jsonb_build_object('id',old->>'id','status',old->>'status','notes',old->>'notes','followUpAt',old->'followUpAt');
      IF (old->>'description',old->>'title',old->>'company',old->>'location',old->>'url',old->'contact') IS DISTINCT FROM (o->>'description',o->>'title',o->>'company',o->>'location',o->>'url',o->'contact') AND old->>'status' IN('saved','prepared') THEN
        UPDATE public.job_loop_packets SET status='revoked',data=jsonb_set(data,'{status}','"revoked"') WHERE user_id=r.user_id AND opportunity_id=(old->>'id')::uuid AND status<>'revoked';
      END IF;
      SELECT jsonb_agg(CASE WHEN value->>'id'=old->>'id' THEN o ELSE value END) INTO combined FROM jsonb_array_elements(combined);
    END IF;
  END LOOP;
  IF combined IS DISTINCT FROM c.data->'opportunities' THEN UPDATE public.job_loop_records SET data=jsonb_set(data,'{opportunities}',combined),version=version+1,updated_at=now() WHERE user_id=r.user_id; END IF;
  UPDATE public.job_loop_runs SET phase=p_phase,status=p_status,data=p_data,lease_token=NULL,lease_until=NULL,
    finished_at=CASE WHEN p_status IN('completed','partial','blocked','failed') THEN now() ELSE NULL END WHERE id=p_run RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.job_loop_run_action(p_user uuid,p_run uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs;
BEGIN
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF p_action='cancel' THEN
    UPDATE public.job_loop_runs SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE id=p_run AND status NOT IN('completed','cancelled');
  ELSIF p_action='resume' THEN
    IF NOT EXISTS(SELECT 1 FROM public.job_loop_records WHERE user_id=p_user AND input_version=r.input_version) THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
    IF r.status IN('partial','blocked','failed') OR (r.status='running' AND r.lease_until<now()) THEN
      UPDATE public.job_loop_runs SET status='queued',lease_token=NULL,lease_until=NULL,finished_at=NULL WHERE id=p_run;
    END IF;
  ELSE RAISE EXCEPTION 'LOOP_INVALID_ACTION'; END IF;
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p_run; RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.job_loop_approve_packet(p_user uuid,p_packet uuid,p_hash text,p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.job_loop_packets; c public.job_loop_records;
BEGIN
  SELECT * INTO c FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  SELECT * INTO p FROM public.job_loop_packets WHERE id=p_packet AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF p.input_hash<>p_hash OR p.input_version<>c.input_version OR p.status NOT IN('review_required','approved') THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  IF p_text IS DISTINCT FROM p.data->>'cvText' THEN RAISE EXCEPTION 'LOOP_REVIEW_CHANGED'; END IF;
  IF p.data->>'pageCount' IS NULL OR (p.data->>'pageCount')::integer NOT BETWEEN 1 AND 2 OR jsonb_typeof(p.data->'holdReasons') IS DISTINCT FROM 'array' OR jsonb_array_length(p.data->'holdReasons')>0 OR NOT (p.data->'artifacts' ?& ARRAY['pdf','docx','txt']) THEN RAISE EXCEPTION 'LOOP_PACKET_HELD'; END IF;
  UPDATE public.job_loop_packets SET status='approved',approved_at=COALESCE(approved_at,now()),data=data||jsonb_build_object('status','approved','approvedAt',COALESCE(approved_at,now())) WHERE id=p_packet RETURNING * INTO p;
  RETURN p.data;
END $$;

CREATE FUNCTION public.job_loop_reserve(p_user uuid,p_run uuid,p_lease uuid,p_key text,p_provider text,p_micros bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.job_loop_usage; created public.job_loop_usage; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); r public.job_loop_runs;
BEGIN
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR r.status<>'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_until<now() THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_records WHERE user_id=p_user AND input_version=r.input_version) THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  SELECT * INTO existing FROM public.job_loop_usage WHERE run_id=p_run AND operation_key=p_key;
  IF FOUND THEN
    IF existing.provider<>p_provider OR existing.reserved_micros<>p_micros THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(existing)||'{"is_new":false}'::jsonb;
  END IF;
  IF p_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  INSERT INTO public.job_loop_budget_months(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.job_loop_budget_months WHERE month=month_key FOR UPDATE;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros+p_micros WHERE month=month_key AND committed_micros+p_micros<=50000000;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  INSERT INTO public.job_loop_usage(user_id,run_id,operation_key,month,provider,reserved_micros) VALUES(p_user,p_run,p_key,month_key,p_provider,p_micros) RETURNING * INTO created;
  RETURN to_jsonb(created)||'{"is_new":true}'::jsonb;
END $$;

CREATE FUNCTION public.job_loop_settle(p_usage uuid,p_actual bigint,p_result jsonb,p_uncertain boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.job_loop_usage;
BEGIN
  SELECT * INTO u FROM public.job_loop_usage WHERE id=p_usage FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF u.status='settled' THEN RETURN to_jsonb(u); END IF;
  IF p_uncertain THEN UPDATE public.job_loop_usage SET status='uncertain' WHERE id=p_usage RETURNING * INTO u; RETURN to_jsonb(u); END IF;
  IF p_actual IS NULL OR p_actual NOT BETWEEN 0 AND u.reserved_micros THEN RAISE EXCEPTION 'LOOP_USAGE_INVALID'; END IF;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros-(u.reserved_micros-p_actual) WHERE month=u.month;
  UPDATE public.job_loop_usage SET status='settled',actual_micros=p_actual,result=p_result WHERE id=p_usage RETURNING * INTO u; RETURN to_jsonb(u);
END $$;

CREATE FUNCTION public.job_loop_consume_oauth_state(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_oauth_states;
BEGIN
  UPDATE public.job_loop_oauth_states SET consumed_at=now() WHERE state_hash=p_hash AND consumed_at IS NULL AND expires_at>now() RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.job_loop_claim_draft(p_user uuid,p_packet uuid,p_request uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.job_loop_gmail_drafts;
BEGIN
  PERFORM 1 FROM public.job_loop_packets p JOIN public.job_loop_records r ON r.user_id=p.user_id WHERE p.id=p_packet AND p.user_id=p_user AND p.status='approved' AND p.input_version=r.input_version FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  INSERT INTO public.job_loop_gmail_drafts(user_id,request_id,packet_id,fingerprint,status) VALUES(p_user,p_request,p_packet,p_hash,'creating') ON CONFLICT DO NOTHING RETURNING * INTO d;
  IF FOUND THEN RETURN to_jsonb(d)||'{"is_new":true}'::jsonb; END IF;
  SELECT * INTO d FROM public.job_loop_gmail_drafts WHERE user_id=p_user AND (request_id=p_request OR (packet_id=p_packet AND fingerprint=p_hash)) ORDER BY created_at LIMIT 1;
  IF d.fingerprint<>p_hash OR d.packet_id<>p_packet THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
  RETURN to_jsonb(d)||'{"is_new":false}'::jsonb;
END $$;

CREATE FUNCTION public.job_loop_activate_gmail(p_user uuid,p_hash text,p_cipher text,p_email text,p_drafts boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.job_loop_oauth_states SET activated_at=now() WHERE state_hash=p_hash AND user_id=p_user AND consumed_at IS NOT NULL AND activated_at IS NULL AND expires_at>now() AND allow_drafts=p_drafts;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  IF length(p_cipher) NOT BETWEEN 30 AND 16000 OR length(p_email)>300 THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  INSERT INTO public.job_loop_connections(user_id,token_ciphertext,email,allow_drafts) VALUES(p_user,p_cipher,p_email,p_drafts)
    ON CONFLICT(user_id) DO UPDATE SET token_ciphertext=EXCLUDED.token_ciphertext,email=EXCLUDED.email,allow_drafts=EXCLUDED.allow_drafts,updated_at=now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.job_loop_write_record(uuid,bigint,jsonb,boolean),public.job_loop_start_run(uuid,uuid,text,text,bigint,text,text,jsonb),public.job_loop_claim_run(uuid,uuid),public.job_loop_commit_phase(uuid,uuid,integer,text,jsonb,jsonb,jsonb),public.job_loop_run_action(uuid,uuid,text),public.job_loop_approve_packet(uuid,uuid,text,text),public.job_loop_reserve(uuid,uuid,uuid,text,text,bigint),public.job_loop_settle(uuid,bigint,jsonb,boolean),public.job_loop_consume_oauth_state(text),public.job_loop_claim_draft(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_write_record(uuid,bigint,jsonb,boolean),public.job_loop_start_run(uuid,uuid,text,text,bigint,text,text,jsonb),public.job_loop_claim_run(uuid,uuid),public.job_loop_commit_phase(uuid,uuid,integer,text,jsonb,jsonb,jsonb),public.job_loop_run_action(uuid,uuid,text),public.job_loop_approve_packet(uuid,uuid,text,text),public.job_loop_reserve(uuid,uuid,uuid,text,text,bigint),public.job_loop_settle(uuid,bigint,jsonb,boolean),public.job_loop_consume_oauth_state(text),public.job_loop_claim_draft(uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.job_loop_activate_gmail(uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_activate_gmail(uuid,text,text,text,boolean) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('job-loop-artifacts','job-loop-artifacts',false,5242880,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Restrictive guard also fences broad legacy bucket policies. Clients never upload/alter loop artifacts.
CREATE POLICY loop_artifact_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'job-loop-artifacts' OR (auth.uid()::text=split_part(name,'/',1) AND EXISTS(SELECT 1 FROM public.job_loop_packets p CROSS JOIN LATERAL jsonb_each(p.data->'artifacts') a WHERE p.user_id=auth.uid() AND p.id::text=split_part(name,'/',2) AND p.status='approved' AND a.value->>'path'=storage.objects.name)));
CREATE POLICY loop_artifact_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='job-loop-artifacts' AND auth.uid()::text=split_part(name,'/',1) AND EXISTS(SELECT 1 FROM public.job_loop_packets p CROSS JOIN LATERAL jsonb_each(p.data->'artifacts') a WHERE p.user_id=auth.uid() AND p.id::text=split_part(name,'/',2) AND p.status='approved' AND a.value->>'path'=storage.objects.name));
CREATE POLICY loop_artifact_write_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'job-loop-artifacts');
CREATE POLICY loop_artifact_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'job-loop-artifacts') WITH CHECK(bucket_id<>'job-loop-artifacts');
CREATE POLICY loop_artifact_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'job-loop-artifacts');
COMMIT;
