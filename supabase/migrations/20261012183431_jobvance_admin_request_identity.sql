BEGIN;

-- Preserve every existing usage row. Fail rather than discard/relabel data if
-- preexisting duplicate request IDs need operator reconciliation.
CREATE UNIQUE INDEX jobvance_admin_model_request_identity ON public.jobvance_admin_model_usage(request_id);

CREATE OR REPLACE FUNCTION public.jobvance_admin_reserve(p_actor uuid,p_request uuid,p_key text,p_action text,p_batch uuid,p_provider text,p_model text,p_micros bigint,p_cap_micros bigint DEFAULT 50000000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.jobvance_admin_model_usage; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); effective_cap bigint; batch_used bigint;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor,true);
  IF p_action NOT IN('independent_review','admin_commentary') OR p_micros NOT BETWEEN 1 AND 50000000 OR p_cap_micros NOT BETWEEN 1 AND 50000000 OR p_action='independent_review' AND p_batch IS NULL THEN RAISE EXCEPTION 'ADMIN_BUDGET_LIMIT'; END IF;
  -- Request identity is global, including across UTC month boundaries. Lock it
  -- before the monthly budget, then compare the complete call identity before
  -- any new reservation. Changed evidence is bound by the operation hash.
  PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_admin_request:'||p_request::text,83126));
  SELECT * INTO u FROM public.jobvance_admin_model_usage WHERE request_id=p_request;
  IF FOUND THEN
    IF u.actor_id IS DISTINCT FROM p_actor OR u.operation_key IS DISTINCT FROM p_key OR u.action IS DISTINCT FROM p_action OR u.batch_id IS DISTINCT FROM p_batch OR u.provider IS DISTINCT FROM p_provider OR u.model IS DISTINCT FROM p_model OR u.reserved_micros IS DISTINCT FROM p_micros THEN RAISE EXCEPTION 'ADMIN_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(u)||'{"is_new":false}'::jsonb;
  END IF;
  -- Batch authority also spans months. A transaction opened just before UTC
  -- rollover must not race a later month's reservation past the $5 batch cap.
  IF p_action='independent_review' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('jobvance_admin_batch:'||p_batch::text,83126));
  END IF;
  -- This is the identical row lock used for every candidate and search call.
  INSERT INTO public.job_loop_budget_months(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.job_loop_budget_months WHERE month=month_key FOR UPDATE;
  SELECT least(p_cap_micros,monthly_cap_micros) INTO effective_cap FROM public.jobvance_admin_config WHERE singleton;
  IF p_action='independent_review' THEN
    SELECT COALESCE(sum(CASE WHEN status='settled' THEN actual_micros ELSE reserved_micros END),0) INTO batch_used FROM public.jobvance_admin_model_usage WHERE batch_id=p_batch;
    IF batch_used+p_micros>5000000 THEN RAISE EXCEPTION 'ADMIN_REVIEW_BATCH_LIMIT'; END IF;
  END IF;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros+p_micros WHERE month=month_key AND committed_micros+p_micros<=effective_cap;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_BUDGET_LIMIT'; END IF;
  INSERT INTO public.jobvance_admin_model_usage(actor_id,request_id,operation_key,action,batch_id,month,provider,model,reserved_micros) VALUES(p_actor,p_request,p_key,p_action,p_batch,month_key,p_provider,p_model,p_micros) RETURNING * INTO u;
  PERFORM public.jobvance_admin_record_event(p_actor,p_action,u.id,jsonb_build_object('reservedMicros',p_micros,'model',p_model,'requestId',p_request));
  RETURN to_jsonb(u)||'{"is_new":true}'::jsonb;
END $$;

ALTER TABLE public.jobvance_admin_audit DROP CONSTRAINT jobvance_admin_audit_action_check;
ALTER TABLE public.jobvance_admin_audit ADD CONSTRAINT jobvance_admin_audit_action_check
CHECK(action IN('snapshot','config_updated','support_updated','support_detail','provider_status','independent_review','admin_commentary'));

-- Explicit, exact-receipt support access. Messages never enter aggregate
-- snapshots, audit details, model inputs or an all-message export.
CREATE FUNCTION public.jobvance_admin_support_detail(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s record;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  SELECT id,message,admin_version INTO s FROM public.job_loop_support_requests WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  PERFORM public.jobvance_admin_record_event(p_actor,'support_detail',p_id,jsonb_build_object('version',s.admin_version));
  RETURN jsonb_build_object('id',s.id,'message',left(s.message,2000));
END $$;

REVOKE ALL ON FUNCTION public.jobvance_admin_reserve(uuid,uuid,text,text,uuid,text,text,bigint,bigint),public.jobvance_admin_support_detail(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_admin_reserve(uuid,uuid,text,text,uuid,text,text,bigint,bigint),public.jobvance_admin_support_detail(uuid,uuid) TO service_role;

COMMIT;
