BEGIN;
-- Additive schedule authority. Existing rules schedules retain their semantics;
-- no existing schedule is converted to model processing.
ALTER TABLE public.job_loop_schedules ADD COLUMN bound_generation bigint, ADD COLUMN source_hash text, ADD COLUMN occurrence_request uuid;

CREATE FUNCTION public.job_loop_assert_schedule_entitlement(p_user uuid,p_cadence text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entitlement jsonb; allowance integer; requested integer;
BEGIN
  entitlement:=public.job_loop_billing_entitlement(p_user);
  IF entitlement->>'active'='true' THEN
    allowance:=COALESCE((entitlement->>'maxWeeklyRuns')::integer,0);
    requested:=CASE p_cadence WHEN 'weekly' THEN 1 WHEN 'three_weekly' THEN 3 WHEN 'weekdays' THEN 5 WHEN 'daily' THEN 7 ELSE 100 END;
    IF requested>allowance THEN RAISE EXCEPTION 'LOOP_SCHEDULE_ENTITLEMENT'; END IF;
  ELSE
    -- The ten-account free pilot remains an independently bounded entitlement.
    PERFORM public.job_loop_enroll_pilot(p_user);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_save_schedule_bound(p_user uuid,p_generation bigint,p_expected bigint,p_settings jsonb,p_next timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_schedules; career jsonb; current_source_hash text; consent jsonb; days integer; distinct_days integer;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' OR p_next IS NULL OR p_next<=now() OR p_next>now()+interval '15 days'
    OR NOT p_settings ?& ARRAY['cadence','timezone','localTime','weeklyDay','provider','model','modelConsent','inboxConsent']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN('cadence','timezone','localTime','weeklyDay','weeklyDays','provider','model','modelConsent','inboxConsent','processingRoute','recurringAiConsent','cvSelection'))
    OR jsonb_typeof(p_settings->'cadence') IS DISTINCT FROM 'string' OR jsonb_typeof(p_settings->'provider') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_settings->'model') IS DISTINCT FROM 'string' OR jsonb_typeof(p_settings->'localTime') IS DISTINCT FROM 'string'
    OR p_settings->>'cadence' NOT IN('daily','weekly','three_weekly','weekdays') OR p_settings->>'provider' NOT IN('rules','anthropic','openai','moonshot')
    OR jsonb_typeof(p_settings->'modelConsent') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_settings->'inboxConsent') IS DISTINCT FROM 'boolean'
    OR p_settings->>'localTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR length(p_settings->>'model') NOT BETWEEN 1 AND 150
    OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_settings->>'timezone') THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  IF p_settings->>'cadence'='weekly' THEN
    IF jsonb_typeof(p_settings->'weeklyDay') IS DISTINCT FROM 'number' OR p_settings->>'weeklyDay' !~ '^[0-6]$' THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  ELSIF p_settings->'weeklyDay' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  IF p_settings->>'cadence'='three_weekly' THEN
    IF jsonb_typeof(p_settings->'weeklyDays') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
    SELECT count(*),count(DISTINCT value) INTO days,distinct_days FROM jsonb_array_elements(p_settings->'weeklyDays');
    IF days<>3 OR distinct_days<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'weeklyDays') d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[0-6]$') THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  ELSIF p_settings ? 'weeklyDays' AND p_settings->'weeklyDays'<>'[]'::jsonb THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  IF p_settings->>'provider'<>'rules' THEN
    consent:=p_settings->'recurringAiConsent';
    IF p_settings->'modelConsent'<>'true'::jsonb OR COALESCE(p_settings->>'processingRoute','') NOT IN('direct','openrouter') OR p_settings->'cvSelection' IS NULL OR p_settings->'cvSelection'='null'::jsonb
      OR consent IS DISTINCT FROM jsonb_build_object('provider',p_settings->'provider','model',p_settings->'model','processingRoute',p_settings->'processingRoute','sourceScope','selected_cv','cvSelection',p_settings->'cvSelection','consented',true)
      THEN RAISE EXCEPTION 'LOOP_RECURRING_AI_CONSENT'; END IF;
  ELSIF p_settings ? 'recurringAiConsent' OR p_settings ? 'processingRoute' OR p_settings->>'model'<>'grounded-rules-v1' THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  PERFORM public.job_loop_assert_schedule_entitlement(p_user,p_settings->>'cadence');
  IF p_settings ? 'cvSelection' THEN career:=public.job_loop_resolve_cv_selection_bound(p_user,p_generation,p_settings->'cvSelection');
  ELSE SELECT data INTO career FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE; END IF;
  IF career IS NULL OR career->'profile' IS NULL OR career->'profile'='null'::jsonb OR jsonb_array_length(COALESCE(career->'claims','[]'))=0 THEN RAISE EXCEPTION 'LOOP_CLAIMS_REQUIRED'; END IF;
  current_source_hash:=encode(sha256(convert_to(jsonb_build_object('profile',career->'profile','claims',career->'claims')::text,'UTF8')),'hex');
  SELECT * INTO s FROM public.job_loop_schedules WHERE user_id=p_user FOR UPDATE;
  IF FOUND THEN
    -- An exact retry after a lost response observes the original occurrence;
    -- it cannot reset its time, override a later edit or resume a paused schedule.
    IF s.version=p_expected+1 AND s.status='active' AND s.settings=p_settings AND s.bound_generation=p_generation AND s.source_hash=current_source_hash THEN RETURN to_jsonb(s); END IF;
    IF s.version<>p_expected THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
    UPDATE public.job_loop_schedules SET settings=p_settings,status='active',version=version+1,next_run_at=p_next,lease_token=NULL,lease_until=NULL,occurrence_request=NULL,bound_generation=p_generation,source_hash=current_source_hash,message='Recurring preparation enabled by you.',updated_at=now() WHERE user_id=p_user RETURNING * INTO s;
  ELSE
    IF p_expected<>0 THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
    INSERT INTO public.job_loop_schedules(user_id,version,status,settings,next_run_at,bound_generation,source_hash,message) VALUES(p_user,1,'active',p_settings,p_next,p_generation,current_source_hash,'Recurring preparation enabled by you.') RETURNING * INTO s;
  END IF;
  RETURN to_jsonb(s);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_claim_due(p_lease uuid,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate uuid; schedule public.job_loop_schedules; lifecycle public.job_loop_lifecycle; result jsonb:='[]';
BEGIN
  IF p_lease IS NULL THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  FOR candidate IN SELECT s.user_id FROM public.job_loop_schedules s LEFT JOIN public.job_loop_lifecycle l ON l.user_id=s.user_id
    WHERE s.status='active' AND s.next_run_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now()) AND COALESCE(l.state,'active')='active'
    ORDER BY s.user_id LIMIT least(greatest(p_limit,1),10)
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||candidate::text,8190711)) THEN CONTINUE; END IF;
    lifecycle:=public.job_loop_erasure_owner_lock(candidate); IF lifecycle.state<>'active' THEN CONTINUE; END IF;
    SELECT * INTO schedule FROM public.job_loop_schedules s WHERE s.user_id=candidate AND s.status='active' AND s.next_run_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now()) FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE public.job_loop_schedules SET lease_token=p_lease,lease_until=now()+interval '5 minutes',last_attempt_at=now(),occurrence_request=COALESCE(occurrence_request,gen_random_uuid()) WHERE user_id=candidate RETURNING * INTO schedule;
    result:=result||jsonb_build_array(to_jsonb(schedule));
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_start_scheduled_run(p_user uuid,p_lease uuid,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_schedules; r jsonb; career jsonb; generation bigint; entitlement jsonb; weekly_limit integer; local_day date; tz text;
BEGIN
  generation:=public.job_loop_assert_writable(p_user,false);
  SELECT * INTO s FROM public.job_loop_schedules WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR s.status<>'active' OR s.lease_token IS DISTINCT FROM p_lease OR s.lease_until<now() OR s.next_run_at>now() OR s.occurrence_request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  IF s.bound_generation IS NOT NULL AND s.bound_generation<>generation THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  IF s.settings->>'provider' IS DISTINCT FROM p_provider OR s.settings->>'model' IS DISTINCT FROM p_model
    OR p_consents->'model' IS DISTINCT FROM s.settings->'modelConsent' OR p_consents->'inbox' IS DISTINCT FROM s.settings->'inboxConsent'
    OR (p_provider<>'rules' AND (p_consents->'processingRoute' IS DISTINCT FROM s.settings->'processingRoute' OR s.settings->'recurringAiConsent' IS NULL)) THEN RAISE EXCEPTION 'LOOP_SCHEDULE_CONFLICT'; END IF;
  -- An existing occurrence owns its immutable snapshot. Never create a second run
  -- after a lost response, lease recovery, source edit or entitlement transition.
  SELECT to_jsonb(j) INTO r FROM public.job_loop_runs j WHERE user_id=p_user AND request_id=p_request;
  IF FOUND THEN
    IF r->>'request_hash'<>p_request_hash THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    RETURN r;
  END IF;
  PERFORM public.job_loop_assert_schedule_entitlement(p_user,s.settings->>'cadence');
  IF s.settings ? 'cvSelection' THEN career:=public.job_loop_resolve_cv_selection_bound(p_user,generation,s.settings->'cvSelection');
  ELSE SELECT data INTO career FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE; END IF;
  IF s.source_hash IS NOT NULL AND s.source_hash<>encode(sha256(convert_to(jsonb_build_object('profile',career->'profile','claims',career->'claims')::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'LOOP_SCHEDULE_SOURCE_CHANGED'; END IF;
  IF p_provider<>'rules' AND (s.bound_generation IS NULL OR s.settings->'recurringAiConsent' IS DISTINCT FROM jsonb_build_object('provider',s.settings->'provider','model',s.settings->'model','processingRoute',s.settings->'processingRoute','sourceScope','selected_cv','cvSelection',s.settings->'cvSelection','consented',true)) THEN RAISE EXCEPTION 'LOOP_RECURRING_AI_CONSENT'; END IF;
  tz:=s.settings->>'timezone'; local_day:=(now() AT TIME ZONE tz)::date;
  IF EXISTS(SELECT 1 FROM public.job_loop_runs WHERE user_id=p_user AND consents->>'scheduled'='true' AND (created_at AT TIME ZONE tz)::date=local_day) THEN RAISE EXCEPTION 'LOOP_DAILY_SCHEDULE_LIMIT'; END IF;
  entitlement:=public.job_loop_billing_entitlement(p_user);
  weekly_limit:=CASE WHEN entitlement->>'active'='true' THEN COALESCE((entitlement->>'maxWeeklyRuns')::integer,0) ELSE 7 END;
  IF (SELECT count(*) FROM public.job_loop_runs WHERE user_id=p_user AND consents->>'scheduled'='true' AND date_trunc('week',created_at AT TIME ZONE tz)=date_trunc('week',now() AT TIME ZONE tz))>=weekly_limit THEN RAISE EXCEPTION 'LOOP_WEEKLY_SCHEDULE_LIMIT'; END IF;
  -- Daily means each calendar day, including day 31; there is no 30-run monthly ceiling.
  p_consents:=p_consents||jsonb_build_object('scheduled',true,'scheduleVersion',s.version,'scheduledFor',s.next_run_at,'scheduleTimezone',tz);
  IF s.settings ? 'cvSelection' THEN
    r:=public.job_loop_start_variant_run_bound(p_user,generation,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents,s.settings->'cvSelection',NULL);
  ELSE r:=public.job_loop_start_run_bound(p_user,generation,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents); END IF;
  UPDATE public.job_loop_schedules SET last_run_id=(r->>'id')::uuid WHERE user_id=p_user;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_finish_schedule(p_user uuid,p_lease uuid,p_next timestamptz,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_writable(p_user,false);
  IF p_next IS NULL OR p_next<=now() OR p_next>now()+interval '15 days' THEN RAISE EXCEPTION 'LOOP_SCHEDULE_INVALID'; END IF;
  UPDATE public.job_loop_schedules SET next_run_at=p_next,lease_token=NULL,lease_until=NULL,occurrence_request=NULL,message=left(p_message,500),updated_at=now()
  WHERE user_id=p_user AND status='active' AND lease_token=p_lease AND lease_until>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.job_loop_assert_schedule_entitlement(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_assert_schedule_entitlement(uuid,text) TO service_role;
-- Replaced routines retain their previous service-only ACLs.
COMMIT;
