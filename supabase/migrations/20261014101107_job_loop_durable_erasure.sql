BEGIN;

-- This row survives Loop erasure. It contains lifecycle metadata, never career
-- text, and prevents a concurrent request from reopening storage authority.
CREATE TABLE public.job_loop_lifecycle (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
  record_version_floor bigint NOT NULL DEFAULT 0 CHECK(record_version_floor>=0),
  input_version_floor bigint NOT NULL DEFAULT 0 CHECK(input_version_floor>=0),
  state text NOT NULL DEFAULT 'active' CHECK(state IN('active','erasing','erased')),
  erasure_started_at timestamptz,
  erasure_completed_at timestamptz,
  removal_attempts bigint NOT NULL DEFAULT 0 CHECK(removal_attempts>=0),
  batch_attempts bigint NOT NULL DEFAULT 0 CHECK(batch_attempts>=0),
  last_attempt_at timestamptz
);
CREATE TABLE public.job_loop_artifact_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  run_id uuid NOT NULL,
  lease_token uuid NOT NULL,
  generation bigint NOT NULL CHECK(generation>=0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,path),
  FOREIGN KEY(run_id,user_id) REFERENCES public.job_loop_runs(id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.job_loop_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_artifact_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_lifecycle,public.job_loop_artifact_grants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.job_loop_lifecycle,public.job_loop_artifact_grants TO service_role;

CREATE FUNCTION public.job_loop_erasure_owner_lock(p_user uuid)
RETURNS public.job_loop_lifecycle LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  -- Use this serialization point before record/run/schedule row locks. The
  -- advisory lock also serializes first creation of the durable lifecycle row.
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  INSERT INTO public.job_loop_lifecycle(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO lifecycle FROM public.job_loop_lifecycle WHERE user_id=p_user FOR UPDATE;
  RETURN lifecycle;
END $$;

CREATE FUNCTION public.job_loop_assert_writable(p_user uuid,p_activate boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF lifecycle.state='erasing' THEN RAISE EXCEPTION 'LOOP_ERASURE_IN_PROGRESS'; END IF;
  IF lifecycle.state='erased' THEN
    IF NOT p_activate THEN RAISE EXCEPTION 'LOOP_ERASED'; END IF;
    UPDATE public.job_loop_lifecycle SET state='active',generation=generation+1
      WHERE user_id=p_user RETURNING * INTO lifecycle;
  END IF;
  RETURN lifecycle.generation;
END $$;

-- Normal RPCs acquire the same owner lock before their existing row locks.
-- Generate signatures from the catalog so defaults and the latest deployed
-- reserve/lease implementations are preserved rather than copied here.
DO $$
DECLARE routine record; argument_list text; owner_expression text; delegate_name text; call_statement text; gate_statement text;
BEGIN
  FOR routine IN
    SELECT p.oid,p.proname,p.proargnames,p.pronargs,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result_type
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.proname=ANY(ARRAY[
      'job_loop_write_record','job_loop_enroll_pilot','job_loop_start_run','job_loop_start_run_core',
      'job_loop_save_schedule','job_loop_schedule_action','job_loop_start_scheduled_run','job_loop_finish_schedule',
      'job_loop_claim_run','job_loop_commit_phase','job_loop_run_action','job_loop_approve_packet',
      'job_loop_reserve','job_loop_reserve_legacy','job_loop_settle','job_loop_consume_oauth_state',
      'job_loop_claim_draft','job_loop_activate_gmail','job_loop_add_activity','jobvance_admin_update_support'
    ]) ORDER BY p.proname,p.oid
  LOOP
    SELECT string_agg(quote_ident(routine.proargnames[i]),', ' ORDER BY i)
      INTO argument_list FROM generate_series(1,routine.pronargs) AS i;
    IF 'p_user'=ANY(routine.proargnames) THEN owner_expression:='p_user';
    ELSIF 'p_run'=ANY(routine.proargnames) THEN owner_expression:='(SELECT user_id FROM public.job_loop_runs WHERE id=p_run)';
    ELSIF 'p_usage'=ANY(routine.proargnames) THEN owner_expression:='(SELECT user_id FROM public.job_loop_usage WHERE id=p_usage)';
    ELSIF routine.proname='job_loop_consume_oauth_state' THEN owner_expression:='(SELECT user_id FROM public.job_loop_oauth_states WHERE state_hash=p_hash)';
    ELSIF routine.proname='jobvance_admin_update_support' THEN owner_expression:='(SELECT user_id FROM public.job_loop_support_requests WHERE id=p_id)';
    ELSE RAISE EXCEPTION 'LOOP_ERASURE_WRAPPER_OWNER_UNKNOWN: %',routine.proname;
    END IF;
    delegate_name:=routine.proname||'_unfenced';
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I',routine.proname,routine.identity_arguments,delegate_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated,service_role',delegate_name,routine.identity_arguments);
    IF routine.proname='job_loop_add_activity' THEN
      gate_statement:='lifecycle:=public.job_loop_erasure_owner_lock(owner_id); IF lifecycle.state<>''active'' THEN RETURN; END IF;';
    ELSE
      gate_statement:=format('PERFORM public.job_loop_assert_writable(owner_id,%L);',routine.proname IN('job_loop_write_record','job_loop_enroll_pilot'));
    END IF;
    call_statement:=CASE WHEN routine.result_type='void' THEN format('PERFORM public.%I(%s); RETURN;',delegate_name,argument_list)
      ELSE format('RETURN public.%I(%s);',delegate_name,argument_list) END;
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS $wrapper$
      DECLARE owner_id uuid; lifecycle public.job_loop_lifecycle;
      BEGIN owner_id:=%s; IF owner_id IS NULL THEN %s END IF; %s %s END $wrapper$',
      routine.proname,routine.arguments,routine.result_type,owner_expression,
      CASE WHEN routine.proname='job_loop_claim_run' THEN 'RETURN NULL;' ELSE 'RAISE EXCEPTION ''LOOP_NOT_FOUND'';' END,
      gate_statement,call_statement);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',routine.proname,routine.identity_arguments);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',routine.proname,routine.identity_arguments);
  END LOOP;
