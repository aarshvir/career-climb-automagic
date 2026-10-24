BEGIN;
-- Owner-authorized 24 October: 100 paid accounts, independently of the existing
-- ten-account free pilot. Unexpired paid checkout reservations count once per
-- owner; the shared admission lock prevents concurrent overselling. Existing
-- service periods, consent, lifecycle, grants, GC fences and budgets are retained.

CREATE OR REPLACE FUNCTION public.job_loop_billing_assert_capacity(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owners uuid[];
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_BILLING_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(8190710);
  SELECT array_agg(DISTINCT id) INTO owners FROM (
    SELECT b.user_id id FROM jobvance_private.loop_subscriptions b WHERE mode='live' AND NOT revoked
      AND ((status IN('active','cancelled') AND valid_until>now()) OR (status='past_due' AND grace_until>now()))
      AND (generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle l WHERE l.user_id=b.user_id AND l.generation=b.generation AND l.state='active'))
    UNION SELECT user_id FROM jobvance_private.loop_billing_orders WHERE mode='live' AND state IN('creating','ready','uncertain') AND capacity_until>now()
  ) occupied;
  IF p_user=ANY(COALESCE(owners,'{}'::uuid[])) THEN RETURN; END IF;
  IF COALESCE(array_length(owners,1),0)>=100 THEN RAISE EXCEPTION 'LOOP_PILOT_FULL'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.job_loop_enroll_pilot(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  PERFORM public.job_loop_assert_writable(p_user,true);
  IF (public.job_loop_billing_entitlement(p_user)->>'active')::boolean THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions WHERE user_id=p_user AND mode='live') THEN RAISE EXCEPTION 'LOOP_SUBSCRIPTION_REQUIRED'; END IF;
  PERFORM public.job_loop_enroll_pilot_unfenced(p_user);
END $function$;

CREATE OR REPLACE FUNCTION public.job_loop_budget_snapshot(p_user uuid, p_cap_micros bigint DEFAULT 50000000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE committed bigint; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
BEGIN
  IF p_cap_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'LOOP_BUDGET_LIMIT'; END IF;
  SELECT committed_micros INTO committed FROM public.job_loop_budget_months WHERE month=month_key;
  RETURN jsonb_build_object('month',month_key,'capUsd',p_cap_micros/1000000.0,'committedUsd',COALESCE(committed,0)/1000000.0,'remainingUsd',greatest(0,p_cap_micros-COALESCE(committed,0))/1000000.0,'scope','shared_ai_search','maxPilotUsers',10,
    'enrolled',COALESCE(public.job_loop_billing_entitlement(p_user)->>'active','false')='true','activeUsers',(SELECT count(*) FROM public.job_loop_pilot_users WHERE active),'maxUsers',10);
END $function$;

CREATE OR REPLACE FUNCTION public.job_loop_authorize_artifact_pre_gc(p_user uuid, p_run uuid, p_lease uuid, p_packet uuid, p_hash text, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_generation bigint; run public.job_loop_runs; artifact_path text;
BEGIN
  owner_generation:=public.job_loop_assert_writable(p_user,false);
  IF COALESCE(public.job_loop_billing_entitlement(p_user)->>'active','false')<>'true' THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_key IS NULL OR p_key NOT IN('pdf','docx','txt','report','letter') OR p_packet IS NULL THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  SELECT * INTO run FROM public.job_loop_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR run.status<>'running' OR run.lease_token IS DISTINCT FROM p_lease OR run.lease_until IS NULL OR run.lease_until<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.job_loop_records r WHERE r.user_id=p_user AND r.input_version=run.input_version)
    THEN RAISE EXCEPTION 'LOOP_LEASE_LOST'; END IF;
  artifact_path:=p_user::text||'/'||p_packet::text||'/'||p_hash||'/'||p_key;
  INSERT INTO public.job_loop_artifact_grants(user_id,path,run_id,lease_token,generation,expires_at)
    VALUES(p_user,artifact_path,p_run,p_lease,owner_generation,run.lease_until)
    ON CONFLICT(user_id,path) DO UPDATE SET run_id=EXCLUDED.run_id,lease_token=EXCLUDED.lease_token,
      generation=EXCLUDED.generation,expires_at=EXCLUDED.expires_at;
  RETURN artifact_path;
END $function$;

CREATE OR REPLACE FUNCTION public.job_loop_storage_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_id uuid; owner_generation bigint; parts text[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.bucket_id='job-loop-artifacts' AND (OLD.bucket_id IS DISTINCT FROM NEW.bucket_id OR OLD.name IS DISTINCT FROM NEW.name) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  IF NEW.bucket_id<>'job-loop-artifacts' THEN RETURN NEW; END IF;
  parts:=string_to_array(NEW.name,'/');
  IF array_length(parts,1) IS DISTINCT FROM 4 OR parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT public.job_loop_gc_canonical_path(parts[1]::uuid,NEW.name) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  owner_id:=parts[1]::uuid;
  owner_generation:=public.job_loop_assert_writable(owner_id,false);
  IF COALESCE(public.job_loop_billing_entitlement(owner_id)->>'active','false')<>'true'
    OR EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones WHERE path=NEW.name)
    OR NOT EXISTS(
    SELECT 1 FROM public.job_loop_artifact_grants grant_row
    JOIN public.job_loop_runs run ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
    JOIN public.job_loop_records record ON record.user_id=run.user_id AND record.input_version=run.input_version
    WHERE grant_row.user_id=owner_id AND grant_row.path=NEW.name AND grant_row.generation=owner_generation AND grant_row.gc_state='available'
      AND grant_row.expires_at>clock_timestamp() AND run.status='running'
      AND run.lease_token=grant_row.lease_token AND run.lease_until>clock_timestamp()
  ) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  RETURN NEW;
END $function$;

-- Replacements retain existing ownership and ACLs; assert intended entrypoints.
REVOKE ALL ON FUNCTION public.job_loop_billing_assert_capacity(uuid),public.job_loop_enroll_pilot(uuid),public.job_loop_budget_snapshot(uuid,bigint),public.job_loop_authorize_artifact_pre_gc(uuid,uuid,uuid,uuid,text,text),public.job_loop_storage_write_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_assert_capacity(uuid),public.job_loop_enroll_pilot(uuid),public.job_loop_budget_snapshot(uuid,bigint) TO service_role;
COMMIT;

