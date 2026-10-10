-- Additive free-flow storage. No existing tables, packs, credits or grants change.
-- Approved checks are immutable snapshots: changed inputs require a new request_id.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cv_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  job_title text NOT NULL CHECK (char_length(btrim(job_title)) >= 2 AND char_length(job_title) <= 200),
  company text NOT NULL DEFAULT '' CHECK (char_length(company) <= 200),
  job_description text NOT NULL CHECK (char_length(btrim(job_description)) >= 80 AND char_length(job_description) <= 20000),
  original_text text NOT NULL CHECK (char_length(btrim(original_text)) >= 80 AND char_length(original_text) <= 60000),
  reviewed_text text NOT NULL CHECK (char_length(btrim(reviewed_text)) >= 80 AND char_length(reviewed_text) <= 60000),
  method_version varchar(80) NOT NULL CHECK (char_length(btrim(method_version)) >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS cv_checks_owner_created_idx ON public.cv_checks (user_id, created_at DESC);

ALTER TABLE public.cv_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cv_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cv_checks_owner_select ON public.cv_checks;
DROP POLICY IF EXISTS cv_checks_owner_insert ON public.cv_checks;
DROP POLICY IF EXISTS cv_checks_owner_delete ON public.cv_checks;
CREATE POLICY cv_checks_owner_select ON public.cv_checks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cv_checks_owner_insert ON public.cv_checks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cv_checks_owner_delete ON public.cv_checks FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.cv_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.cv_checks TO authenticated;
GRANT INSERT (user_id, request_id, job_title, company, job_description, original_text, reviewed_text, method_version, status)
  ON public.cv_checks TO authenticated;
-- No UPDATE grants or policy. Neither text nor ownership nor approval can be
-- changed in place. Server-generated IDs/timestamps cannot be overridden.
COMMENT ON TABLE public.cv_checks IS 'Owner-private immutable CV review inputs. Evidence reports must be recomputed from the saved texts; client scores are never persisted here.';

COMMIT;
