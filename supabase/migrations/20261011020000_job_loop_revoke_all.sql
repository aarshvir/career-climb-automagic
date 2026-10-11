BEGIN;
-- Preserve application history, but never preserve export authority after a fact changes.
CREATE OR REPLACE FUNCTION public.job_loop_write_record(p_user uuid,p_expected bigint,p_data jsonb,p_inputs_changed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_records;
BEGIN
  INSERT INTO public.job_loop_records(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.job_loop_records WHERE user_id=p_user FOR UPDATE;
  IF r.version<>p_expected THEN RAISE EXCEPTION 'LOOP_VERSION_CONFLICT'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'claims') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'opportunities') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'inbox') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'LOOP_INVALID_RECORD'; END IF;
  UPDATE public.job_loop_records SET version=version+1,input_version=input_version+CASE WHEN p_inputs_changed THEN 1 ELSE 0 END,data=p_data,updated_at=now() WHERE user_id=p_user RETURNING * INTO r;
  IF p_inputs_changed THEN
    UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now(),data=data||jsonb_build_object('nextAction','Your inputs changed. Start a new run using the current record.') WHERE user_id=p_user AND status IN('queued','running');
    UPDATE public.job_loop_packets SET status='revoked',data=jsonb_set(data,'{status}','"revoked"') WHERE user_id=p_user AND status<>'revoked';
  END IF;
  RETURN to_jsonb(r);
END $$;
-- Repair any earlier stale approval without deleting packets, files or tracker entries.
UPDATE public.job_loop_packets p SET status='revoked',data=jsonb_set(p.data,'{status}','"revoked"')
FROM public.job_loop_records r WHERE p.user_id=r.user_id AND p.input_version<>r.input_version AND p.status<>'revoked';
COMMIT;