END $$;

-- Multi-owner dispatch is not a regular p_user RPC. Acquire candidate owner
-- locks in a deterministic order, skip busy owners, then lock schedule rows.
CREATE OR REPLACE FUNCTION public.job_loop_claim_due(p_lease uuid,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate uuid; schedule public.job_loop_schedules; lifecycle public.job_loop_lifecycle; result jsonb:='[]'::jsonb;
BEGIN
  FOR candidate IN
    SELECT s.user_id FROM public.job_loop_schedules s
      JOIN public.job_loop_pilot_users p ON p.user_id=s.user_id AND p.active
      LEFT JOIN public.job_loop_lifecycle l ON l.user_id=s.user_id
    WHERE s.status='active' AND s.next_run_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now())
      AND COALESCE(l.state,'active')='active'
    ORDER BY s.user_id LIMIT least(greatest(p_limit,1),10)
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||candidate::text,8190711)) THEN CONTINUE; END IF;
    lifecycle:=public.job_loop_erasure_owner_lock(candidate);
    IF lifecycle.state<>'active' THEN CONTINUE; END IF;
    SELECT * INTO schedule FROM public.job_loop_schedules s
      WHERE s.user_id=candidate AND s.status='active' AND s.next_run_at<=now()
        AND (s.lease_until IS NULL OR s.lease_until<now())
        AND EXISTS(SELECT 1 FROM public.job_loop_pilot_users p WHERE p.user_id=candidate AND p.active)
      FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE public.job_loop_schedules SET lease_token=p_lease,lease_until=now()+interval '5 minutes',last_attempt_at=now()
      WHERE user_id=candidate RETURNING * INTO schedule;
    result:=result||jsonb_build_array(to_jsonb(schedule));
  END LOOP;
  RETURN result;
END $$;

-- Defense for service-role direct mutation paths (CV opening, support, OAuth,
-- token refresh and draft receipts). They must never reopen an erasing owner.
CREATE FUNCTION public.job_loop_mutation_erasure_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; activate boolean:=false; minimum_version bigint; minimum_input_version bigint;
BEGIN
  IF TG_OP='DELETE' THEN owner_id:=OLD.user_id; ELSE owner_id:=NEW.user_id; END IF;
  IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'LOOP_OWNER_CHANGED'; END IF;
  -- Account deletion cascades must not recreate their already-deleted parent.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id) THEN RETURN OLD; END IF;
  IF current_setting('jobvance.loop.erasure_owner',true)=owner_id::text THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='job_loop_records' AND TG_OP='INSERT' THEN activate:=true; END IF;
  IF TG_TABLE_NAME='job_loop_pilot_users' AND TG_OP<>'DELETE' THEN activate:=NEW.active; END IF;
  PERFORM public.job_loop_assert_writable(owner_id,activate);
  IF TG_TABLE_NAME='job_loop_records' AND TG_OP='INSERT' THEN
    -- A completed erasure must not reuse a prior editor's expectedVersion.
    -- Existing records are unchanged; only a genuinely fresh row is seeded.
    SELECT record_version_floor,input_version_floor INTO minimum_version,minimum_input_version
      FROM public.job_loop_lifecycle WHERE user_id=owner_id;
    NEW.version:=greatest(NEW.version,minimum_version);
    NEW.input_version:=greatest(NEW.input_version,minimum_input_version);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['job_loop_records','job_loop_runs','job_loop_packets','job_loop_usage',
    'job_loop_connections','job_loop_oauth_states','job_loop_gmail_drafts','job_loop_pilot_users',
    'job_loop_schedules','job_loop_activity','job_loop_support_requests'] LOOP
    IF to_regclass('public.'||table_name) IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER job_loop_mutation_erasure_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.job_loop_mutation_erasure_guard()',table_name);
    END IF;
  END LOOP;
