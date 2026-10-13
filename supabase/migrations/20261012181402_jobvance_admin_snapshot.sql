BEGIN;

-- A caller-supplied future created_at cannot extend the two-minute capability.
ALTER TABLE public.jobvance_admin_task_tickets ADD CONSTRAINT jobvance_admin_ticket_wall_clock_bound
CHECK(created_at<=now() AND expires_at<=now()+interval '2 minutes');

CREATE FUNCTION public.jobvance_admin_metric(p_key text,p_label text,p_count bigint,p_denominator bigint,p_source text,p_definition text,p_availability text DEFAULT 'measured') RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
SELECT jsonb_build_object('key',p_key,'label',p_label,'count',p_count,'denominator',p_denominator,
  'percent',CASE WHEN p_denominator>0 AND p_count IS NOT NULL THEN round(p_count*100.0/p_denominator,2) ELSE NULL END,
  'source',p_source,'definition',p_definition,'availability',p_availability,
  'smallSample',p_availability='measured' AND COALESCE(p_denominator,p_count,0)<10)
$$;

CREATE FUNCTION public.jobvance_admin_snapshot(p_actor uuid,p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE actor_role text; ending timestamptz:=now(); starting timestamptz; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); c public.jobvance_admin_config; s public.job_loop_scheduler_config;
  users_json jsonb; support_json jsonb; runs_json jsonb; audit_json jsonb; funnel_json jsonb; metrics_json jsonb; retention_json jsonb;
  real_users bigint; qa_users bigint; cohort bigint; profiles bigint; evidence bigint; completed bigint; approved bigint; downloads bigint;
  mature bigint; returned bigint; first_preparation bigint; repeat_preparation bigint; committed bigint; candidate_actual bigint; admin_actual bigint; reserved bigint; uncertain bigint;
