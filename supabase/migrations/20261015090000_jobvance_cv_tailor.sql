-- Source-bound CV tailoring for guests and signed-in candidates.
-- Spending shares the existing UTC-month ledger (job_loop_budget_months) and the
-- owner's configured cap. No CV, vacancy or model text is stored here: only the
-- reservation, settled cost, and a keyed hash for guest rate limiting.
BEGIN;

CREATE TABLE public.jobvance_tailor_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rate_hash text CHECK (rate_hash IS NULL OR rate_hash ~ '^[a-f0-9]{64}$'),
  request_id text NOT NULL UNIQUE CHECK (request_id ~ '^[a-f0-9-]{36}$'),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 60),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 80),
  reserved_micros bigint NOT NULL CHECK (reserved_micros BETWEEN 1 AND 500000),
  actual_micros bigint CHECK (actual_micros IS NULL OR actual_micros >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'uncertain')),
  CHECK (user_id IS NOT NULL OR rate_hash IS NOT NULL)
);
CREATE INDEX jobvance_tailor_usage_guest_day ON public.jobvance_tailor_usage (rate_hash, day) WHERE user_id IS NULL;
CREATE INDEX jobvance_tailor_usage_user_day ON public.jobvance_tailor_usage (user_id, day);
CREATE INDEX jobvance_tailor_usage_day ON public.jobvance_tailor_usage (day);
ALTER TABLE public.jobvance_tailor_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jobvance_tailor_usage FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.jobvance_tailor_reserve(
  p_user uuid, p_rate_hash text, p_request text, p_provider text, p_model text, p_micros bigint,
  p_user_daily integer DEFAULT 8, p_guest_daily integer DEFAULT 2, p_guest_global_daily integer DEFAULT 200,
  p_cap_micros bigint DEFAULT 50000000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing public.jobvance_tailor_usage; created public.jobvance_tailor_usage;
  month_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  today date := (now() AT TIME ZONE 'UTC')::date;
  effective_cap bigint; used integer;
BEGIN
  IF p_micros NOT BETWEEN 1 AND 500000 OR p_cap_micros NOT BETWEEN 1 AND 50000000 THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  IF p_user IS NULL AND (p_rate_hash IS NULL OR p_rate_hash !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'TAILOR_INVALID'; END IF;
  SELECT * INTO existing FROM public.jobvance_tailor_usage WHERE request_id = p_request;
  IF FOUND THEN
    IF existing.user_id IS DISTINCT FROM p_user OR (p_user IS NULL AND existing.rate_hash IS DISTINCT FROM p_rate_hash) THEN RAISE EXCEPTION 'TAILOR_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(existing) || '{"is_new":false}'::jsonb;
  END IF;
  -- One lock serialises spending and daily counts with every other Jobvance reservation.
  INSERT INTO public.job_loop_budget_months(month) VALUES (month_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.job_loop_budget_months WHERE month = month_key FOR UPDATE;
  IF p_user IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.jobvance_tailor_usage WHERE user_id = p_user AND day = today;
    IF used >= p_user_daily THEN RAISE EXCEPTION 'TAILOR_DAILY_LIMIT'; END IF;
  ELSE
    SELECT count(*) INTO used FROM public.jobvance_tailor_usage WHERE user_id IS NULL AND rate_hash = p_rate_hash AND day = today;
    IF used >= p_guest_daily THEN RAISE EXCEPTION 'TAILOR_GUEST_LIMIT'; END IF;
    SELECT count(*) INTO used FROM public.jobvance_tailor_usage WHERE user_id IS NULL AND day = today;
    IF used >= p_guest_global_daily THEN RAISE EXCEPTION 'TAILOR_GUEST_CAPACITY'; END IF;
  END IF;
  SELECT least(p_cap_micros, monthly_cap_micros) INTO effective_cap FROM public.jobvance_admin_config WHERE singleton;
  IF effective_cap IS NULL THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  UPDATE public.job_loop_budget_months SET committed_micros = committed_micros + p_micros
    WHERE month = month_key AND committed_micros + p_micros <= effective_cap;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAILOR_BUDGET_LIMIT'; END IF;
  INSERT INTO public.jobvance_tailor_usage (month, day, user_id, rate_hash, request_id, provider, model, reserved_micros)
    VALUES (month_key, today, p_user, CASE WHEN p_user IS NULL THEN p_rate_hash END, p_request, p_provider, p_model, p_micros)
    RETURNING * INTO created;
  RETURN to_jsonb(created) || '{"is_new":true}'::jsonb;
END $$;

CREATE FUNCTION public.jobvance_tailor_settle(p_id uuid, p_actual bigint, p_uncertain boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.jobvance_tailor_usage;
BEGIN
  SELECT * INTO u FROM public.jobvance_tailor_usage WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAILOR_NOT_FOUND'; END IF;
  IF u.status <> 'reserved' THEN RETURN to_jsonb(u); END IF;
  -- Unknown usage keeps the whole reservation committed (fail closed on spend).
  IF p_uncertain THEN UPDATE public.jobvance_tailor_usage SET status = 'uncertain' WHERE id = p_id RETURNING * INTO u; RETURN to_jsonb(u); END IF;
  IF p_actual IS NULL OR p_actual NOT BETWEEN 0 AND u.reserved_micros THEN RAISE EXCEPTION 'TAILOR_USAGE_INVALID'; END IF;
  UPDATE public.job_loop_budget_months SET committed_micros = committed_micros - (u.reserved_micros - p_actual) WHERE month = u.month;
  UPDATE public.jobvance_tailor_usage SET status = 'settled', actual_micros = p_actual WHERE id = p_id RETURNING * INTO u;
  RETURN to_jsonb(u);
END $$;

-- Guest rate hashes are short-lived operational data: settled guest rows older
-- than 90 days are deleted (their cost is already folded into the month ledger).
CREATE FUNCTION public.jobvance_tailor_usage_cleanup() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH removed AS (DELETE FROM public.jobvance_tailor_usage
    WHERE user_id IS NULL AND status = 'settled' AND day < (now() AT TIME ZONE 'UTC')::date - 90 RETURNING 1)
  SELECT count(*)::integer FROM removed
$$;

REVOKE ALL ON FUNCTION public.jobvance_tailor_reserve(uuid, text, text, text, text, bigint, integer, integer, integer, bigint),
  public.jobvance_tailor_settle(uuid, bigint, boolean), public.jobvance_tailor_usage_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_tailor_reserve(uuid, text, text, text, text, bigint, integer, integer, integer, bigint),
  public.jobvance_tailor_settle(uuid, bigint, boolean), public.jobvance_tailor_usage_cleanup() TO service_role;

COMMIT;
