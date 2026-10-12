BEGIN;

-- The pilot is bounded independently of registration: only ten accounts can run
-- cloud preparation. Free guest checks and private record setup remain available.
CREATE TABLE public.job_loop_pilot_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true, joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.job_loop_schedules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0), status text NOT NULL CHECK(status IN('active','paused','cancelled')),
  settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'), next_run_at timestamptz,
  lease_token uuid, lease_until timestamptz, last_run_id uuid, last_attempt_at timestamptz,
  message text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status<>'active' OR next_run_at IS NOT NULL)
);
CREATE INDEX job_loop_schedule_due ON public.job_loop_schedules(next_run_at) WHERE status='active';
CREATE TABLE public.job_loop_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL, actor text NOT NULL CHECK(actor IN('candidate','jobvance')),
  at timestamptz NOT NULL DEFAULT now(), summary text NOT NULL CHECK(length(summary)<=500), opportunity_id uuid, run_id uuid
);
CREATE INDEX job_loop_activity_owner_date ON public.job_loop_activity(user_id,at DESC);
CREATE TABLE public.job_loop_scheduler_config (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, last_dispatch_at timestamptz);
INSERT INTO public.job_loop_scheduler_config(singleton) VALUES(true);
CREATE TABLE public.job_loop_support_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,category text NOT NULL CHECK(category IN('help','privacy','bug')),message text NOT NULL CHECK(length(message) BETWEEN 5 AND 2000),status text NOT NULL DEFAULT 'received' CHECK(status IN('received','in_review','resolved')),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.job_loop_pilot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_scheduler_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_pilot_users,public.job_loop_schedules,public.job_loop_activity,public.job_loop_scheduler_config,public.job_loop_support_requests FROM anon,authenticated;
GRANT ALL ON public.job_loop_pilot_users,public.job_loop_schedules,public.job_loop_activity,public.job_loop_scheduler_config,public.job_loop_support_requests TO service_role;
CREATE FUNCTION public.job_loop_scheduler_state() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT jsonb_build_object('ready',enabled,'lastDispatchAt',last_dispatch_at) FROM public.job_loop_scheduler_config WHERE singleton $$;

CREATE FUNCTION public.job_loop_enroll_pilot(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(8190710);
  IF EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.job_loop_pilot_users WHERE active)>=10 THEN RAISE EXCEPTION 'LOOP_PILOT_FULL'; END IF;
  INSERT INTO public.job_loop_pilot_users(user_id) VALUES(p_user)
  ON CONFLICT(user_id) DO UPDATE SET active=true,joined_at=now();
END $$;