BEGIN
  actor_role:=public.jobvance_assert_admin(p_actor);
  IF p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'ADMIN_INPUT_INVALID'; END IF;
  starting:=ending-make_interval(days=>p_days);
  SELECT * INTO c FROM public.jobvance_admin_config WHERE singleton;
  SELECT * INTO s FROM public.job_loop_scheduler_config WHERE singleton;
  -- Metadata can exclude a fixture, never grant membership. Reserved test domains
  -- cover old hosted QA accounts whose metadata marker predates the current test.
  WITH people AS (SELECT u.*,COALESCE(u.raw_user_meta_data->>'qa_fixture','false')='true' OR lower(COALESCE(u.email,'')) ~ '@(example\.(com|org|net)|test\.invalid)$' AS qa FROM auth.users u)
  SELECT count(*) FILTER(WHERE NOT qa),count(*) FILTER(WHERE qa) INTO real_users,qa_users FROM people;
  WITH people AS (SELECT u.id,u.email,u.created_at FROM auth.users u WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$'),
  limited AS (SELECT * FROM people ORDER BY created_at DESC,id LIMIT 200)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'emailDisplay',CASE WHEN u.email IS NULL THEN '(no email)' ELSE left(split_part(u.email,'@',1),1)||'***@'||split_part(u.email,'@',2) END,'joinedAt',u.created_at,
    'hasProfile',r.data->'profile' IS NOT NULL AND r.data->'profile'<>'null'::jsonb,
    'claims',(SELECT count(*) FROM jsonb_array_elements(COALESCE(r.data->'claims','[]'::jsonb)) x WHERE x->>'status'='active'),
    'shareableClaims',(SELECT count(*) FROM jsonb_array_elements(COALESCE(r.data->'claims','[]'::jsonb)) x WHERE x->>'status'='active' AND x->>'confirmed'='true' AND x->>'shareable'='true'),
    'completedRuns',(SELECT count(*) FROM public.job_loop_runs x WHERE x.user_id=u.id AND x.status='completed'),
    'failedRuns',(SELECT count(*) FROM public.job_loop_runs x WHERE x.user_id=u.id AND x.status='failed'),
    'pilotActive',EXISTS(SELECT 1 FROM public.job_loop_pilot_users p WHERE p.user_id=u.id AND p.active)) ORDER BY u.created_at DESC,u.id),'[]'::jsonb)
  INTO users_json FROM limited u LEFT JOIN public.job_loop_records r ON r.user_id=u.id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'emailDisplay',CASE WHEN q.email IS NULL THEN '(no email)' ELSE left(split_part(q.email,'@',1),1)||'***@'||split_part(q.email,'@',2) END,'category',q.category,'status',q.status,'createdAt',q.created_at,'version',q.admin_version,'messageAvailable',true) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
  INTO support_json FROM (SELECT r.id,r.user_id,r.category,r.status,r.created_at,r.admin_version,u.email FROM public.job_loop_support_requests r JOIN auth.users u ON u.id=r.user_id
    WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$' ORDER BY r.created_at DESC,r.id LIMIT 100) q;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'status',q.status,'phase',q.phase,'provider',q.provider,'model',q.model,'createdAt',q.created_at,'finishedAt',q.finished_at) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
  INTO runs_json FROM (SELECT r.id,r.user_id,r.status,r.phase,r.provider,r.model,r.created_at,r.finished_at FROM public.job_loop_runs r JOIN auth.users u ON u.id=r.user_id
    WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$' AND r.created_at>=starting AND r.created_at<ending ORDER BY r.created_at DESC,r.id LIMIT 100) q;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'actorId',q.actor_id,'action',q.action,'targetId',q.target_id,'at',q.at,'details',q.details) ORDER BY q.at DESC,q.id),'[]'::jsonb) INTO audit_json FROM (SELECT * FROM public.jobvance_admin_audit ORDER BY at DESC,id LIMIT 30) q;

  WITH people AS (SELECT u.id,u.created_at FROM auth.users u WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$' AND u.created_at>=starting AND u.created_at<ending),
  stages AS (SELECT p.*,
    r.data->'profile' IS NOT NULL AND r.data->'profile'<>'null'::jsonb AS profile,
    EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.data->'claims','[]'::jsonb)) x WHERE x->>'status'='active' AND x->>'confirmed'='true' AND x->>'shareable'='true') AS evidence,
    EXISTS(SELECT 1 FROM public.job_loop_runs x WHERE x.user_id=p.id AND x.status='completed' AND x.created_at>=p.created_at AND x.created_at<ending) AS completed,
    EXISTS(SELECT 1 FROM public.job_loop_packets x WHERE x.user_id=p.id AND x.status='approved' AND x.approved_at>=p.created_at AND x.approved_at<ending) AS approved,
    EXISTS(SELECT 1 FROM public.job_loop_activity x WHERE x.user_id=p.id AND x.kind='download_requested' AND x.at>=p.created_at AND x.at<ending) AS download
  FROM people p LEFT JOIN public.job_loop_records r ON r.user_id=p.id)
  SELECT count(*),count(*) FILTER(WHERE st.profile),count(*) FILTER(WHERE st.profile AND st.evidence),count(*) FILTER(WHERE st.profile AND st.evidence AND st.completed),count(*) FILTER(WHERE st.profile AND st.evidence AND st.completed AND st.approved),count(*) FILTER(WHERE st.profile AND st.evidence AND st.completed AND st.approved AND st.download)
  INTO cohort,profiles,evidence,completed,approved,downloads FROM stages st;
  funnel_json:=jsonb_build_array(
    public.jobvance_admin_metric('signup','New registered accounts',cohort,NULL,'auth.users.created_at','Non-QA registered accounts created inside this UTC window. Guest visits are untracked.'),
    public.jobvance_admin_metric('profile','Current reusable profile',profiles,cohort,'auth.users + job_loop_records','New-account cohort with a saved profile at snapshot time. Current state, not immutable historical attainment.'),
    public.jobvance_admin_metric('evidence','Confirmed shareable evidence',evidence,profiles,'job_loop_records.data.claims','Previous profile stage plus at least one currently active, confirmed, shareable claim.'),
    public.jobvance_admin_metric('completed','Completed preparation',completed,evidence,'job_loop_runs.status','Previous evidence stage plus a real completed run since signup. Partial, blocked and failed runs do not count.'),
    public.jobvance_admin_metric('approved','Current packet approval',approved,completed,'job_loop_packets.status + approved_at','Previous completed stage plus a currently approved packet since signup. Revoked approvals do not count.'),
    public.jobvance_admin_metric('download_requested','Requested download link',downloads,approved,'job_loop_activity.kind=download_requested','Previous approval stage plus a retained server download-link request since signup. Browser completion is untracked.')
  );
  WITH people AS (SELECT u.id,u.created_at FROM auth.users u WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$'), events AS (
    SELECT 'completed_runs' AS kind,count(*) AS n FROM public.job_loop_runs r JOIN people p ON p.id=r.user_id WHERE r.status='completed' AND r.finished_at>=starting AND r.finished_at<ending
    UNION ALL SELECT 'failed_runs',count(*) FROM public.job_loop_runs r JOIN people p ON p.id=r.user_id WHERE r.status='failed' AND r.finished_at>=starting AND r.finished_at<ending
    UNION ALL SELECT 'approved_checks',count(*) FROM public.cv_checks r JOIN people p ON p.id=r.user_id WHERE r.status='approved' AND r.created_at>=starting AND r.created_at<ending
    UNION ALL SELECT 'download_requests',count(*) FROM public.job_loop_activity r JOIN people p ON p.id=r.user_id WHERE r.kind='download_requested' AND r.at>=starting AND r.at<ending
  ) SELECT jsonb_build_array(
    public.jobvance_admin_metric('completed_runs','Completed runs',(SELECT n FROM events WHERE kind='completed_runs'),NULL,'job_loop_runs.status + finished_at','Real completed runs finished inside the UTC window; excludes QA and partial runs.'),
    public.jobvance_admin_metric('failed_runs','Failed runs',(SELECT n FROM events WHERE kind='failed_runs'),NULL,'job_loop_runs.status + finished_at','Real failed runs finished inside the UTC window; blocked and partial are separate states.'),
    public.jobvance_admin_metric('approved_checks','Approved account CV checks',(SELECT n FROM events WHERE kind='approved_checks'),NULL,'cv_checks.status + created_at','Approved account-backed checks created inside the window. Guest checks are not persisted here.'),
    public.jobvance_admin_metric('download_requests','Download links requested',(SELECT n FROM events WHERE kind='download_requests'),NULL,'job_loop_activity.kind + at','Retained server requests in the window; activity keeps at most 200 records per account, so older coverage can be partial.'),
    public.jobvance_admin_metric('guest_visits','Guest visits',NULL,NULL,'No complete server telemetry','Historical guest visits and checks are untracked.','untracked'),
    public.jobvance_admin_metric('download_completion','Browser downloads completed',NULL,NULL,'No completion telemetry','A requested signed link cannot establish actual browser download completion.','untracked')
  ) INTO metrics_json;
  WITH cohort_users AS (SELECT u.id,u.created_at FROM auth.users u WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$' AND u.created_at>=starting AND u.created_at<=ending-interval '14 days')
  SELECT count(*),count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.job_loop_activity a WHERE a.user_id=u.id AND a.actor='candidate' AND a.at>=u.created_at+interval '7 days' AND a.at<u.created_at+interval '14 days') OR EXISTS(SELECT 1 FROM public.cv_checks v WHERE v.user_id=u.id AND v.created_at>=u.created_at+interval '7 days' AND v.created_at<u.created_at+interval '14 days')) INTO mature,returned FROM cohort_users u;
  WITH counts AS (SELECT r.user_id,count(*) AS n FROM public.job_loop_runs r JOIN auth.users u ON u.id=r.user_id WHERE COALESCE(u.raw_user_meta_data->>'qa_fixture','false')<>'true' AND lower(COALESCE(u.email,'')) !~ '@(example\.(com|org|net)|test\.invalid)$' AND r.status='completed' AND r.finished_at>=starting AND r.finished_at<ending GROUP BY r.user_id)
  SELECT count(*),count(*) FILTER(WHERE n>=2) INTO first_preparation,repeat_preparation FROM counts;
  retention_json:=jsonb_build_array(
    public.jobvance_admin_metric('week2_return','Week-two observed return',returned,mature,'auth.users + candidate job_loop_activity + cv_checks','Accounts created within this window and at least 14 days old; numerator has a retained candidate action or account CV check during days 7 through 13 after signup. Login-only return is untracked; activity retention can limit coverage.'),
    public.jobvance_admin_metric('repeat_preparation','Repeated completed preparation',repeat_preparation,first_preparation,'job_loop_runs.status + finished_at','Users with at least two completed runs in the window / users with at least one. Scheduled preparations count; this is use of preparation, not a confirmed candidate return.')
  );
  SELECT COALESCE(committed_micros,0) INTO committed FROM public.job_loop_budget_months WHERE month=month_key;
  SELECT COALESCE(sum(actual_micros) FILTER(WHERE status='settled'),0) INTO candidate_actual FROM public.job_loop_usage WHERE month=month_key;
  SELECT COALESCE(sum(actual_micros) FILTER(WHERE status='settled'),0) INTO admin_actual FROM public.jobvance_admin_model_usage WHERE month=month_key;
  SELECT COALESCE(sum(reserved_micros) FILTER(WHERE status='reserved'),0),COALESCE(sum(reserved_micros) FILTER(WHERE status='uncertain'),0) INTO reserved,uncertain FROM (
    SELECT reserved_micros,status FROM public.job_loop_usage WHERE month=month_key UNION ALL SELECT reserved_micros,status FROM public.jobvance_admin_model_usage WHERE month=month_key
  ) x;
  RETURN jsonb_build_object('actor',jsonb_build_object('id',p_actor,'role',actor_role),'generatedAt',ending,'window',jsonb_build_object('days',p_days,'start',starting,'end',ending,'timezone','UTC'),
    'coverage',jsonb_build_object('excludedQaUsers',qa_users,'usersTotal',real_users,'usersListed',jsonb_array_length(users_json),'listLimit',200,'notes',jsonb_build_array('QA marker and reserved test domains are excluded from user, funnel and operational lists. Metadata never grants administration access.','User and support lists are capped at 200 and 100; recent runs at 100. Aggregate denominators cover all matching accounts.','Career records and packet approval are current retained state, so erasure, correction and revocation affect funnel counts.','Candidate activity keeps at most 200 records per account; older download and return observations can be incomplete.','Shared budget includes actual QA costs. The monthly committed ledger is authoritative even if a candidate erased detailed usage.')),
    'config',jsonb_build_object('version',c.version,'schedulerEnabled',s.enabled,'monthlyCapUsd',c.monthly_cap_micros/1000000.0,'routerEnabled',c.router_enabled,'defaultModel',c.default_model,'reasoning',c.reasoning,'updatedAt',c.updated_at),
    'operations',jsonb_build_object('users',users_json,'support',support_json,'recentRuns',runs_json,
      'scheduler',jsonb_build_object('enabled',s.enabled,'ready',false,'lastDispatchAt',s.last_dispatch_at,'activeSchedules',(SELECT count(*) FROM public.job_loop_schedules WHERE status='active'),'dueSchedules',(SELECT count(*) FROM public.job_loop_schedules WHERE status='active' AND next_run_at<=ending),'staleLeases',(SELECT count(*) FROM public.job_loop_schedules WHERE status='active' AND lease_until<ending),'message','Global scheduler state; readiness additionally requires the server worker configuration. Schedule counts include QA because they occupy real worker capacity.'),
      'pilot',jsonb_build_object('activeUsers',(SELECT count(*) FROM public.job_loop_pilot_users WHERE active),'capacity',10,'qaOccupancy',(SELECT count(*) FROM public.job_loop_pilot_users p JOIN auth.users u ON u.id=p.user_id WHERE p.active AND (COALESCE(u.raw_user_meta_data->>'qa_fixture','false')='true' OR lower(COALESCE(u.email,'')) ~ '@(example\.(com|org|net)|test\.invalid)$')))),
    'analytics',jsonb_build_object('milestones',metrics_json,'funnel',funnel_json,'retention',retention_json,'revenue',jsonb_build_object('checkoutEnabled',false,'recognizedUsd',NULL,'message','Checkout remains disabled. No revenue or willingness-to-pay conversion is inferred from free activity.'),
      'budget',jsonb_build_object('month',month_key,'capUsd',c.monthly_cap_micros/1000000.0,'committedUsd',COALESCE(committed,0)/1000000.0,'remainingUsd',greatest(0,c.monthly_cap_micros-COALESCE(committed,0))/1000000.0,'actualUsd',(candidate_actual+admin_actual)/1000000.0,'reservedUsd',reserved/1000000.0,'uncertainUsd',uncertain/1000000.0,'candidateActualUsd',candidate_actual/1000000.0,'adminActualUsd',admin_actual/1000000.0,'reviewBatchCapUsd',5,'source','job_loop_budget_months + job_loop_usage + jobvance_admin_model_usage')),
    'audit',audit_json,'providerStatus',NULL);
