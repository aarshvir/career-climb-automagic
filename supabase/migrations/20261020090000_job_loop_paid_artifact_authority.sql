BEGIN;

-- A live paid subscriber is admitted to runs, schedules and reservations by
-- job_loop_enroll_pilot (20261018073501), which returns before taking a free
-- pilot seat when job_loop_billing_entitlement is active. Document authority
-- still required an active pilot seat, so a paid account that never joined the
-- pilot reached artifact authorization with a valid lease and was refused as
-- LOOP_LEASE_LOST (and its Storage insert as LOOP_ARTIFACT_UNAUTHORIZED).
--
-- Only that seat predicate changes: an active pilot seat OR the existing paid
-- entitlement. Lease, generation, tombstone, GC state, grant, run status and
-- input_version checks are copied unchanged from 20261014101107/20261014161126.
-- Nothing here creates a pilot seat or changes capacity, billing or erasure.

CREATE FUNCTION public.job_loop_service_active(p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  -- A free pilot seat keeps its existing authority without consulting billing.
  IF EXISTS(SELECT 1 FROM public.job_loop_pilot_users WHERE user_id=p_user AND active) THEN RETURN true; END IF;
  -- Exactly the paid access rule used for admission: live, unrevoked, current
  -- paid service period or provider grace, bound to the active lifecycle.
  RETURN COALESCE((public.job_loop_billing_entitlement(p_user)->>'active')::boolean,false);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_authorize_artifact_pre_gc(p_user uuid,p_run uuid,p_lease uuid,p_packet uuid,p_hash text,p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_generation bigint; run public.job_loop_runs; artifact_path text;
BEGIN
  owner_generation:=public.job_loop_assert_writable(p_user,false);
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_key IS NULL OR p_key NOT IN('pdf','docx','txt','report','letter') OR p_packet IS NULL THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  SELECT * INTO run FROM public.job_loop_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR run.status<>'running' OR run.lease_token IS DISTINCT FROM p_lease OR run.lease_until IS NULL OR run.lease_until<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.job_loop_records r WHERE r.user_id=p_user AND r.input_version=run.input_version)
    OR NOT public.job_loop_service_active(p_user)
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
    OR NOT public.job_loop_gc_canonical_path(parts[1]::uuid,NEW.name) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  owner_id:=parts[1]::uuid;
  owner_generation:=public.job_loop_assert_writable(owner_id,false);
  -- The former pilot join was keyed by run.user_id, which the grant join fixes
  -- to owner_id; the same predicate is therefore evaluated for owner_id.
  IF EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones WHERE path=NEW.name)
    OR NOT EXISTS(
    SELECT 1 FROM public.job_loop_artifact_grants grant_row
    JOIN public.job_loop_runs run ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
    JOIN public.job_loop_records record ON record.user_id=run.user_id AND record.input_version=run.input_version
    WHERE grant_row.user_id=owner_id AND grant_row.path=NEW.name AND grant_row.generation=owner_generation AND grant_row.gc_state='available'
      AND grant_row.expires_at>clock_timestamp() AND run.status='running'
      AND run.lease_token=grant_row.lease_token AND run.lease_until>clock_timestamp()
  ) OR NOT public.job_loop_service_active(owner_id) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  RETURN NEW;
END $$;

-- Same ACLs as the originals: internal definer helpers only. The public
-- job_loop_authorize_artifact wrapper keeps its existing service_role grant.
REVOKE ALL ON FUNCTION public.job_loop_service_active(uuid),
  public.job_loop_authorize_artifact_pre_gc(uuid,uuid,uuid,uuid,text,text),
  public.job_loop_storage_write_guard() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
