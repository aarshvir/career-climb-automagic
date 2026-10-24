BEGIN;

-- Hourly auto-mode check for /marketing-admin. It reuses the scheduler origin the
-- owner already verified for the Job Loop worker, and it does nothing unless
-- auto mode is switched on in jobvance_marketing_settings.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE FUNCTION public.jobvance_marketing_dispatch_auto() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; key text; dispatch_ticket uuid; request_id bigint; headers jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobvance_marketing_settings WHERE singleton AND auto_mode) THEN RETURN NULL; END IF;
  SELECT api_origin, publishable_key INTO origin, key FROM public.job_loop_scheduler_config WHERE singleton;
  IF origin IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.jobvance_marketing_dispatch_tickets WHERE expires_at<now();
  INSERT INTO public.jobvance_marketing_dispatch_tickets DEFAULT VALUES RETURNING ticket INTO dispatch_ticket;
  headers:=jsonb_build_object('Content-Type','application/json','x-jobvance-marketing-ticket',dispatch_ticket::text);
  IF key IS NOT NULL THEN headers:=headers||jsonb_build_object('apikey',key); END IF;
  SELECT net.http_post(url:=origin||'/functions/v1/jobvance-marketing',
    headers:=headers,body:='{"action":"run_auto"}'::jsonb,timeout_milliseconds:=10000) INTO request_id;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.jobvance_marketing_dispatch_auto() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_marketing_dispatch_auto() TO service_role;

SELECT cron.schedule('jobvance-marketing-auto','7 * * * *','SELECT public.jobvance_marketing_dispatch_auto();');

COMMIT;
