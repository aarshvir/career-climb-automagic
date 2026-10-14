BEGIN;

-- Deliberately inert at rollout. Operators may allow only explicitly reviewed
-- synthetic identities; neither a browser nor the maintenance handler can turn
-- this switch on or expand the allowlist through these RPCs.
CREATE TABLE public.job_loop_gc_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  allowed_owner_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK(cardinality(allowed_owner_ids)<=10 AND array_position(allowed_owner_ids,NULL) IS NULL),
  last_owner_id uuid
);
INSERT INTO public.job_loop_gc_config(singleton) VALUES(true);

ALTER TABLE public.job_loop_artifact_grants
  ADD COLUMN gc_state text NOT NULL DEFAULT 'available' CHECK(gc_state IN('available','claimed','collected')),
  ADD COLUMN gc_token uuid,
  ADD COLUMN gc_expires_at timestamptz,
  ADD COLUMN gc_claimed_at timestamptz,
  ADD COLUMN gc_collected_at timestamptz;

-- These opaque path fences intentionally outlive Loop/run erasure. Otherwise a
-- delayed Storage DELETE could remove an exact path reused in a fresh lifetime.
-- No career text, file bytes, run FK or externally supplied metadata is retained.
CREATE TABLE public.job_loop_artifact_tombstones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text PRIMARY KEY,
  generation bigint NOT NULL CHECK(generation>=0),
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN('claimed','collected')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz
);
CREATE INDEX job_loop_gc_grants_pending ON public.job_loop_artifact_grants(user_id,generation,gc_state,gc_expires_at,run_id,path)
  WHERE gc_state<>'collected';
CREATE INDEX job_loop_gc_terminal_runs ON public.job_loop_runs(user_id,finished_at,id)
  WHERE status IN('cancelled','completed');
CREATE INDEX job_loop_gc_tombstone_claim ON public.job_loop_artifact_tombstones(user_id,generation,token,path);
ALTER TABLE public.job_loop_gc_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_loop_artifact_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_gc_config,public.job_loop_artifact_tombstones FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.job_loop_gc_config,public.job_loop_artifact_tombstones TO service_role;
-- Upload and collection write only through their serialized definer routines.
REVOKE INSERT,UPDATE,DELETE ON public.job_loop_artifact_grants FROM service_role;

CREATE FUNCTION public.job_loop_gc_canonical_path(p_user uuid,p_path text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_user IS NOT NULL AND p_path IS NOT NULL AND p_path ~
    ('^'||p_user::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-f0-9]{64}/(pdf|docx|txt|report|letter)$')
$$;

CREATE FUNCTION public.job_loop_gc_referenced(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.job_loop_packets packet
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(packet.data->'artifacts')='object'
      THEN packet.data->'artifacts' ELSE '{}'::jsonb END) artifact
    WHERE artifact.value->>'path'=p_path
  )
$$;

