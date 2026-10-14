BEGIN;

-- The preparation scheduler can be disabled or have no due jobs. Maintenance
-- has a separate purpose-bound ticket and clock, but remains inert until its
-- private gate and explicit isolated-owner allowlist are configured.
ALTER TABLE public.job_loop_gc_config ADD COLUMN last_dispatch_at timestamptz,
  ADD COLUMN last_dispatch_request bigint;
CREATE TABLE public.job_loop_gc_dispatch_tickets (
  ticket uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '2 minutes'),
  consumed_at timestamptz
);
ALTER TABLE public.job_loop_gc_dispatch_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_gc_dispatch_tickets FROM PUBLIC,anon,authenticated,service_role;
-- The definer issuer alone establishes the two-minute lifetime. A raw service
-- table insert cannot mint an arbitrary long-lived credential.
CREATE INDEX job_loop_gc_dispatch_ticket_expiry ON public.job_loop_gc_dispatch_tickets(expires_at);

CREATE FUNCTION public.job_loop_gc_issue_ticket() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE issued uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_gc_config WHERE singleton AND enabled AND cardinality(allowed_owner_ids)>0) THEN RETURN NULL; END IF;
  INSERT INTO public.job_loop_gc_dispatch_tickets DEFAULT VALUES RETURNING ticket INTO issued;
  RETURN issued;
END $$;

CREATE FUNCTION public.job_loop_gc_consume_ticket(p_ticket uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE consumed uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_gc_config WHERE singleton AND enabled AND cardinality(allowed_owner_ids)>0) THEN RETURN false; END IF;
  UPDATE public.job_loop_gc_dispatch_tickets SET consumed_at=clock_timestamp()
    WHERE ticket=p_ticket AND consumed_at IS NULL AND expires_at>clock_timestamp()
    RETURNING ticket INTO consumed;
  RETURN consumed IS NOT NULL;
END $$;

CREATE FUNCTION public.job_loop_gc_dispatch() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; public_key text; issued uuid; request_id bigint; headers jsonb;
BEGIN
  WITH expired AS (
    SELECT ticket FROM public.job_loop_gc_dispatch_tickets WHERE expires_at<now()-interval '1 day'
      ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED
  ) DELETE FROM public.job_loop_gc_dispatch_tickets t USING expired e WHERE t.ticket=e.ticket;
  IF NOT EXISTS(SELECT 1 FROM public.job_loop_gc_config WHERE singleton AND enabled AND cardinality(allowed_owner_ids)>0) THEN RETURN NULL; END IF;
  SELECT api_origin,publishable_key INTO origin,public_key FROM public.job_loop_scheduler_config WHERE singleton;
  -- Configuration is reused; preparation enabled/readiness/due rows are not.
  IF origin IS NULL OR origin !~ '^https://[a-z0-9]+\.supabase\.co$' THEN RETURN NULL; END IF;
  issued:=public.job_loop_gc_issue_ticket();
  IF issued IS NULL THEN RETURN NULL; END IF;
  headers:=jsonb_build_object('Content-Type','application/json','x-job-loop-maintenance-ticket',issued::text);
  IF public_key IS NOT NULL THEN headers:=headers||jsonb_build_object('apikey',public_key); END IF;
  SELECT net.http_post(url:=origin||'/functions/v1/job-loop-worker',headers:=headers,
    body:='{"action":"artifact_gc"}'::jsonb,timeout_milliseconds:=10000) INTO request_id;
  UPDATE public.job_loop_gc_config SET last_dispatch_at=now(),last_dispatch_request=request_id WHERE singleton;
  RETURN request_id;
END $$;

REVOKE ALL ON FUNCTION public.job_loop_gc_issue_ticket(),public.job_loop_gc_consume_ticket(uuid),public.job_loop_gc_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_gc_issue_ticket(),public.job_loop_gc_consume_ticket(uuid),public.job_loop_gc_dispatch() TO service_role;

-- Default disabled/empty allowlist: the installed clock performs no HTTP call.
SELECT cron.schedule('jobvance-artifact-maintenance','17 * * * *','SELECT public.job_loop_gc_dispatch();');
NOTIFY pgrst,'reload schema';
COMMIT;
