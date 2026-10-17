BEGIN;

-- Storage foundation only. No default-profile swap, run/schedule caller,
-- entitlement, approval inheritance or client table access is introduced.
-- Both tables cascade from the record deleted by the existing erase finisher.
CREATE TABLE jobvance_private.loop_cv_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.job_loop_records(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation>=0),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=500000)
);
CREATE INDEX loop_cv_variants_owner ON jobvance_private.loop_cv_variants(user_id,generation);
CREATE TABLE jobvance_private.loop_cv_variant_requests (
  user_id uuid NOT NULL REFERENCES public.job_loop_records(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  request_id uuid NOT NULL,
  variant_id uuid NOT NULL REFERENCES jobvance_private.loop_cv_variants(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  source_hash text NOT NULL,
  saved_revision bigint NOT NULL,
  PRIMARY KEY(user_id,generation,request_id)
);
ALTER TABLE jobvance_private.loop_cv_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_cv_variant_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_cv_variants,jobvance_private.loop_cv_variant_requests FROM PUBLIC,anon,authenticated,service_role;

-- Mirror the bounded profile-input shape, rejecting privileged/unknown fields.
-- Inputs must already be canonicalized by the future server validator. This
-- check preserves exact supplied text; it never manufactures CV facts.
CREATE FUNCTION jobvance_private.valid_cv_variant_profile(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; v jsonb; cap integer; width integer;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object'
    OR NOT p ?& ARRAY['audience','name','contactLine','targetTitles','locations','experienceYears','languages','pageTarget','discreetSearch','sourceText','excludedTerms','compensation']
    OR p-ARRAY['audience','name','contactLine','targetTitles','locations','experienceYears','languages','pageTarget','discreetSearch','sourceText','excludedTerms','compensation']<>'{}'::jsonb
    OR jsonb_typeof(p->'audience') IS DISTINCT FROM 'string' OR p->>'audience' NOT IN('student','mba','professional')
    OR p->'pageTarget' NOT IN('1'::jsonb,'2'::jsonb)
    OR jsonb_typeof(p->'discreetSearch') IS DISTINCT FROM 'boolean'
  THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['name','contactLine','sourceText'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    width:=CASE k WHEN 'name' THEN 120 WHEN 'contactLine' THEN 500 ELSE 60000 END;
    IF length(p->>k)>width OR length(btrim(p->>k))<(CASE k WHEN 'name' THEN 1 WHEN 'sourceText' THEN 80 ELSE 0 END)
      OR (p->>k) ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' OR (p->>k) ~ U&'[\202a-\202e\2066-\2069]'
    THEN RETURN false; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['targetTitles','locations','languages','excludedTerms'] LOOP
    cap:=CASE k WHEN 'languages' THEN 20 WHEN 'excludedTerms' THEN 100 ELSE 10 END;
    width:=CASE k WHEN 'languages' THEN 80 ELSE 150 END;
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->k)>cap THEN RETURN false; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(p->k) LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND width
        OR length(v#>>'{}')>width OR (v#>>'{}') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' OR (v#>>'{}') ~ U&'[\202a-\202e\2066-\2069]'
      THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT count(*)<>count(DISTINCT lower(btrim(value#>>'{}'))) FROM jsonb_array_elements(p->k)) THEN RETURN false; END IF;
  END LOOP;
  v:=p->'experienceYears';
  IF v<>'null'::jsonb THEN
    IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF (v::text)::numeric NOT BETWEEN 0 AND 80 THEN RETURN false; END IF;
  END IF;
  v:=p->'compensation';
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& ARRAY['currency','period','minimum'] OR v-ARRAY['currency','period','minimum']<>'{}'::jsonb
    OR jsonb_typeof(v->'currency') IS DISTINCT FROM 'string' OR v->>'currency' !~ '^([A-Z]{3})?$'
    OR jsonb_typeof(v->'period') IS DISTINCT FROM 'string' OR v->>'period' NOT IN('monthly','annual','hourly') THEN RETURN false; END IF;
  IF v->'minimum'<>'null'::jsonb THEN
    IF jsonb_typeof(v->'minimum') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF (v->>'minimum')::numeric NOT BETWEEN 0 AND 100000000 THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.valid_cv_variant_profile(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.save_cv_variant_bound(
  p_user uuid,p_generation bigint,p_expected bigint,p_request uuid,p_variant uuid,p_variant_expected bigint,
  p_label text,p_profile jsonb,p_claims jsonb,p_save_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; item jobvance_private.loop_cv_variants; receipt jobvance_private.loop_cv_variant_requests;
  ref jsonb; claim jsonb; snapshots jsonb:='[]'; seen text[]:='{}'; matches integer;
  request_hash text; source_hash text; snapshot jsonb; changed_record jsonb; new_id uuid; new_revision bigint;
BEGIN
  IF p_save_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'LOOP_VARIANT_CONSENT_REQUIRED'; END IF;
  IF p_user IS NULL OR p_request IS NULL OR p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 9007199254740991
    OR p_variant_expected IS NULL OR p_variant_expected NOT BETWEEN 0 AND 9007199254740990
    OR (p_variant IS NULL AND p_variant_expected<>0) OR (p_variant IS NOT NULL AND p_variant_expected=0)
    OR p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 1 AND 80 OR length(p_label)>80
    OR p_label ~ '[\x01-\x1f\x7f]' OR p_label ~ U&'[\202a-\202e\2066-\2069]'
    OR NOT jobvance_private.valid_cv_variant_profile(p_profile)
    OR jsonb_typeof(p_claims) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
  IF jsonb_array_length(p_claims)>150 THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(p_claims) LOOP
    IF jsonb_typeof(ref) IS DISTINCT FROM 'object' OR NOT ref ?& ARRAY['id','revision'] OR ref-ARRAY['id','revision']<>'{}'::jsonb
      OR jsonb_typeof(ref->'id') IS DISTINCT FROM 'string' OR ref->>'id' !~ '^[A-Za-z0-9_-]{1,80}$'
      OR jsonb_typeof(ref->'revision') IS DISTINCT FROM 'number' OR ref->>'revision' !~ '^[0-9]+$'
    THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
    IF (ref->>'revision')::numeric NOT BETWEEN 1 AND 9007199254740991 OR ref->>'id'=ANY(seen) THEN RAISE EXCEPTION 'LOOP_VARIANT_INVALID'; END IF;
    seen:=array_append(seen,ref->>'id');
  END LOOP;
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('generation',p_generation,'expectedVersion',p_expected,'variantId',p_variant,
    'expectedRevision',p_variant_expected,'label',p_label,'profile',p_profile,'claimRefs',p_claims,'saveConsent',p_save_consent)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM jobvance_private.loop_cv_variant_requests WHERE user_id=p_user AND generation=p_generation AND request_id=p_request;
  IF FOUND THEN
    IF receipt.request_hash<>request_hash THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    SELECT * INTO item FROM jobvance_private.loop_cv_variants WHERE id=receipt.variant_id AND user_id=p_user AND generation=p_generation;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
    RETURN jsonb_build_object('variant',item.snapshot,'recordVersion',r.version,'requestId',p_request,'requestHash',request_hash,
      'sourceHash',receipt.source_hash,'savedRevision',receipt.saved_revision,'reused',true);
  END IF;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF p_variant IS NULL THEN
    IF (SELECT count(*) FROM jobvance_private.loop_cv_variants WHERE user_id=p_user AND generation=p_generation)>=3 THEN RAISE EXCEPTION 'LOOP_VARIANT_LIMIT'; END IF;
    new_id:=gen_random_uuid(); new_revision:=1;
  ELSE
    SELECT * INTO item FROM jobvance_private.loop_cv_variants WHERE id=p_variant AND user_id=p_user AND generation=p_generation;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
    IF item.revision<>p_variant_expected THEN RAISE EXCEPTION 'LOOP_VARIANT_REVISION_CONFLICT'; END IF;
    new_id:=item.id; new_revision:=item.revision+1;
  END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(p_claims) LOOP
    SELECT count(*) INTO matches FROM jsonb_array_elements(r.data->'claims') c WHERE c->>'id'=ref->>'id';
    IF matches<>1 THEN RAISE EXCEPTION 'LOOP_VARIANT_CLAIM_UNAVAILABLE'; END IF;
    SELECT c INTO claim FROM jsonb_array_elements(r.data->'claims') c WHERE c->>'id'=ref->>'id';
    IF claim->'revision' IS DISTINCT FROM ref->'revision' OR claim->>'status' IS DISTINCT FROM 'active'
      OR claim->'confirmed' IS DISTINCT FROM 'true'::jsonb OR claim->'shareable' IS DISTINCT FROM 'true'::jsonb
      OR COALESCE(claim->>'sourceKind','') NOT IN('cv_passage','user_answer')
    THEN RAISE EXCEPTION 'LOOP_VARIANT_CLAIM_UNAVAILABLE'; END IF;
    -- Do not carry confirmed source passages into a changed CV. Independent
    -- sources can be saved with no claims; variant fact editing is future work.
    IF claim->>'sourceKind'='cv_passage' AND p_profile->'sourceText' IS DISTINCT FROM r.data->'profile'->'sourceText'
    THEN RAISE EXCEPTION 'LOOP_VARIANT_SOURCE_CHANGED'; END IF;
    snapshots:=snapshots||jsonb_build_array(claim);
  END LOOP;
  source_hash:=encode(sha256(convert_to(jsonb_build_object('profile',p_profile,'claims',snapshots)::text,'UTF8')),'hex');
  snapshot:=jsonb_build_object('id',new_id,'generation',p_generation,'revision',new_revision,'label',p_label,
    'profile',p_profile,'claims',snapshots,'sourceHash',source_hash,
    'createdAt',COALESCE(item.snapshot->'createdAt',to_jsonb(now())),'updatedAt',now());
  INSERT INTO jobvance_private.loop_cv_variants(id,user_id,generation,revision,snapshot) VALUES(new_id,p_user,p_generation,new_revision,snapshot)
    ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot;
  INSERT INTO jobvance_private.loop_cv_variant_requests VALUES(p_user,p_generation,p_request,new_id,request_hash,source_hash,new_revision);
  -- A variant save participates in optimistic record ordering but does not
  -- alter the legacy input_version, run status, packets, source or claims.
  changed_record:=public.job_loop_write_record(p_user,r.version,r.data,false);
  RETURN jsonb_build_object('variant',snapshot,'recordVersion',changed_record->'version','requestId',p_request,'requestHash',request_hash,
    'sourceHash',source_hash,'savedRevision',new_revision,'reused',false);
END $$;
REVOKE ALL ON FUNCTION jobvance_private.save_cv_variant_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION jobvance_private.save_cv_variant_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,jsonb,jsonb,boolean) TO service_role;
CREATE FUNCTION public.job_loop_save_cv_variant_bound(
  p_user uuid,p_generation bigint,p_expected bigint,p_request uuid,p_variant uuid,p_variant_expected bigint,
  p_label text,p_profile jsonb,p_claims jsonb,p_save_consent boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT jobvance_private.save_cv_variant_bound(p_user,p_generation,p_expected,p_request,p_variant,p_variant_expected,p_label,p_profile,p_claims,p_save_consent);
$$;
REVOKE ALL ON FUNCTION public.job_loop_save_cv_variant_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_save_cv_variant_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION public.job_loop_read_cv_variants_bound(p_user uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; variants jsonb;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  SELECT COALESCE(jsonb_agg(snapshot ORDER BY id),'[]'::jsonb) INTO variants FROM jobvance_private.loop_cv_variants WHERE user_id=p_user AND generation=p_generation;
  RETURN jsonb_build_object('generation',p_generation,'recordVersion',r.version,'variants',variants);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_read_cv_variants_bound(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_read_cv_variants_bound(uuid,bigint) TO service_role;
COMMENT ON FUNCTION public.job_loop_save_cv_variant_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,jsonb,jsonb,boolean) IS
  'Service-only CV variant storage foundation. No run/schedule selection, factual approval, provider processing or billing. Future admission must revalidate current claim sharing/revision and bind exact variant revision.';
COMMIT;