-- The singleton cursor makes discovery fair without an unbounded owner scan:
-- at most ten configured owners, one owner and 200 paths per claim. Reference
-- exclusion is before LIMIT, so a referenced prefix cannot starve later paths.
CREATE FUNCTION public.job_loop_gc_claim(p_token uuid,p_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config public.job_loop_gc_config; candidate uuid; lifecycle public.job_loop_lifecycle;
  item public.job_loop_artifact_grants; result jsonb:='[]'::jsonb; deadline timestamptz;
BEGIN
  IF p_token IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'LOOP_GC_INVALID'; END IF;
  SELECT * INTO config FROM public.job_loop_gc_config WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT config.enabled OR cardinality(config.allowed_owner_ids)=0 THEN RETURN result; END IF;
  deadline:=clock_timestamp()+interval '10 minutes';
  FOR candidate IN
    SELECT owners.owner_id FROM (SELECT DISTINCT value AS owner_id FROM unnest(config.allowed_owner_ids) AS allowed(value)) owners
    ORDER BY CASE WHEN config.last_owner_id IS NULL OR owners.owner_id>config.last_owner_id THEN 0 ELSE 1 END,owners.owner_id
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||candidate::text,8190711)) THEN CONTINUE; END IF;
    -- Do not create a lifecycle row merely by visiting a configured identity.
    SELECT * INTO lifecycle FROM public.job_loop_lifecycle WHERE user_id=candidate FOR UPDATE;
    IF NOT FOUND OR lifecycle.state<>'active' THEN CONTINUE; END IF;
    FOR item IN
      SELECT grant_row.* FROM public.job_loop_artifact_grants grant_row
      JOIN public.job_loop_runs run ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
      WHERE grant_row.user_id=candidate AND grant_row.generation=lifecycle.generation
        AND (grant_row.gc_state='available' OR (grant_row.gc_state='claimed' AND grant_row.gc_expires_at<=clock_timestamp()))
        AND run.status IN('cancelled','completed') AND run.finished_at<=clock_timestamp()-interval '24 hours'
        AND (run.lease_until IS NULL OR run.lease_until<=clock_timestamp())
        AND public.job_loop_gc_canonical_path(candidate,grant_row.path)
        AND NOT public.job_loop_gc_referenced(grant_row.path)
        AND NOT EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones tombstone WHERE tombstone.path=grant_row.path
          AND (tombstone.user_id<>candidate OR tombstone.generation<>lifecycle.generation OR tombstone.state='collected'
            OR tombstone.expires_at>clock_timestamp() OR tombstone.token=p_token))
      ORDER BY run.finished_at,grant_row.path LIMIT p_limit FOR UPDATE OF grant_row SKIP LOCKED
    LOOP
      -- A tombstone can only be renewed for its original owner/generation.
      IF EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones tombstone WHERE tombstone.path=item.path
        AND (tombstone.user_id<>candidate OR tombstone.generation<>lifecycle.generation OR tombstone.state='collected'
          OR tombstone.expires_at>clock_timestamp())) THEN CONTINUE; END IF;
      INSERT INTO public.job_loop_artifact_tombstones(user_id,path,generation,token,expires_at,state)
        VALUES(candidate,item.path,lifecycle.generation,p_token,deadline,'claimed')
        ON CONFLICT(path) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at;
      UPDATE public.job_loop_artifact_grants SET gc_state='claimed',gc_token=p_token,gc_expires_at=deadline,
        gc_claimed_at=COALESCE(gc_claimed_at,clock_timestamp()) WHERE user_id=candidate AND path=item.path;
      result:=result||jsonb_build_array(jsonb_build_object('user_id',candidate,'path',item.path,
        'generation',lifecycle.generation,'token',p_token));
    END LOOP;
    IF jsonb_array_length(result)>0 THEN
      UPDATE public.job_loop_gc_config SET last_owner_id=candidate WHERE singleton;
      RETURN result;
    END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION public.job_loop_gc_finish(p_user uuid,p_generation bigint,p_token uuid,p_paths text[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle; artifact_path text; item public.job_loop_artifact_tombstones; count_paths integer;
BEGIN
  count_paths:=cardinality(p_paths);
  IF p_user IS NULL OR p_generation IS NULL OR p_generation<0 OR p_token IS NULL
    OR p_paths IS NULL OR count_paths NOT BETWEEN 1 AND 200 OR array_ndims(p_paths)<>1
    OR array_position(p_paths,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT value) FROM unnest(p_paths) AS paths(value))<>count_paths THEN RAISE EXCEPTION 'LOOP_GC_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||p_user::text,8190711));
  SELECT * INTO lifecycle FROM public.job_loop_lifecycle WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR lifecycle.state<>'active' OR lifecycle.generation<>p_generation THEN RAISE EXCEPTION 'LOOP_GC_STALE'; END IF;
  FOREACH artifact_path IN ARRAY p_paths LOOP
    IF NOT public.job_loop_gc_canonical_path(p_user,artifact_path) THEN RAISE EXCEPTION 'LOOP_GC_INVALID'; END IF;
    SELECT * INTO item FROM public.job_loop_artifact_tombstones WHERE path=artifact_path FOR UPDATE;
    IF NOT FOUND OR item.user_id<>p_user OR item.generation<>p_generation OR item.token<>p_token
      OR (item.state='claimed' AND item.expires_at<=clock_timestamp())
      OR NOT EXISTS(SELECT 1 FROM public.job_loop_artifact_grants grant_row JOIN public.job_loop_runs run
        ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
        WHERE grant_row.user_id=p_user AND grant_row.path=artifact_path AND grant_row.generation=p_generation
          AND grant_row.gc_state IN('claimed','collected') AND grant_row.gc_token=p_token
          AND run.status IN('cancelled','completed') AND run.finished_at<=clock_timestamp()-interval '24 hours'
          AND (run.lease_until IS NULL OR run.lease_until<=clock_timestamp())) THEN RAISE EXCEPTION 'LOOP_GC_STALE'; END IF;
    IF public.job_loop_gc_referenced(artifact_path) OR EXISTS(SELECT 1 FROM storage.objects
      WHERE bucket_id='job-loop-artifacts' AND name=artifact_path) THEN RAISE EXCEPTION 'LOOP_GC_RETRY'; END IF;
  END LOOP;
  UPDATE public.job_loop_artifact_tombstones SET state='collected',collected_at=COALESCE(collected_at,clock_timestamp())
    WHERE path=ANY(p_paths) AND user_id=p_user AND generation=p_generation AND token=p_token;
  UPDATE public.job_loop_artifact_grants SET gc_state='collected',gc_collected_at=COALESCE(gc_collected_at,clock_timestamp())
    WHERE path=ANY(p_paths) AND user_id=p_user AND generation=p_generation AND gc_token=p_token;
  RETURN count_paths;
END $$;

-- Preserve the existing lease/generation validation but close the path before
-- the original upsert, including fresh lifetimes after grants have been erased.
ALTER FUNCTION public.job_loop_authorize_artifact(uuid,uuid,uuid,uuid,text,text) RENAME TO job_loop_authorize_artifact_pre_gc;
REVOKE ALL ON FUNCTION public.job_loop_authorize_artifact_pre_gc(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.job_loop_authorize_artifact(p_user uuid,p_run uuid,p_lease uuid,p_packet uuid,p_hash text,p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE artifact_path text;
BEGIN
  PERFORM public.job_loop_assert_writable(p_user,false);
  artifact_path:=p_user::text||'/'||p_packet::text||'/'||p_hash||'/'||p_key;
  IF EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones WHERE path=artifact_path)
    OR EXISTS(SELECT 1 FROM public.job_loop_artifact_grants WHERE user_id=p_user AND path=artifact_path AND gc_state<>'available')
    THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  RETURN public.job_loop_authorize_artifact_pre_gc(p_user,p_run,p_lease,p_packet,p_hash,p_key);
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
  IF EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones WHERE path=NEW.name)
    OR NOT EXISTS(
    SELECT 1 FROM public.job_loop_artifact_grants grant_row
    JOIN public.job_loop_runs run ON run.id=grant_row.run_id AND run.user_id=grant_row.user_id
    JOIN public.job_loop_records record ON record.user_id=run.user_id AND record.input_version=run.input_version
    JOIN public.job_loop_pilot_users pilot ON pilot.user_id=run.user_id AND pilot.active
    WHERE grant_row.user_id=owner_id AND grant_row.path=NEW.name AND grant_row.generation=owner_generation AND grant_row.gc_state='available'
      AND grant_row.expires_at>clock_timestamp() AND run.status='running'
      AND run.lease_token=grant_row.lease_token AND run.lease_until>clock_timestamp()
  ) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.job_loop_packet_gc_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE artifact record; artifact_path text;
BEGIN
  -- Normal commit RPCs already acquire this lock before run/packet row locks.
  -- The trigger also fences trusted direct writes without weakening RLS.
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_loop_owner:'||NEW.user_id::text,8190711));
  -- Existing references were excluded before any claim. Status-only updates,
  -- including owner erasure, need not revalidate historical manifest shapes.
  IF TG_OP='UPDATE' AND OLD.data->'artifacts' IS NOT DISTINCT FROM NEW.data->'artifacts' THEN RETURN NEW; END IF;
  FOR artifact IN SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(NEW.data->'artifacts')='object'
    THEN NEW.data->'artifacts' ELSE '{}'::jsonb END)
  LOOP
    artifact_path:=artifact.value->>'path';
    IF artifact_path IS NOT NULL AND (
      NOT public.job_loop_gc_canonical_path(NEW.user_id,artifact_path)
      OR split_part(artifact_path,'/',2)<>NEW.id::text
      OR EXISTS(SELECT 1 FROM public.job_loop_artifact_tombstones WHERE path=artifact_path)
      OR EXISTS(SELECT 1 FROM public.job_loop_artifact_grants WHERE user_id=NEW.user_id AND path=artifact_path AND gc_state<>'available')
    ) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER job_loop_packet_gc_guard BEFORE INSERT OR UPDATE ON public.job_loop_packets
  FOR EACH ROW EXECUTE FUNCTION public.job_loop_packet_gc_guard();

REVOKE ALL ON FUNCTION public.job_loop_gc_canonical_path(uuid,text),public.job_loop_gc_referenced(text),public.job_loop_packet_gc_guard(),
  public.job_loop_storage_write_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.job_loop_gc_claim(uuid,integer),public.job_loop_gc_finish(uuid,bigint,uuid,text[]),
  public.job_loop_authorize_artifact(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_gc_claim(uuid,integer),public.job_loop_gc_finish(uuid,bigint,uuid,text[]),
  public.job_loop_authorize_artifact(uuid,uuid,uuid,uuid,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