ALTER FUNCTION public.job_loop_start_run(uuid,uuid,text,text,bigint,text,text,jsonb) RENAME TO job_loop_start_run_core;
CREATE FUNCTION public.job_loop_start_run(p_user uuid,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_enroll_pilot(p_user);
  RETURN public.job_loop_start_run_core(p_user,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents);
END $$;

CREATE FUNCTION public.job_loop_save_schedule(p_user uuid,p_expected bigint,p_settings jsonb,p_next timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_schedules;
BEGIN
  PERFORM public.job_loop_enroll_pilot(p_user);
  IF p_next<=now() OR p_next>now()+interval '15 days' OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR p_settings->>'cadence' NOT IN('daily','weekdays','weekly') OR p_settings->>'provider' NOT IN('rules','anthropic','openai','moonshot') OR p_settings->>'localTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR length(p_settings->>'timezone') NOT BETWEEN 1 AND 100 OR length(p_settings->>'model') NOT BETWEEN 1 AND 150 OR p_settings->>'modelConsent' NOT IN('true','false') OR p_settings->>'inboxConsent' NOT IN('true','false') THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  SELECT * INTO s FROM public.job_loop_schedules WHERE user_id=p_user FOR UPDATE;
  IF FOUND THEN
    IF s.version<>p_expected THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
    UPDATE public.job_loop_schedules SET settings=p_settings,status='active',version=version+1,next_run_at=p_next,lease_token=NULL,lease_until=NULL,message='Recurring preparation enabled by you.',updated_at=now() WHERE user_id=p_user RETURNING * INTO s;
  ELSE
    IF p_expected<>0 THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
    INSERT INTO public.job_loop_schedules(user_id,version,status,settings,next_run_at,message) VALUES(p_user,1,'active',p_settings,p_next,'Recurring preparation enabled by you.') RETURNING * INTO s;
  END IF;
  RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.job_loop_schedule_action(p_user uuid,p_expected bigint,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_schedules;
BEGIN
  SELECT * INTO s FROM public.job_loop_schedules WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF s.version<>p_expected THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
  IF p_action NOT IN('paused','cancelled') THEN RAISE EXCEPTION 'LOOP_INVALID_ACTION'; END IF;
  UPDATE public.job_loop_schedules SET status=p_action,version=version+1,next_run_at=NULL,lease_token=NULL,lease_until=NULL,message=CASE WHEN p_action='paused' THEN 'Paused by you. Existing preparation is retained.' ELSE 'Cancelled by you. No future scheduled preparation will start.' END,updated_at=now() WHERE user_id=p_user RETURNING * INTO s;
  IF p_action='cancelled' AND s.last_run_id IS NOT NULL THEN
    UPDATE public.job_loop_runs SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE id=s.last_run_id AND user_id=p_user AND status IN('queued','running');
  END IF;
  RETURN to_jsonb(s);
END $$;

CREATE FUNCTION public.job_loop_claim_due(p_lease uuid,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  WITH due AS (
    SELECT s.user_id FROM public.job_loop_schedules s JOIN public.job_loop_pilot_users p ON p.user_id=s.user_id AND p.active
    WHERE s.status='active' AND s.next_run_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now())
    ORDER BY s.next_run_at LIMIT least(greatest(p_limit,1),10) FOR UPDATE OF s SKIP LOCKED
  ), claimed AS (
    UPDATE public.job_loop_schedules s SET lease_token=p_lease,lease_until=now()+interval '5 minutes',last_attempt_at=now()
    FROM due WHERE s.user_id=due.user_id RETURNING s.*
  ) SELECT COALESCE(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) INTO result FROM claimed;
  RETURN result;
END $$;

CREATE FUNCTION public.job_loop_start_scheduled_run(p_user uuid,p_lease uuid,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_schedules; r jsonb;
BEGIN
  SELECT * INTO s FROM public.job_loop_schedules WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR s.status<>'active' OR s.lease_token IS DISTINCT FROM p_lease OR s.lease_until<now() THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  IF s.settings->>'provider' IS DISTINCT FROM p_provider OR s.settings->>'model' IS DISTINCT FROM p_model THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
  -- Replay a claimed occurrence before applying new-run limits.
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_runs WHERE user_id=p_user AND request_id=p_request) THEN
    IF (SELECT count(*) FROM public.job_loop_runs WHERE user_id=p_user AND consents->>'scheduled'='true' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=1 THEN RAISE EXCEPTION 'LOOP_DAILY_SCHEDULE_LIMIT'; END IF;
    IF (SELECT count(*) FROM public.job_loop_runs WHERE user_id=p_user AND consents->>'scheduled'='true' AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=30 THEN RAISE EXCEPTION 'LOOP_MONTHLY_SCHEDULE_LIMIT'; END IF;
  END IF;
  r:=public.job_loop_start_run(p_user,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents||'{"scheduled":true}'::jsonb);
  UPDATE public.job_loop_schedules SET last_run_id=(r->>'id')::uuid WHERE user_id=p_user;
  RETURN r;
END $$;

CREATE FUNCTION public.job_loop_finish_schedule(p_user uuid,p_lease uuid,p_next timestamptz,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_next<=now() OR p_next>now()+interval '15 days' THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  UPDATE public.job_loop_schedules SET next_run_at=p_next,lease_token=NULL,lease_until=NULL,message=left(p_message,500),updated_at=now()
  WHERE user_id=p_user AND status='active' AND lease_token=p_lease AND lease_until>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
END $$;

CREATE FUNCTION public.job_loop_budget_snapshot(p_user uuid,p_cap_micros bigint DEFAULT 50000000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE committed bigint; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
BEGIN
  IF p_cap_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  SELECT committed_micros INTO committed FROM public.job_loop_budget_months WHERE month=month_key;
  RETURN jsonb_build_object('month',month_key,'capUsd',p_cap_micros/1000000.0,'committedUsd',COALESCE(committed,0)/1000000.0,'remainingUsd',greatest(0,p_cap_micros-COALESCE(committed,0))/1000000.0,'scope','shared_ai_search','maxPilotUsers',10,
    'enrolled',EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active),'activeUsers',(SELECT count(*) FROM public.job_loop_pilot_users WHERE active),'maxUsers',10);
END $$;

-- A configured lower ceiling is also enforced atomically; an operator cannot
-- raise the hard maximum above fifty dollars through an environment setting.
ALTER FUNCTION public.job_loop_reserve(uuid,uuid,uuid,text,text,bigint) RENAME TO job_loop_reserve_legacy;
CREATE FUNCTION public.job_loop_reserve(p_user uuid,p_run uuid,p_lease uuid,p_key text,p_provider text,p_micros bigint,p_cap_micros bigint DEFAULT 50000000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.job_loop_usage; created public.job_loop_usage; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); r public.job_loop_runs;
BEGIN
  IF p_cap_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
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
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros+p_micros WHERE month=month_key AND committed_micros+p_micros<=p_cap_micros;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  INSERT INTO public.job_loop_usage(user_id,run_id,operation_key,month,provider,reserved_micros) VALUES(p_user,p_run,p_key,month_key,p_provider,p_micros) RETURNING * INTO created;
  RETURN to_jsonb(created)||'{"is_new":true}'::jsonb;
END $$;

-- Vacancy-only edits invalidate their own packet. Unaffected packet authority
-- follows the new record generation; a factual/profile correction still revokes all.
CREATE OR REPLACE FUNCTION public.job_loop_write_record(p_user uuid,p_expected bigint,p_data jsonb,p_inputs_changed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; previous jsonb; factual boolean;
BEGIN
  INSERT INTO public.job_loop_records(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'claims') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'opportunities') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'inbox') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'LOOP_INVALID_RECORD'; END IF;
  previous:=r.data; factual:=(previous->'profile',previous->'claims') IS DISTINCT FROM (p_data->'profile',p_data->'claims');
  UPDATE public.job_loop_records SET version=version+1,input_version=input_version+CASE WHEN p_inputs_changed THEN 1 ELSE 0 END,data=p_data,updated_at=now() WHERE user_id=p_user RETURNING * INTO r;
  IF p_inputs_changed THEN
    UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now(),data=data||jsonb_build_object('nextAction','Your inputs changed. Start a new run using the current record.') WHERE user_id=p_user AND status IN('queued','running');
    UPDATE public.job_loop_packets p SET status='revoked',data=jsonb_set(p.data,'{status}','"revoked"') WHERE p.user_id=p_user AND p.status<>'revoked' AND (
      factual OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(previous->'opportunities') old JOIN jsonb_array_elements(p_data->'opportunities') fresh ON old->>'id'=fresh->>'id'
      WHERE fresh->>'id'=p.opportunity_id::text AND (old->>'title',old->>'company',old->>'location',old->>'url',old->>'description',old->'contact') IS NOT DISTINCT FROM (fresh->>'title',fresh->>'company',fresh->>'location',fresh->>'url',fresh->>'description',fresh->'contact')));
    UPDATE public.job_loop_packets SET input_version=r.input_version WHERE user_id=p_user AND status<>'revoked';
  END IF;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_approve_packet(p_user uuid,p_packet uuid,p_hash text,p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.job_loop_packets; c public.job_loop_records;
BEGIN
  SELECT * INTO c FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  SELECT * INTO p FROM public.job_loop_packets WHERE id=p_packet AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF p.input_hash<>p_hash OR p.input_version<>c.input_version OR p.status NOT IN('review_required','approved') THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  IF p_text IS DISTINCT FROM p.data->>'cvText' THEN RAISE EXCEPTION 'LOOP_REVIEW_CHANGED'; END IF;
  IF jsonb_typeof(p.data->'holdReasons') IS DISTINCT FROM 'array' OR jsonb_array_length(p.data->'holdReasons')>0 OR NOT (p.data->'artifacts' ? 'txt') OR COALESCE(p.data#>>'{formatStatus,txt,ready}','true')<>'true' THEN RAISE EXCEPTION 'LOOP_PACKET_HELD'; END IF;
  UPDATE public.job_loop_packets SET status='approved',approved_at=COALESCE(approved_at,now()),data=data||jsonb_build_object('status','approved','approvedAt',COALESCE(approved_at,now())) WHERE id=p_packet RETURNING * INTO p;
  RETURN p.data;
END $$;

CREATE FUNCTION public.job_loop_add_activity(p_user uuid,p_kind text,p_actor text,p_summary text,p_opportunity uuid DEFAULT NULL,p_run uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.job_loop_activity(user_id,kind,actor,summary,opportunity_id,run_id) VALUES(p_user,p_kind,p_actor,left(p_summary,500),p_opportunity,p_run);
  DELETE FROM public.job_loop_activity WHERE user_id=p_user AND id IN(SELECT id FROM public.job_loop_activity WHERE user_id=p_user ORDER BY at DESC,id DESC OFFSET 200);
END $$;
CREATE FUNCTION public.job_loop_activity_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; prior jsonb;
BEGIN
  IF TG_TABLE_NAME='job_loop_records' THEN
    IF OLD.data->'profile' IS DISTINCT FROM NEW.data->'profile' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'career_record','candidate','Career record saved or corrected.'); END IF;
    IF OLD.data->'claims' IS DISTINCT FROM NEW.data->'claims' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'evidence','candidate','Evidence confirmation or sharing choices updated.'); END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.data->'opportunities') LOOP
      SELECT value INTO prior FROM jsonb_array_elements(OLD.data->'opportunities') WHERE value->>'id'=item->>'id';
      IF prior IS NULL THEN PERFORM public.job_loop_add_activity(NEW.user_id,'opportunity_saved',CASE WHEN item->>'source'='manual' THEN 'candidate' ELSE 'jobvance' END,'Opportunity saved; no application submission is inferred.',(item->>'id')::uuid);
      ELSIF prior->>'status' IS DISTINCT FROM item->>'status' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'application_status','candidate','You marked this opportunity '||(item->>'status')||'.',(item->>'id')::uuid);
      ELSIF prior->>'followUpAt' IS DISTINCT FROM item->>'followUpAt' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'reminder','candidate','Follow-up reminder updated by you.',(item->>'id')::uuid);
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME='job_loop_runs' THEN
    IF TG_OP='INSERT' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'run_queued',CASE WHEN NEW.consents->>'scheduled'='true' THEN 'jobvance' ELSE 'candidate' END,'Preparation run queued.',NULL,NEW.id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.job_loop_add_activity(NEW.user_id,'run_status',CASE WHEN NEW.status='cancelled' THEN 'candidate' ELSE 'jobvance' END,'Preparation run '||NEW.status||'.',NULL,NEW.id); END IF;
  ELSIF TG_TABLE_NAME='job_loop_packets' THEN
    IF TG_OP='INSERT' THEN PERFORM public.job_loop_add_activity(NEW.user_id,'packet_prepared','jobvance','Application packet prepared for your review.',NEW.opportunity_id,NEW.run_id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.job_loop_add_activity(NEW.user_id,'packet_status',CASE WHEN NEW.status='approved' THEN 'candidate' ELSE 'jobvance' END,'Application packet '||NEW.status||'.',NEW.opportunity_id,NEW.run_id); END IF;
  ELSIF TG_TABLE_NAME='job_loop_schedules' THEN
    IF TG_OP='INSERT' OR OLD.version IS DISTINCT FROM NEW.version THEN PERFORM public.job_loop_add_activity(NEW.user_id,'schedule','candidate','Recurring preparation '||NEW.status||'.'); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_loop_record_activity AFTER UPDATE ON public.job_loop_records FOR EACH ROW EXECUTE FUNCTION public.job_loop_activity_trigger();
CREATE TRIGGER job_loop_run_activity AFTER INSERT OR UPDATE ON public.job_loop_runs FOR EACH ROW EXECUTE FUNCTION public.job_loop_activity_trigger();
CREATE TRIGGER job_loop_packet_activity AFTER INSERT OR UPDATE ON public.job_loop_packets FOR EACH ROW EXECUTE FUNCTION public.job_loop_activity_trigger();
CREATE TRIGGER job_loop_schedule_activity AFTER INSERT OR UPDATE ON public.job_loop_schedules FOR EACH ROW EXECUTE FUNCTION public.job_loop_activity_trigger();

CREATE FUNCTION public.job_loop_begin_erase(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paths jsonb;
BEGIN
  UPDATE public.job_loop_pilot_users SET active=false WHERE user_id=p_user;
  UPDATE public.job_loop_schedules SET status='cancelled',version=version+1,next_run_at=NULL,lease_token=NULL,lease_until=NULL WHERE user_id=p_user;
  UPDATE public.job_loop_runs SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=p_user AND status IN('queued','running');
  UPDATE public.job_loop_packets SET status='revoked',data=jsonb_set(data,'{status}','"revoked"') WHERE user_id=p_user AND status<>'revoked';
  SELECT COALESCE(jsonb_agg(art.value->>'path'),'[]'::jsonb) INTO paths FROM public.job_loop_packets p CROSS JOIN LATERAL jsonb_each(p.data->'artifacts') art WHERE p.user_id=p_user;
  RETURN paths;
END $$;

-- Fence late storage writes after erasure starts, including a worker which was
-- already rendering when its lease was cancelled. The application keeps bucket
-- paths private; the storage service must also refuse inserting new authority.
CREATE FUNCTION public.job_loop_storage_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_text text;
BEGIN
  IF NEW.bucket_id='job-loop-artifacts' THEN
    owner_text:=split_part(NEW.name,'/',1);
    IF owner_text !~ '^[0-9a-fA-F-]{36}$' OR NOT EXISTS(SELECT 1 FROM public.job_loop_pilot_users p JOIN public.job_loop_records r ON r.user_id=p.user_id WHERE p.user_id::text=owner_text AND p.active) THEN RAISE EXCEPTION 'LOOP_STORAGE_OWNER_INACTIVE'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_loop_storage_write_guard BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.job_loop_storage_write_guard();
CREATE FUNCTION public.job_loop_finish_erase(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.job_loop_gmail_drafts WHERE user_id=p_user;
  DELETE FROM public.job_loop_oauth_states WHERE user_id=p_user;
  DELETE FROM public.job_loop_connections WHERE user_id=p_user;
  DELETE FROM public.job_loop_schedules WHERE user_id=p_user;
  DELETE FROM public.job_loop_runs WHERE user_id=p_user;
  DELETE FROM public.job_loop_records WHERE user_id=p_user;
  DELETE FROM public.job_loop_activity WHERE user_id=p_user;
  DELETE FROM public.job_loop_support_requests WHERE user_id=p_user;
  UPDATE public.job_loop_pilot_users SET active=false WHERE user_id=p_user;
  -- The shared committed spending is deliberately retained: erasure must not
  -- refund an actual or uncertain provider call and reopen the monthly budget.
END $$;

-- Every new privileged operation is service-only. Browser clients go through
-- the authenticated control endpoint; scheduler calls require the worker secret.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'job_loop_%' LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';
  END LOOP;
END $$;
COMMIT;
