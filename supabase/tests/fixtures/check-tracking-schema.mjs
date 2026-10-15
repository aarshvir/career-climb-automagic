import { readFile } from 'node:fs/promises';

export const checkTrackingMigration = '20261015041519_cv_check_tracking_link.sql';

// Real tracker table, RLS and timestamp trigger from the baseline migration.
// Only auth.users/auth.uid and the unrelated pack table are isolated substitutes.
export async function checkTrackingSchema() {
  const base = await readFile(new URL('../../migrations/20261010000000_grounded_application_mvp.sql', import.meta.url), 'utf8');
  const checks = await readFile(new URL('../../migrations/20261011000000_free_cv_checks.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL(`../../migrations/${checkTrackingMigration}`, import.meta.url), 'utf8');
  const table = base.slice(base.indexOf('CREATE TABLE public.tracked_applications ('), base.indexOf('CREATE INDEX cv_documents_user_created'));
  const policies = base.slice(base.indexOf('CREATE POLICY tracked_applications_read'), base.indexOf('REVOKE ALL ON public.cv_documents'));
  const trigger = base.slice(base.indexOf('CREATE FUNCTION public.jobvance_touch_tracking()'), base.lastIndexOf('COMMIT;'));
  if (!table.includes('UNIQUE (user_id, pack_id)') || !policies.includes('WITH CHECK') || !trigger.includes('CREATE TRIGGER')) throw new Error('Baseline SQL fixture extraction failed.');
  return `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE TABLE public.application_packs(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
    ALTER TABLE public.application_packs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pack_read ON public.application_packs FOR SELECT TO authenticated USING (auth.uid()=user_id);
    GRANT SELECT ON public.application_packs TO authenticated;
    ${table}
    ALTER TABLE public.tracked_applications ENABLE ROW LEVEL SECURITY;
    ${policies}
    REVOKE ALL ON public.tracked_applications FROM PUBLIC,anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.tracked_applications TO authenticated;
    GRANT ALL ON public.tracked_applications TO service_role;
    ${trigger}
    ${checks}
    ${migration}
  `;
}
