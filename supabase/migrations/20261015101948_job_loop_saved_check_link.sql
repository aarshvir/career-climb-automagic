BEGIN;

-- Service-only building block for an explicit saved-check continuation. The
-- control handler must derive p_user from its verified session and validate
-- URLs/contact fields before calling this routine. It is not a browser RPC.
-- No existing check, tracker, profile, consent, run or historical relationship
-- is backfilled. The relationship lives with the current Loop record and is
-- erased with it; deleting the separately saved check does not erase a vacancy.
CREATE FUNCTION jobvance_private.link_saved_check_to_loop(
  p_user uuid, p_generation bigint, p_expected bigint, p_check uuid,
  p_opportunity jsonb, p_link_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.job_loop_records;
  c public.cv_checks;
  matches jsonb;
  item jsonb;
  next_record jsonb;
  item_id uuid;
BEGIN
  IF p_link_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'LOOP_CHECK_LINK_CONSENT'; END IF;
  IF p_user IS NULL OR p_check IS NULL OR p_expected IS NULL OR p_expected<0 THEN
    RAISE EXCEPTION 'LOOP_CHECK_LINK_INVALID';
  END IF;
  -- Same lifecycle/record lock order as erasure and other bound writes. Never
  -- initialize a missing record or replay an old intent into a new lifetime.
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF jsonb_typeof(r.data->'opportunities') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LOOP_INVALID_RECORD';
  END IF;
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO matches
    FROM jsonb_array_elements(r.data->'opportunities')
    WHERE value->>'sourceCheckId'=p_check::text;
  IF jsonb_array_length(matches)>1 THEN RAISE EXCEPTION 'LOOP_CHECK_LINK_CONFLICT'; END IF;
  IF jsonb_array_length(matches)=1 THEN
    -- Lost response/retry: do not overwrite later notes, status, source edits,
    -- profile or packets. This lookup precedes optimistic-version validation.
    -- A deleted source remains a historical reference, never a recreated check.
    item:=matches->0;
    IF item->>'id' IS NULL OR item->>'source' IS DISTINCT FROM 'manual' THEN
      RAISE EXCEPTION 'LOOP_CHECK_LINK_CONFLICT';
    END IF;
    RETURN jsonb_build_object('record',to_jsonb(r),'opportunityId',item->>'id','reused',true);
  END IF;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF jsonb_array_length(r.data->'opportunities')>=100 THEN RAISE EXCEPTION 'LOOP_OPPORTUNITY_LIMIT'; END IF;
  -- A check deletion either wins before this read (unavailable) or waits for
  -- this transaction. The owner predicate is authoritative, not the supplied ID.
  SELECT * INTO c FROM public.cv_checks WHERE user_id=p_user AND id=p_check FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_CHECK_UNAVAILABLE'; END IF;
  IF jsonb_typeof(p_opportunity) IS DISTINCT FROM 'object'
    OR (p_opportunity - ARRAY['title','company','location','url','description','contact'])<>'{}'::jsonb
    OR NOT (p_opportunity ?& ARRAY['title','company','location','url','description','contact'])
    OR jsonb_typeof(p_opportunity->'title') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_opportunity->'company') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_opportunity->'location') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_opportunity->'url') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_opportunity->'description') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_opportunity->'contact') NOT IN ('object','null')
    OR octet_length(p_opportunity::text)>50000
  THEN RAISE EXCEPTION 'LOOP_CHECK_LINK_INVALID'; END IF;
  -- Exact source identity is not title/company/URL deduplication. Edited roles
  -- must be deliberately saved separately, not attributed to this saved check.
  IF (p_opportunity->>'title',p_opportunity->>'company',p_opportunity->>'description') IS DISTINCT FROM
    (btrim(c.job_title,E' \t\n\r'),btrim(c.company,E' \t\n\r'),btrim(c.job_description,E' \t\n\r'))
  THEN RAISE EXCEPTION 'LOOP_CHECK_SOURCE_CHANGED'; END IF;
  IF length(p_opportunity->>'title') NOT BETWEEN 2 AND 200
    OR length(p_opportunity->>'company')>200 OR length(p_opportunity->>'location')>200
    OR length(p_opportunity->>'description') NOT BETWEEN 80 AND 20000
    OR length(p_opportunity->>'url')>2000
    OR p_opportunity->>'url' !~ '^https://[^/@[:space:]]+([/?#]|$)'
  THEN RAISE EXCEPTION 'LOOP_CHECK_LINK_INVALID'; END IF;
  item_id:=gen_random_uuid();
  item:=p_opportunity || jsonb_build_object(
    'id',item_id,'source','manual','sourceCheckId',p_check,
    'sourceKey','saved-check:'||p_check::text,'checkedAt',now(),
    'verification','user_provided','status','saved','followUpAt',NULL,'notes',''
  );
  next_record:=public.job_loop_write_record(p_user,r.version,
    jsonb_set(r.data,'{opportunities}',(r.data->'opportunities')||jsonb_build_array(item)),true);
  RETURN jsonb_build_object('record',next_record,'opportunityId',item_id,'reused',false);
END $$;

-- The narrowly scoped private definer can lock an immutable check without
-- granting UPDATE on cv_checks to callers. Only verified server code may call
-- either routine; no browser grant or user-supplied owner authority is added.
REVOKE ALL ON FUNCTION jobvance_private.link_saved_check_to_loop(uuid,bigint,bigint,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA jobvance_private TO service_role;
GRANT EXECUTE ON FUNCTION jobvance_private.link_saved_check_to_loop(uuid,bigint,bigint,uuid,jsonb,boolean) TO service_role;
CREATE FUNCTION public.job_loop_link_saved_check(
  p_user uuid,p_generation bigint,p_expected bigint,p_check uuid,p_opportunity jsonb,p_link_consent boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT jobvance_private.link_saved_check_to_loop(p_user,p_generation,p_expected,p_check,p_opportunity,p_link_consent);
$$;
REVOKE ALL ON FUNCTION public.job_loop_link_saved_check(uuid,bigint,bigint,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_link_saved_check(uuid,bigint,bigint,uuid,jsonb,boolean) TO service_role;
COMMENT ON FUNCTION public.job_loop_link_saved_check(uuid,bigint,bigint,uuid,jsonb,boolean) IS
  'Service-only, explicit-consent, owner/generation-bound exact check-to-vacancy link. No source backfill, CV approval, preparation or submission.';

COMMIT;
