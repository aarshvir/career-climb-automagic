BEGIN;
-- Exact variant execution is resolved under the same owner lock used by edits,
-- withdrawal, erasure and admission. Client selectors never supply the snapshot.
CREATE FUNCTION public.job_loop_resolve_cv_selection_bound(p_user uuid,p_generation bigint,p_selection jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; v jobvance_private.loop_cv_variants; f jobvance_private.loop_cv_variant_facts;
  ref jsonb; c jsonb; claims jsonb:='[]'; seen text[]:='{}';
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'object' OR NOT p_selection ?& ARRAY['variantId','variantRevision','sourceHash','factRefs']
    OR p_selection-ARRAY['variantId','variantRevision','sourceHash','factRefs']<>'{}'::jsonb
    OR jsonb_typeof(p_selection->'variantId') IS DISTINCT FROM 'string' OR p_selection->>'variantId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_selection->'variantRevision') IS DISTINCT FROM 'number' OR p_selection->>'variantRevision' !~ '^[1-9][0-9]{0,15}$'
    OR (p_selection->>'variantRevision')::numeric>9007199254740991
    OR jsonb_typeof(p_selection->'sourceHash') IS DISTINCT FROM 'string' OR p_selection->>'sourceHash' !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_selection->'factRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection->'factRefs')>150
    THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  SELECT * INTO v FROM jobvance_private.loop_cv_variants WHERE id=(p_selection->>'variantId')::uuid AND user_id=p_user AND generation=p_generation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  IF v.revision::text<>p_selection->>'variantRevision' OR v.snapshot->>'sourceHash' IS DISTINCT FROM p_selection->>'sourceHash' THEN RAISE EXCEPTION 'LOOP_VARIANT_SOURCE_CHANGED'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(v.snapshot->'claims') LOOP
    SELECT value INTO c FROM jsonb_array_elements(r.data->'claims') WHERE value->>'id'=ref->>'id';
    IF c IS NULL OR c->'revision' IS DISTINCT FROM ref->'revision' OR c->>'status' IS DISTINCT FROM 'active'
      OR c->'confirmed' IS DISTINCT FROM 'true'::jsonb OR c->'shareable' IS DISTINCT FROM 'true'::jsonb
      OR (c->>'sourceKind'='cv_passage' AND r.data#>>'{profile,sourceText}' IS DISTINCT FROM v.snapshot#>>'{profile,sourceText}')
      THEN RAISE EXCEPTION 'LOOP_VARIANT_CLAIM_UNAVAILABLE'; END IF;
    claims:=claims||jsonb_build_array(c);
  END LOOP;
  FOR ref IN SELECT value FROM jsonb_array_elements(p_selection->'factRefs') LOOP
    IF jsonb_typeof(ref) IS DISTINCT FROM 'object' OR NOT ref ?& ARRAY['id','revision'] OR ref-ARRAY['id','revision']<>'{}'::jsonb
      OR jsonb_typeof(ref->'id') IS DISTINCT FROM 'string' OR ref->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(ref->'revision') IS DISTINCT FROM 'number' OR ref->>'revision' !~ '^[1-9][0-9]{0,15}$' OR (ref->>'revision')::numeric>9007199254740991
      OR ref->>'id'=ANY(seen) THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_INVALID'; END IF;
    seen:=array_append(seen,ref->>'id');
    SELECT * INTO f FROM jobvance_private.loop_cv_variant_facts WHERE id=(ref->>'id')::uuid AND user_id=p_user AND generation=p_generation AND variant_id=v.id FOR UPDATE;
    IF NOT FOUND OR f.revision::text IS DISTINCT FROM ref->>'revision' OR f.snapshot->'variantRevision' IS DISTINCT FROM to_jsonb(v.revision)
      OR f.snapshot->>'sourceHash' IS DISTINCT FROM v.snapshot->>'sourceHash' OR f.snapshot->>'status' IS DISTINCT FROM 'active'
      OR f.snapshot->'confirmed' IS DISTINCT FROM 'true'::jsonb OR f.snapshot->'shareable' IS DISTINCT FROM 'true'::jsonb
      THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_UNAVAILABLE'; END IF;
    claims:=claims||jsonb_build_array((f.snapshot-ARRAY['variantId','generation','variantRevision','sourceHash','updatedAt'])||jsonb_build_object('id','vf_'||f.id::text));
  END LOOP;
  IF jsonb_array_length(claims)=0 THEN RAISE EXCEPTION 'LOOP_VARIANT_CLAIM_UNAVAILABLE'; END IF;
  RETURN r.data||jsonb_build_object('profile',(v.snapshot->'profile')||jsonb_build_object('revision',v.revision,'updatedAt',v.snapshot->>'updatedAt'),'claims',claims,'cvSelection',p_selection);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_resolve_cv_selection_bound(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_resolve_cv_selection_bound(uuid,bigint,jsonb) TO service_role;

CREATE FUNCTION public.job_loop_start_variant_run_bound(p_user uuid,p_generation bigint,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb,p_selection jsonb,p_selected uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE resolved jsonb; prior public.job_loop_runs; result jsonb; created public.job_loop_runs; record public.job_loop_records; chosen uuid; vacancy jsonb;
BEGIN
  resolved:=public.job_loop_resolve_cv_selection_bound(p_user,p_generation,p_selection);
  SELECT * INTO prior FROM public.job_loop_runs WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF prior.snapshot->'cvSelection' IS DISTINCT FROM p_selection OR prior.selected_opportunity_ids IS DISTINCT FROM p_selected
      OR prior.request_hash IS DISTINCT FROM p_request_hash OR prior.input_hash IS DISTINCT FROM p_input_hash
      OR prior.provider IS DISTINCT FROM p_provider OR prior.model IS DISTINCT FROM p_model OR prior.consents IS DISTINCT FROM p_consents
      THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(prior);
  END IF;
  SELECT * INTO record FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF record.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF p_selected IS NOT NULL THEN
    IF array_ndims(p_selected) IS DISTINCT FROM 1 OR cardinality(p_selected) NOT BETWEEN 1 AND 2 OR array_position(p_selected,NULL) IS NOT NULL OR (cardinality(p_selected)=2 AND p_selected[1]=p_selected[2]) OR p_consents->'inbox' IS DISTINCT FROM 'false'::jsonb OR p_consents ? 'scheduled' THEN RAISE EXCEPTION 'LOOP_SELECTION_INVALID'; END IF;
    FOREACH chosen IN ARRAY p_selected LOOP
      SELECT value INTO vacancy FROM jsonb_array_elements(record.data->'opportunities') WHERE value->>'id'=chosen::text;
      IF vacancy IS NULL OR COALESCE(vacancy->>'status','') NOT IN ('saved','prepared') OR COALESCE(vacancy->>'verification','') NOT IN ('user_provided','listed_on_source','unverified') THEN RAISE EXCEPTION 'LOOP_SELECTION_UNAVAILABLE'; END IF;
    END LOOP;
  END IF;
  IF p_request IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$' OR p_provider IS NULL OR p_provider NOT IN ('rules','anthropic','openai','moonshot') OR p_model IS NULL OR length(p_model) NOT BETWEEN 1 AND 150 OR jsonb_typeof(p_consents) IS DISTINCT FROM 'object' OR jsonb_typeof(p_consents->'model') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_consents->'inbox') IS DISTINCT FROM 'boolean' OR (p_provider<>'rules' AND p_consents->'model'<>'true'::jsonb) THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
  PERFORM public.job_loop_enroll_pilot(p_user);
  UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=p_user AND status IN ('queued','running') AND input_version<>record.input_version;
  IF EXISTS(SELECT 1 FROM public.job_loop_runs WHERE user_id=p_user AND status IN ('queued','running')) THEN RAISE EXCEPTION 'LOOP_ACTIVE_RUN'; END IF;
  IF (SELECT count(*) FROM public.job_loop_runs WHERE user_id=p_user AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=3 THEN RAISE EXCEPTION 'LOOP_DAILY_LIMIT'; END IF;
  INSERT INTO public.job_loop_runs(user_id,request_id,request_hash,input_hash,input_version,snapshot,provider,model,consents,selected_opportunity_ids,selected_generation)
  VALUES(p_user,p_request,p_request_hash,p_input_hash,record.input_version,resolved,p_provider,p_model,p_consents,p_selected,CASE WHEN p_selected IS NOT NULL THEN p_generation ELSE NULL END) RETURNING * INTO created;
  RETURN to_jsonb(created);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_start_variant_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_start_variant_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb,jsonb,uuid[]) TO service_role;

CREATE FUNCTION jobvance_private.assert_run_cv_authority(p_run uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs; resolved jsonb; generation bigint;
BEGIN
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p_run;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  IF r.snapshot->'cvSelection' IS NULL THEN RETURN; END IF;
  generation:=public.job_loop_assert_writable(r.user_id,false);
  resolved:=public.job_loop_resolve_cv_selection_bound(r.user_id,generation,r.snapshot->'cvSelection');
  IF (resolved->'profile',resolved->'claims') IS DISTINCT FROM (r.snapshot->'profile',r.snapshot->'claims') THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.assert_run_cv_authority(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.job_loop_assert_packet_cv_authority(p_user uuid,p_packet uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.job_loop_packets; r public.job_loop_runs;
BEGIN
  PERFORM public.job_loop_assert_writable(p_user,false);
  SELECT * INTO p FROM public.job_loop_packets WHERE id=p_packet AND user_id=p_user;
  IF NOT FOUND OR p.status='revoked' THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  SELECT * INTO r FROM public.job_loop_runs WHERE id=p.run_id AND user_id=p_user;
  IF p.data->'cvSelection' IS DISTINCT FROM r.snapshot->'cvSelection' THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  PERFORM jobvance_private.assert_run_cv_authority(r.id);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_assert_packet_cv_authority(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_assert_packet_cv_authority(uuid,uuid) TO service_role;

-- Preserve the established lease, storage, budget and erasure bodies. Add current
-- fact authority before their existing guarded operations, including paid reserves.
DO $$
DECLARE routine record; args text; delegate text; gate text;
BEGIN
  FOR routine IN SELECT p.oid,p.proname,p.proargnames,p.pronargs,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result_type FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY['job_loop_commit_phase','job_loop_reserve','job_loop_authorize_artifact','job_loop_approve_packet']) LOOP
    SELECT string_agg(quote_ident(routine.proargnames[i]),', ' ORDER BY i) INTO args FROM generate_series(1,routine.pronargs) i;
    delegate:=routine.proname||'_pre_variant';
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I',routine.proname,routine.identity_arguments,delegate);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated,service_role',delegate,routine.identity_arguments);
    gate:=CASE WHEN routine.proname='job_loop_approve_packet' THEN 'PERFORM public.job_loop_assert_packet_cv_authority(p_user,p_packet);' WHEN routine.proname='job_loop_commit_phase' THEN 'IF p_status NOT IN (''blocked'',''failed'',''cancelled'') OR p_packets<>''[]''::jsonb OR p_opportunities<>''[]''::jsonb THEN PERFORM jobvance_private.assert_run_cv_authority(p_run); END IF;' WHEN routine.proname='job_loop_reserve' THEN 'PERFORM jobvance_private.assert_run_cv_authority(p_run); PERFORM public.job_loop_enroll_pilot(p_user);' ELSE 'PERFORM jobvance_private.assert_run_cv_authority(p_run);' END;
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS $body$ BEGIN %s RETURN public.%I(%s); END $body$',routine.proname,routine.arguments,routine.result_type,gate,delegate,args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',routine.proname,routine.identity_arguments);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',routine.proname,routine.identity_arguments);
  END LOOP;
END $$;
CREATE FUNCTION jobvance_private.packet_cv_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs;
BEGIN
  IF TG_OP='UPDATE' AND NEW.data->'artifacts' IS NOT DISTINCT FROM OLD.data->'artifacts' AND NEW.status<>'approved' THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.job_loop_runs WHERE id=NEW.run_id AND user_id=NEW.user_id;
  IF NEW.data->'cvSelection' IS DISTINCT FROM r.snapshot->'cvSelection' THEN RAISE EXCEPTION 'LOOP_STALE_INPUT'; END IF;
  PERFORM jobvance_private.assert_run_cv_authority(r.id); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.packet_cv_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER job_loop_packet_cv_guard BEFORE INSERT OR UPDATE ON public.job_loop_packets FOR EACH ROW EXECUTE FUNCTION jobvance_private.packet_cv_guard();
CREATE FUNCTION jobvance_private.storage_cv_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run_id uuid;
BEGIN
  IF NEW.bucket_id='job-loop-artifacts' THEN
    SELECT g.run_id INTO run_id FROM public.job_loop_artifact_grants g WHERE g.path=NEW.name;
    IF run_id IS NULL THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF;
    PERFORM jobvance_private.assert_run_cv_authority(run_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.storage_cv_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER job_loop_storage_cv_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION jobvance_private.storage_cv_guard();
NOTIFY pgrst,'reload schema';
COMMIT;