END $$;

-- Erasure itself changes statuses. Its cancellation/revocation must not create
-- activity or fail because ordinary activity writes are now fenced.
CREATE OR REPLACE FUNCTION public.job_loop_activity_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; prior jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.job_loop_lifecycle WHERE user_id=NEW.user_id AND state<>'active') THEN RETURN NEW; END IF;
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

ALTER FUNCTION public.job_loop_begin_erase(uuid) RENAME TO job_loop_begin_erase_unfenced;
ALTER FUNCTION public.job_loop_finish_erase(uuid) RENAME TO job_loop_finish_erase_unfenced;
REVOKE ALL ON FUNCTION public.job_loop_begin_erase_unfenced(uuid),public.job_loop_finish_erase_unfenced(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.job_loop_begin_erase(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle; prior_context text;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF lifecycle.state IN('erasing','erased') THEN RETURN jsonb_build_object('generation',lifecycle.generation); END IF;
  UPDATE public.job_loop_lifecycle SET generation=generation+1,state='erasing',erasure_started_at=now(),
    erasure_completed_at=NULL,removal_attempts=0,batch_attempts=0,last_attempt_at=now(),
    record_version_floor=greatest(record_version_floor,COALESCE((SELECT r.version+1 FROM public.job_loop_records r WHERE r.user_id=p_user),record_version_floor)),
    input_version_floor=greatest(input_version_floor,COALESCE((SELECT r.input_version+1 FROM public.job_loop_records r WHERE r.user_id=p_user),input_version_floor))
    WHERE user_id=p_user RETURNING * INTO lifecycle;
  DELETE FROM public.job_loop_artifact_grants WHERE user_id=p_user;
  prior_context:=current_setting('jobvance.loop.erasure_owner',true);
  PERFORM set_config('jobvance.loop.erasure_owner',p_user::text,true);
  PERFORM public.job_loop_begin_erase_unfenced(p_user);
  PERFORM set_config('jobvance.loop.erasure_owner',COALESCE(prior_context,''),true);
  RETURN jsonb_build_object('generation',lifecycle.generation);
END $$;

CREATE FUNCTION public.job_loop_erasure_batch(p_user uuid,p_generation bigint,p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle; paths jsonb;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF p_generation IS NULL OR lifecycle.generation<>p_generation OR lifecycle.state NOT IN('erasing','erased') THEN RAISE EXCEPTION 'LOOP_ERASURE_STALE'; END IF;
  SELECT COALESCE(jsonb_agg(name ORDER BY name),'[]'::jsonb) INTO paths FROM (
    SELECT name FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name LIKE p_user::text||'/%'
      ORDER BY name LIMIT least(greatest(COALESCE(p_limit,200),1),200)
  ) AS batch;
  RETURN paths;
END $$;

CREATE FUNCTION public.job_loop_erasure_progress(p_user uuid,p_generation bigint,p_removed integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF p_generation IS NULL OR lifecycle.generation<>p_generation OR lifecycle.state NOT IN('erasing','erased') THEN RAISE EXCEPTION 'LOOP_ERASURE_STALE'; END IF;
  IF p_removed IS NULL OR p_removed NOT BETWEEN 0 AND 200 THEN RAISE EXCEPTION 'LOOP_ERASURE_RETRY'; END IF;
  -- Diagnostics record attempted removals, never proof that bytes were removed.
  UPDATE public.job_loop_lifecycle SET removal_attempts=removal_attempts+p_removed,batch_attempts=batch_attempts+1,last_attempt_at=now() WHERE user_id=p_user;
END $$;

CREATE FUNCTION public.job_loop_finish_erase(p_user uuid,p_generation bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle; prior_context text;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF p_generation IS NULL OR lifecycle.generation<>p_generation OR lifecycle.state NOT IN('erasing','erased') THEN RAISE EXCEPTION 'LOOP_ERASURE_STALE'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name LIKE p_user::text||'/%') THEN RAISE EXCEPTION 'LOOP_ERASURE_RETRY'; END IF;
  IF lifecycle.state='erased' THEN RETURN; END IF;
  prior_context:=current_setting('jobvance.loop.erasure_owner',true);
  PERFORM set_config('jobvance.loop.erasure_owner',p_user::text,true);
  PERFORM public.job_loop_finish_erase_unfenced(p_user);
  DELETE FROM public.job_loop_artifact_grants WHERE user_id=p_user;
  UPDATE public.job_loop_lifecycle SET state='erased',erasure_completed_at=now(),last_attempt_at=now() WHERE user_id=p_user;
  PERFORM set_config('jobvance.loop.erasure_owner',COALESCE(prior_context,''),true);
END $$;

-- Old workers/control deployments fail closed instead of bypassing the checked
-- generation and final storage-emptiness test through the former one-arg RPC.
CREATE FUNCTION public.job_loop_finish_erase(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'LOOP_ERASURE_GENERATION_REQUIRED'; END $$;

CREATE FUNCTION public.job_loop_authorize_artifact(p_user uuid,p_run uuid,p_lease uuid,p_packet uuid,p_hash text,p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_generation bigint; run public.job_loop_runs; artifact_path text;
BEGIN
  owner_generation:=public.job_loop_assert_writable(p_user,false);
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_key IS NULL OR p_key NOT IN('pdf','docx','txt','report','letter') OR p_packet IS NULL THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  SELECT * INTO run FROM public.job_loop_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR run.status<>'running' OR run.lease_token IS DISTINCT FROM p_lease OR run.lease_until IS NULL OR run.lease_until<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.job_loop_records r JOIN public.job_loop_pilot_users p ON p.user_id=r.user_id AND p.active WHERE r.user_id=p_user AND r.input_version=run.input_version)
    THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  artifact_path:=p_user::text||'/'||p_packet::text||'/'||p_hash||'/'||p_key;
  INSERT INTO public.job_loop_artifact_grants(user_id,path,run_id,lease_token,generation,expires_at)
    VALUES(p_user,artifact_path,p_run,p_lease,owner_generation,run.lease_until)
    ON CONFLICT(user_id,path) DO UPDATE SET run_id=EXCLUDED.run_id,lease_token=EXCLUDED.lease_token,
      generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at;
  RETURN artifact_path;
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_storage_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; owner_generation bigint; parts text[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.bucket_id='job-loop-artifacts' AND (OLD.bucket_id IS DISTINCT FROM NEW.bucket_id OR OLD.name IS DISTINCT FROM NEW.name) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  IF NEW.bucket_id<>'job-loop-artifacts' THEN RETURN NEW; END IF;
  parts:=string_to_array(NEW.name,'/');
  IF array_length(parts,1) IS DISTINCT FROM 4 OR parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR parts[3] !~ '^[a-f0-9]{64}$' OR parts[4] NOT IN('pdf','docx','txt','report','letter') THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  owner_id:=parts[1]::uuid;
  owner_generation:=public.job_loop_assert_writable(owner_id,false);
  IF NOT EXISTS(
    SELECT 1 FROM public.job_loop_artifact_grants grant_row
    JOIN public.job_loop_runs run ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
    JOIN public.job_loop_records record ON record.user_id=run.user_id AND record.input_version=run.input_version
    JOIN public.job_loop_pilot_users pilot ON pilot.user_id=run.user_id AND pilot.active
    WHERE grant_row.user_id=owner_id AND grant_row.path=NEW.name AND grant_row.generation=owner_generation
      AND grant_row.expires_at>clock_timestamp() AND run.status='running'
      AND run.lease_token=grant_row.lease_token AND run.lease_until>clock_timestamp()
  ) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER job_loop_storage_write_guard ON storage.objects;
CREATE TRIGGER job_loop_storage_write_guard BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.job_loop_storage_write_guard();

REVOKE ALL ON FUNCTION public.job_loop_erasure_owner_lock(uuid),public.job_loop_assert_writable(uuid,boolean),
  public.job_loop_mutation_erasure_guard(),public.job_loop_activity_trigger(),public.job_loop_storage_write_guard()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.job_loop_begin_erase(uuid),public.job_loop_erasure_batch(uuid,bigint,integer),
  public.job_loop_erasure_progress(uuid,bigint,integer),public.job_loop_finish_erase(uuid,bigint),public.job_loop_finish_erase(uuid),
  public.job_loop_authorize_artifact(uuid,uuid,uuid,uuid,text,text),public.job_loop_claim_due(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_begin_erase(uuid),public.job_loop_erasure_batch(uuid,bigint,integer),
  public.job_loop_erasure_progress(uuid,bigint,integer),public.job_loop_finish_erase(uuid,bigint),public.job_loop_finish_erase(uuid),
  public.job_loop_authorize_artifact(uuid,uuid,uuid,uuid,text,text),public.job_loop_claim_due(uuid,integer) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
