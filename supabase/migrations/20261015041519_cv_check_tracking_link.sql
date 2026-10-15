-- A check's progress belongs to that exact immutable check, never its title.
-- Existing manual/pack rows are unchanged and receive a NULL source link.
BEGIN;

ALTER TABLE public.cv_checks ADD CONSTRAINT cv_checks_owner_id_unique UNIQUE (user_id, id);
ALTER TABLE public.tracked_applications ADD COLUMN cv_check_id uuid;
ALTER TABLE public.tracked_applications
  ADD CONSTRAINT tracked_applications_check_owner_fk FOREIGN KEY (user_id, cv_check_id)
    REFERENCES public.cv_checks (user_id, id) ON DELETE SET NULL (cv_check_id),
  ADD CONSTRAINT tracked_applications_owner_check_unique UNIQUE (user_id, cv_check_id),
  ADD CONSTRAINT tracked_applications_one_source CHECK (pack_id IS NULL OR cv_check_id IS NULL);

-- A browser cannot assign, replace or remove a check relationship. Only the
-- owner-checked operation below can create it; FK deletion can detach it.
-- Preserve every existing writable column, including manual/pack operations.
REVOKE INSERT, UPDATE ON public.tracked_applications FROM PUBLIC, anon, authenticated;
GRANT INSERT (id, user_id, pack_id, job_title, company, job_url, status, notes,
  applied_at, follow_up_at, created_at, updated_at) ON public.tracked_applications TO authenticated;
GRANT UPDATE (id, user_id, pack_id, job_title, company, job_url, status, notes,
  applied_at, follow_up_at, created_at, updated_at) ON public.tracked_applications TO authenticated;

CREATE SCHEMA IF NOT EXISTS jobvance_private;
REVOKE ALL ON SCHEMA jobvance_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA jobvance_private TO authenticated;

-- The private definer is necessary to write the server-controlled link column.
-- The public API wrapper remains an invoker. No caller-supplied owner/progress.
CREATE FUNCTION jobvance_private.track_cv_check(p_cv_check_id uuid)
RETURNS SETOF public.tracked_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' ROWS 1
AS $$
DECLARE
  owner_id uuid := auth.uid();
  source_check public.cv_checks%ROWTYPE;
  tracked public.tracked_applications%ROWTYPE;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to track a saved CV check.' USING ERRCODE = '42501';
  END IF;
  SELECT c.* INTO source_check FROM public.cv_checks c
    WHERE c.id = p_cv_check_id AND c.user_id = owner_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This saved CV check is unavailable.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.tracked_applications (user_id, cv_check_id, job_title, company, status, notes)
    VALUES (owner_id, source_check.id, source_check.job_title, source_check.company, 'saved', '')
    ON CONFLICT ON CONSTRAINT tracked_applications_owner_check_unique DO NOTHING;

  -- This separate statement sees a concurrent winner after the unique-index
  -- wait. DO NOTHING deliberately avoids touching progress or updated_at.
  SELECT t.* INTO tracked FROM public.tracked_applications t
    WHERE t.user_id = owner_id AND t.cv_check_id = source_check.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tracking changed while saving. Retry this saved check.' USING ERRCODE = '40001';
  END IF;
  RETURN NEXT tracked;
END;
$$;
REVOKE ALL ON FUNCTION jobvance_private.track_cv_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION jobvance_private.track_cv_check(uuid) TO authenticated;

CREATE FUNCTION public.track_cv_check(p_cv_check_id uuid)
RETURNS SETOF public.tracked_applications
LANGUAGE sql SECURITY INVOKER SET search_path = '' ROWS 1
AS $$ SELECT * FROM jobvance_private.track_cv_check(p_cv_check_id); $$;
REVOKE ALL ON FUNCTION public.track_cv_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_cv_check(uuid) TO authenticated;

COMMENT ON COLUMN public.tracked_applications.cv_check_id IS
  'Exact immutable saved CV check. Owner-bound and unique; deletion of the check keeps independent tracker progress and clears only this link.';
COMMENT ON FUNCTION public.track_cv_check(uuid) IS
  'Track the authenticated owner''s exact saved check, or return its existing progress unchanged. Does not attest application submission.';

NOTIFY pgrst, 'reload schema';
COMMIT;