END $$;

-- Every candidate reservation uses the same bounded private configuration.
CREATE OR REPLACE FUNCTION public.job_loop_reserve(p_user uuid,p_run uuid,p_lease uuid,p_key text,p_provider text,p_micros bigint,p_cap_micros bigint DEFAULT 50000000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.job_loop_usage; created public.job_loop_usage; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); r public.job_loop_runs; effective_cap bigint;
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
  SELECT least(p_cap_micros,monthly_cap_micros) INTO effective_cap FROM public.jobvance_admin_config WHERE singleton;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros+p_micros WHERE month=month_key AND committed_micros+p_micros<=effective_cap;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  INSERT INTO public.job_loop_usage(user_id,run_id,operation_key,month,provider,reserved_micros) VALUES(p_user,p_run,p_key,month_key,p_provider,p_micros) RETURNING * INTO created;
  RETURN to_jsonb(created)||'{"is_new":true}'::jsonb;
END $$;
CREATE OR REPLACE FUNCTION public.job_loop_reserve_legacy(p_user uuid,p_run uuid,p_lease uuid,p_key text,p_provider text,p_micros bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.job_loop_reserve(p_user,p_run,p_lease,p_key,p_provider,p_micros,50000000)
$$;
REVOKE ALL ON FUNCTION public.jobvance_admin_snapshot(uuid,integer),public.jobvance_admin_metric(text,text,bigint,bigint,text,text,text),public.job_loop_reserve(uuid,uuid,uuid,text,text,bigint,bigint),public.job_loop_reserve_legacy(uuid,uuid,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_admin_snapshot(uuid,integer),public.job_loop_reserve(uuid,uuid,uuid,text,text,bigint,bigint),public.job_loop_reserve_legacy(uuid,uuid,uuid,text,text,bigint) TO service_role;

COMMIT;
