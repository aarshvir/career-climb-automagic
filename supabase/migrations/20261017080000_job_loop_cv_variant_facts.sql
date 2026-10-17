BEGIN;

-- Independent variant evidence is never copied into the global profile. These
-- rows are authority for future exact-reference admission, not approval to run.
CREATE TABLE jobvance_private.loop_cv_variant_facts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.job_loop_records(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
  variant_id uuid NOT NULL REFERENCES jobvance_private.loop_cv_variants(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=30000)
);
CREATE INDEX loop_cv_variant_facts_owner ON jobvance_private.loop_cv_variant_facts(user_id,generation,variant_id);
CREATE TABLE jobvance_private.loop_cv_variant_fact_history (
  fact_id uuid NOT NULL REFERENCES jobvance_private.loop_cv_variant_facts(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY(fact_id,revision)
);
CREATE TABLE jobvance_private.loop_cv_variant_fact_requests (
  user_id uuid NOT NULL REFERENCES public.job_loop_records(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  request_id uuid NOT NULL,
  fact_id uuid NOT NULL REFERENCES jobvance_private.loop_cv_variant_facts(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  saved_revision bigint NOT NULL,
  variant_revision bigint NOT NULL,
  source_hash text NOT NULL,
  PRIMARY KEY(user_id,generation,request_id)
);
ALTER TABLE jobvance_private.loop_cv_variant_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_cv_variant_fact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobvance_private.loop_cv_variant_fact_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_cv_variant_facts,jobvance_private.loop_cv_variant_fact_history,jobvance_private.loop_cv_variant_fact_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.valid_cv_variant_fact(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; cap integer; minimum integer;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object'
    OR NOT p ?& ARRAY['sourceKind','sourceQuote','phrasing','context','kind','resultStatus','confirmed','shareable']
    OR p-ARRAY['sourceKind','sourceQuote','phrasing','context','kind','resultStatus','confirmed','shareable']<>'{}'::jsonb
    OR jsonb_typeof(p->'sourceKind') IS DISTINCT FROM 'string' OR p->>'sourceKind' NOT IN('cv_passage','user_answer')
    OR jsonb_typeof(p->'kind') IS DISTINCT FROM 'string' OR p->>'kind' NOT IN('employment','internship','academic_project','personal_project','volunteering','education','skill')
    OR jsonb_typeof(p->'resultStatus') IS DISTINCT FROM 'string' OR p->>'resultStatus' NOT IN('measured','projected','not_measured')
    OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p->'shareable') IS DISTINCT FROM 'boolean'
  THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['sourceQuote','phrasing','context'] LOOP
    cap:=CASE k WHEN 'sourceQuote' THEN 3000 WHEN 'phrasing' THEN 1500 ELSE 200 END;
    minimum:=CASE k WHEN 'context' THEN 1 ELSE 8 END;
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR length(btrim(p->>k)) NOT BETWEEN minimum AND cap
      OR length(p->>k)>cap OR (p->>k) ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
      OR (p->>k) ~ U&'[\202a-\202e\2066-\2069]' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.valid_cv_variant_fact(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.cv_fact_normalized_passage(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT string_agg(regexp_replace(btrim(line,E' \t\r'),'^([-•*]|[0-9]+[.)])[[:space:]]+','',''),E'\n' ORDER BY n)
  FROM unnest(string_to_array(p,E'\n')) WITH ORDINALITY t(line,n);
$$;
REVOKE ALL ON FUNCTION jobvance_private.cv_fact_normalized_passage(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.cv_fact_complete_passage(p_source text,p_quote text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lines text[]:=string_to_array(p_source,E'\n'); width integer:=cardinality(string_to_array(p_quote,E'\n')); n integer;
BEGIN
  IF width IS NULL OR width NOT BETWEEN 1 AND 30 OR cardinality(lines)<width THEN RETURN false; END IF;
  FOR n IN 1..cardinality(lines)-width+1 LOOP
    IF btrim(array_to_string(lines[n:n+width-1],E'\n'),E' \t\r\n')=p_quote THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION jobvance_private.cv_fact_complete_passage(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION jobvance_private.write_cv_variant_fact_bound(
  p_user uuid,p_generation bigint,p_expected bigint,p_request uuid,p_variant uuid,p_variant_expected bigint,
  p_source_hash text,p_fact uuid,p_fact_expected bigint,p_claim jsonb,p_consent boolean,p_withdraw boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; v jobvance_private.loop_cv_variants; f jobvance_private.loop_cv_variant_facts;
  receipt jobvance_private.loop_cv_variant_fact_requests; request_hash text; snapshot jsonb; changed_record jsonb;
  fact_id uuid; next_revision bigint; metadata jsonb; quote text; wording text; context_prefix text;
BEGIN
  IF p_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_CONSENT_REQUIRED'; END IF;
  IF p_user IS NULL OR p_request IS NULL OR p_variant IS NULL OR p_withdraw IS NULL
    OR p_generation IS NULL OR p_generation NOT BETWEEN 0 AND 9007199254740991
    OR p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 9007199254740990
    OR p_variant_expected IS NULL OR p_variant_expected NOT BETWEEN 1 AND 9007199254740991
    OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$'
    OR p_fact_expected IS NULL OR p_fact_expected NOT BETWEEN 0 AND 9007199254740990
    OR (p_fact IS NULL AND p_fact_expected<>0) OR (p_fact IS NOT NULL AND p_fact_expected=0)
    OR (p_withdraw AND (p_fact IS NULL OR p_claim IS NOT NULL))
    OR (NOT p_withdraw AND NOT jobvance_private.valid_cv_variant_fact(p_claim))
  THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_INVALID'; END IF;
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM jobvance_private.loop_cv_variants WHERE id=p_variant AND user_id=p_user AND generation=p_generation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  metadata:=jsonb_build_object('id',v.id,'revision',v.revision,'sourceHash',v.snapshot->'sourceHash');
  request_hash:=encode(sha256(convert_to(jsonb_build_object('generation',p_generation,'expectedVersion',p_expected,
    'variantId',p_variant,'expectedVariantRevision',p_variant_expected,'sourceHash',p_source_hash,
    'factId',p_fact,'expectedFactRevision',p_fact_expected,'claim',p_claim,'consent',p_consent,'withdraw',p_withdraw)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM jobvance_private.loop_cv_variant_fact_requests WHERE user_id=p_user AND generation=p_generation AND request_id=p_request;
  IF FOUND THEN
    IF receipt.request_hash<>request_hash THEN RAISE EXCEPTION 'LOOP_REQUEST_CONFLICT'; END IF;
    SELECT * INTO f FROM jobvance_private.loop_cv_variant_facts WHERE id=receipt.fact_id AND user_id=p_user AND generation=p_generation AND variant_id=p_variant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_UNAVAILABLE'; END IF;
    RETURN jsonb_build_object('generation',p_generation,'recordVersion',r.version,'variant',metadata,'fact',f.snapshot,
      'requestId',p_request,'requestHash',request_hash,'savedRevision',receipt.saved_revision,
      'sourceHash',receipt.source_hash,'variantRevision',receipt.variant_revision,'reused',true);
  END IF;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF p_fact IS NOT NULL THEN
    SELECT * INTO f FROM jobvance_private.loop_cv_variant_facts WHERE id=p_fact AND user_id=p_user AND generation=p_generation AND variant_id=p_variant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_UNAVAILABLE'; END IF;
    IF f.revision<>p_fact_expected THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_REVISION_CONFLICT'; END IF;
    fact_id:=f.id; next_revision:=f.revision+1;
  ELSE
    IF (SELECT count(*) FROM jobvance_private.loop_cv_variant_facts WHERE user_id=p_user AND generation=p_generation AND variant_id=p_variant)>=150
      THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_LIMIT'; END IF;
    fact_id:=gen_random_uuid(); next_revision:=1;
  END IF;
  IF p_withdraw THEN
    -- Withdrawal uses the displayed fact provenance, even after a CV edit. It
    -- cannot accidentally target a freshly reconfirmed revision of that fact.
    IF f.snapshot->'variantRevision' IS DISTINCT FROM to_jsonb(p_variant_expected) OR f.snapshot->>'sourceHash' IS DISTINCT FROM p_source_hash
      THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_SOURCE_CHANGED'; END IF;
    snapshot:=f.snapshot||jsonb_build_object('revision',next_revision,'status','withdrawn','confirmed',false,'shareable',false,'updatedAt',now());
  ELSE
    IF v.revision<>p_variant_expected OR v.snapshot->>'sourceHash' IS DISTINCT FROM p_source_hash
      THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_SOURCE_CHANGED'; END IF;
    quote:=jobvance_private.cv_fact_normalized_passage(p_claim->>'sourceQuote');
    wording:=jobvance_private.cv_fact_normalized_passage(p_claim->>'phrasing');
    IF p_claim->>'sourceKind'='cv_passage' THEN
      IF NOT jobvance_private.cv_fact_complete_passage(v.snapshot->'profile'->>'sourceText',p_claim->>'sourceQuote') OR quote<>wording
        THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_SOURCE_CHANGED'; END IF;
    ELSE
      context_prefix:=(p_claim->>'context')||': ';
      IF strpos(p_claim->>'sourceQuote',p_claim->>'context')=0
        OR (wording<>quote AND (left(quote,length(context_prefix))<>context_prefix OR wording<>substr(quote,length(context_prefix)+1)))
        THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_INVALID'; END IF;
    END IF;
    -- Runtime validation additionally preserves complete passages, attribution,
    -- source category and uncertainty. SQL never grants semantic fidelity.
    snapshot:=p_claim||jsonb_build_object('id',fact_id,'generation',p_generation,'variantId',p_variant,
      'variantRevision',p_variant_expected,'sourceHash',p_source_hash,'revision',next_revision,'status','active',
      'createdAt',COALESCE(f.snapshot->'createdAt',to_jsonb(now())),'updatedAt',now());
  END IF;
  INSERT INTO jobvance_private.loop_cv_variant_facts(id,user_id,generation,variant_id,revision,snapshot)
    VALUES(fact_id,p_user,p_generation,p_variant,next_revision,snapshot)
    ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot;
  INSERT INTO jobvance_private.loop_cv_variant_fact_history VALUES(fact_id,next_revision,snapshot);
  INSERT INTO jobvance_private.loop_cv_variant_fact_requests VALUES(p_user,p_generation,p_request,fact_id,request_hash,next_revision,p_variant_expected,p_source_hash);
  changed_record:=public.job_loop_write_record(p_user,r.version,r.data,false);
  RETURN jsonb_build_object('generation',p_generation,'recordVersion',changed_record->'version','variant',metadata,'fact',snapshot,
    'requestId',p_request,'requestHash',request_hash,'savedRevision',next_revision,'sourceHash',p_source_hash,'variantRevision',p_variant_expected,'reused',false);
END $$;
REVOKE ALL ON FUNCTION jobvance_private.write_cv_variant_fact_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,uuid,bigint,jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.job_loop_save_cv_variant_fact_bound(
  p_user uuid,p_generation bigint,p_expected bigint,p_request uuid,p_variant uuid,p_variant_expected bigint,
  p_source_hash text,p_fact uuid,p_fact_expected bigint,p_claim jsonb,p_save_consent boolean
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jobvance_private.write_cv_variant_fact_bound(p_user,p_generation,p_expected,p_request,p_variant,p_variant_expected,p_source_hash,p_fact,p_fact_expected,p_claim,p_save_consent,false);
$$;
CREATE FUNCTION public.job_loop_withdraw_cv_variant_fact_bound(
  p_user uuid,p_generation bigint,p_expected bigint,p_request uuid,p_variant uuid,p_variant_expected bigint,
  p_source_hash text,p_fact uuid,p_fact_expected bigint,p_withdraw_consent boolean
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jobvance_private.write_cv_variant_fact_bound(p_user,p_generation,p_expected,p_request,p_variant,p_variant_expected,p_source_hash,p_fact,p_fact_expected,NULL,p_withdraw_consent,true);
$$;
CREATE FUNCTION public.job_loop_read_cv_variant_facts_bound(p_user uuid,p_generation bigint,p_variant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records; v jobvance_private.loop_cv_variants; facts jsonb;
BEGIN
  IF p_user IS NULL OR p_variant IS NULL OR p_generation IS NULL OR p_generation NOT BETWEEN 0 AND 9007199254740991
    THEN RAISE EXCEPTION 'LOOP_VARIANT_FACT_INVALID'; END IF;
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM jobvance_private.loop_cv_variants WHERE id=p_variant AND user_id=p_user AND generation=p_generation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_VARIANT_UNAVAILABLE'; END IF;
  SELECT COALESCE(jsonb_agg(snapshot ORDER BY id),'[]'::jsonb) INTO facts FROM jobvance_private.loop_cv_variant_facts WHERE user_id=p_user AND generation=p_generation AND variant_id=p_variant;
  RETURN jsonb_build_object('generation',p_generation,'recordVersion',r.version,
    'variant',jsonb_build_object('id',v.id,'revision',v.revision,'sourceHash',v.snapshot->'sourceHash'),'facts',facts);
END $$;
REVOKE ALL ON FUNCTION public.job_loop_save_cv_variant_fact_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,uuid,bigint,jsonb,boolean),
  public.job_loop_withdraw_cv_variant_fact_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,uuid,bigint,boolean),
  public.job_loop_read_cv_variant_facts_bound(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_save_cv_variant_fact_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,uuid,bigint,jsonb,boolean),
  public.job_loop_withdraw_cv_variant_fact_bound(uuid,bigint,bigint,uuid,uuid,bigint,text,uuid,bigint,boolean),
  public.job_loop_read_cv_variant_facts_bound(uuid,bigint,uuid) TO service_role;
COMMIT;
