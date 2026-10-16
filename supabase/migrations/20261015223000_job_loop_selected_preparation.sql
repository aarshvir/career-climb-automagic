-- Additive, unapplied source foundation. Expose only with a selection-aware
-- control/worker pair. Legacy and scheduled runs keep NULL selection.
ALTER TABLE public.job_loop_runs ADD COLUMN selected_opportunity_ids uuid[], ADD COLUMN selected_generation bigint;
ALTER TABLE public.job_loop_runs ADD CONSTRAINT job_loop_selected_opportunities_bounded CHECK (
  (selected_opportunity_ids IS NULL AND selected_generation IS NULL) OR (
    selected_opportunity_ids IS NOT NULL AND selected_generation IS NOT NULL AND selected_generation>=0 AND
    array_ndims(selected_opportunity_ids)=1 AND array_lower(selected_opportunity_ids,1)=1
    AND cardinality(selected_opportunity_ids) BETWEEN 1 AND 2
    AND array_position(selected_opportunity_ids,NULL) IS NULL
    AND (cardinality(selected_opportunity_ids)=1 OR selected_opportunity_ids[1]<>selected_opportunity_ids[2])
  )
);

CREATE FUNCTION public.job_loop_start_selected_run_bound(
  p_user uuid,p_generation bigint,p_request uuid,p_request_hash text,p_input_hash text,
  p_expected bigint,p_provider text,p_model text,p_consents jsonb,p_selected uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; prior public.job_loop_runs; created public.job_loop_runs;
  selected_id uuid; matches integer; vacancy jsonb; result jsonb;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_selected IS NULL OR array_ndims(p_selected) IS DISTINCT FROM 1
    OR array_lower(p_selected,1) IS DISTINCT FROM 1 OR cardinality(p_selected) NOT BETWEEN 1 AND 2
    OR array_position(p_selected,NULL) IS NOT NULL
    OR (cardinality(p_selected)=2 AND p_selected[1]=p_selected[2])
    THEN RAISE EXCEPTION 'LOOP_SELECTION_INVALID'; END IF;
  -- Choosing vacancies does not authorize inbox/discovery or recurring work.
  IF jsonb_typeof(p_consents) IS DISTINCT FROM 'object'
    OR p_consents->'inbox' IS DISTINCT FROM 'false'::jsonb
    OR p_consents ? 'scheduled' THEN RAISE EXCEPTION 'LOOP_SELECTION_INVALID'; END IF;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  SELECT * INTO prior FROM public.job_loop_runs WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF prior.selected_opportunity_ids IS DISTINCT FROM p_selected
      OR prior.request_hash IS DISTINCT FROM p_request_hash
      OR prior.input_hash IS DISTINCT FROM p_input_hash
      OR prior.provider IS DISTINCT FROM p_provider OR prior.model IS DISTINCT FROM p_model
      OR prior.consents IS DISTINCT FROM p_consents
      OR prior.selected_generation IS DISTINCT FROM p_generation
      THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(prior);
  END IF;
  IF r.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  FOREACH selected_id IN ARRAY p_selected LOOP
    SELECT count(*) INTO matches FROM jsonb_array_elements(r.data->'opportunities') o WHERE o->>'id'=selected_id::text;
    IF matches<>1 THEN RAISE EXCEPTION 'LOOP_SELECTION_UNAVAILABLE'; END IF;
    SELECT o INTO vacancy FROM jsonb_array_elements(r.data->'opportunities') o WHERE o->>'id'=selected_id::text;
    IF COALESCE(vacancy->>'status','') NOT IN ('saved','prepared')
      OR COALESCE(vacancy->>'verification','') NOT IN ('user_provided','listed_on_source','unverified')
      THEN RAISE EXCEPTION 'LOOP_SELECTION_UNAVAILABLE'; END IF;
  END LOOP;
  -- Reuse the existing pilot admission, daily quota, active-run and snapshot
  -- operation under the same owner/record lock. A worker sees neither write
  -- until the complete transaction commits.
  result:=public.job_loop_start_run_bound(p_user,p_generation,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents);
  UPDATE public.job_loop_runs SET selected_opportunity_ids=p_selected,selected_generation=p_generation
    WHERE id=(result->>'id')::uuid AND user_id=p_user RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_start_selected_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_start_selected_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb,uuid[]) TO service_role;
COMMENT ON COLUMN public.job_loop_runs.selected_opportunity_ids IS 'NULL: legacy/discovery run. Non-null: ordered, bounded explicit selection resolved only against the immutable owned run snapshot.';
