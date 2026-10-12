BEGIN;

-- Dispatch tickets convey only authority to check the due queue. Candidate
-- record ownership and opt-in are still enforced by the recurring-run service.
CREATE TABLE public.job_loop_dispatch_tickets (
  ticket uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
  consumed_at timestamptz,
  CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '2 minutes')
);
ALTER TABLE public.job_loop_dispatch_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_dispatch_tickets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.job_loop_dispatch_tickets TO service_role;

CREATE FUNCTION public.job_loop_consume_dispatch_ticket(p_ticket uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE found_ticket uuid;
BEGIN
  UPDATE public.job_loop_dispatch_tickets SET consumed_at=now()
  WHERE ticket=p_ticket AND consumed_at IS NULL AND expires_at>now()
    AND EXISTS(SELECT 1 FROM public.job_loop_scheduler_config WHERE singleton AND enabled)
  RETURNING ticket INTO found_ticket;
  RETURN found_ticket IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.job_loop_consume_dispatch_ticket(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_consume_dispatch_ticket(uuid) TO service_role;

COMMIT;
