BEGIN;

-- Supabase's supported cloud scheduler. It wakes the shared queue every five
-- minutes; each candidate's timezone/cadence/opt-in remains in their schedule.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.job_loop_scheduler_config ADD COLUMN api_origin text,
  ADD COLUMN publishable_key text,
  ADD CONSTRAINT job_loop_scheduler_origin CHECK(api_origin IS NULL OR api_origin ~ '^https://[a-z0-9]+\.supabase\.co$');

CREATE FUNCTION public.job_loop_dispatch_due() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config public.job_loop_scheduler_config; dispatch_ticket uuid; request_id bigint; headers jsonb;
BEGIN
  SELECT * INTO config FROM public.job_loop_scheduler_config WHERE singleton;
  IF NOT config.enabled OR config.api_origin IS NULL THEN RETURN NULL; END IF;
  UPDATE public.job_loop_scheduler_config SET last_dispatch_at=now() WHERE singleton;
  DELETE FROM public.job_loop_dispatch_tickets WHERE expires_at<now()-interval '1 day';
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_schedules WHERE status='active'
    AND next_run_at<=now() AND (lease_until IS NULL OR lease_until<now()))
    AND NOT EXISTS(SELECT 1 FROM public.job_loop_runs WHERE status IN('queued','running')
      AND (lease_until IS NULL OR lease_until<now())) THEN RETURN NULL; END IF;
  INSERT INTO public.job_loop_dispatch_tickets DEFAULT VALUES RETURNING ticket INTO dispatch_ticket;
  headers:=jsonb_build_object('Content-Type','application/json','x-job-loop-schedule-ticket',dispatch_ticket::text);
  IF config.publishable_key IS NOT NULL THEN headers:=headers||jsonb_build_object('apikey',config.publishable_key); END IF;
  SELECT net.http_post(url:=config.api_origin||'/functions/v1/job-loop-worker',
    headers:=headers,body:='{"action":"run_due"}'::jsonb,timeout_milliseconds:=10000) INTO request_id;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.job_loop_dispatch_due() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_dispatch_due() TO service_role;

CREATE OR REPLACE FUNCTION public.job_loop_scheduler_state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('ready',enabled AND api_origin IS NOT NULL
    AND EXISTS(SELECT 1 FROM cron.job WHERE jobname='jobvance-recurring-loop' AND active)
    AND last_dispatch_at>now()-interval '15 minutes', 'lastDispatchAt',last_dispatch_at)
  FROM public.job_loop_scheduler_config WHERE singleton
$$;
REVOKE ALL ON FUNCTION public.job_loop_scheduler_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_scheduler_state() TO service_role;

-- Remains inert until the owner verifies the worker and sets enabled/origin.
SELECT cron.schedule('jobvance-recurring-loop','*/5 * * * *','SELECT public.job_loop_dispatch_due();');

COMMIT;
