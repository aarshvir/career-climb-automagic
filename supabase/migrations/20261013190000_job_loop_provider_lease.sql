BEGIN;

-- A model request can run for120 seconds. Keep its lease valid for settlement,
-- rendering and commit; cancelled/stale-input and token guards stay intact.
CREATE OR REPLACE FUNCTION public.job_loop_claim_run(p_run uuid,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.job_loop_runs;
BEGIN
  UPDATE public.job_loop_runs SET status='running',lease_token=p_lease,lease_until=now()+interval '180 seconds'
  WHERE id=p_run AND status IN('queued','running') AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_records c WHERE c.user_id=r.user_id AND c.input_version=r.input_version) THEN
    UPDATE public.job_loop_runs SET status='blocked',lease_token=NULL,lease_until=NULL,finished_at=now(),data=data||'{"messages":["Your career record changed. Start a new run."],"nextAction":"Start a run using the current record."}'::jsonb WHERE id=p_run;
    RETURN NULL;
  END IF;
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.job_loop_claim_run(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_claim_run(uuid,uuid) TO service_role;

COMMIT;
