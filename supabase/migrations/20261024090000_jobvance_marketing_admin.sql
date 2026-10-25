BEGIN;

-- Private marketing workspace for /marketing-admin. Every table is reachable only
-- through the jobvance-marketing function (service role); the function verifies
-- the caller against jobvance_admin_members on every request. This release only reads
-- from Meta: there is no auto mode, scheduler or ad-changing action.

CREATE TABLE public.jobvance_marketing_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  title text NOT NULL CHECK(char_length(title) BETWEEN 3 AND 140),
  angle text NOT NULL DEFAULT '' CHECK(char_length(angle) <= 600),
  status text NOT NULL DEFAULT 'idea' CHECK(status IN('idea','in_production','ready','launched','retired')),
  source_path text CHECK(source_path IS NULL OR char_length(source_path) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jobvance_marketing_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.jobvance_marketing_ideas(id) ON DELETE CASCADE,
  label text NOT NULL CHECK(char_length(label) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK(kind IN('video','copy')),
  format text CHECK(format IS NULL OR format IN('9x16','4x5','1x1','text')),
  file_name text CHECK(file_name IS NULL OR char_length(file_name) <= 200),
  sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  notes text NOT NULL DEFAULT '' CHECK(char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(approved = (approved_at IS NOT NULL))
);

CREATE TABLE public.jobvance_marketing_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.jobvance_marketing_ideas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 140),
  platform text NOT NULL DEFAULT 'meta' CHECK(platform='meta'),
  meta_campaign_id text NOT NULL CHECK(meta_campaign_id ~ '^[0-9]{6,24}$'),
  meta_adset_id text NOT NULL CHECK(meta_adset_id ~ '^[0-9]{6,24}$'),
  meta_ad_id text NOT NULL UNIQUE CHECK(meta_ad_id ~ '^[0-9]{6,24}$'),
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK(status IN('ACTIVE','PAUSED','ARCHIVED','DELETED','UNKNOWN')),
  effective_status text CHECK(effective_status IS NULL OR char_length(effective_status) <= 40),
  daily_budget_minor bigint CHECK(daily_budget_minor IS NULL OR daily_budget_minor >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK(currency ~ '^[A-Z]{3}$'),
  end_at timestamptz,
  -- Last complete, validated read from Meta. Incomplete or invalid reads never write figures.
  last_synced_at timestamptz,
  metrics_state text NOT NULL DEFAULT 'unknown' CHECK(metrics_state IN('fresh','stale','unknown')),
  metrics_issue text CHECK(metrics_issue IS NULL OR metrics_issue IN('invalid','incomplete','currency_mismatch','account_mismatch','meta_error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(metrics_state = 'unknown' OR last_synced_at IS NOT NULL)
);

CREATE TABLE public.jobvance_marketing_metrics (
  launch_id uuid NOT NULL REFERENCES public.jobvance_marketing_launches(id) ON DELETE CASCADE,
  day date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0 CHECK(impressions >= 0),
  reach bigint NOT NULL DEFAULT 0 CHECK(reach >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK(clicks >= 0),
  link_clicks bigint NOT NULL DEFAULT 0 CHECK(link_clicks >= 0),
  landing_page_views bigint NOT NULL DEFAULT 0 CHECK(landing_page_views >= 0),
  spend_minor bigint NOT NULL DEFAULT 0 CHECK(spend_minor >= 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(launch_id, day)
);

-- "Idea to ad creation": the owner queues work; the production team (Claude or
-- Codex with the locked ad workflow) picks it up. The web page never generates media.
CREATE TABLE public.jobvance_marketing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.jobvance_marketing_ideas(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'create_ad' CHECK(kind='create_ad'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','in_progress','done','cancelled')),
  note text NOT NULL DEFAULT '' CHECK(char_length(note) <= 1000 AND position(chr(0) in note) = 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jobvance_marketing_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version bigint NOT NULL DEFAULT 0 CHECK(version >= 0),
  -- Thresholds for the page's recommendations only; nothing here changes Meta.
  -- Owner-approved 24 Oct: four ₹500/day ad sets (1.5x headroom per day) and a ₹13,000 campaign cap.
  max_daily_spend_minor bigint NOT NULL DEFAULT 300000 CHECK(max_daily_spend_minor BETWEEN 1 AND 10000000),
  max_total_spend_minor bigint NOT NULL DEFAULT 1300000 CHECK(max_total_spend_minor BETWEEN 1 AND 100000000),
  min_impressions integer NOT NULL DEFAULT 1500 CHECK(min_impressions BETWEEN 100 AND 1000000),
  pause_ctr_below_pct numeric(5,2) NOT NULL DEFAULT 0.40 CHECK(pause_ctr_below_pct BETWEEN 0 AND 10),
  cost_per_lpv_ratio numeric(4,2) NOT NULL DEFAULT 2.00 CHECK(cost_per_lpv_ratio BETWEEN 1.2 AND 10),
  last_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.jobvance_marketing_settings(singleton) VALUES(true);

CREATE TABLE public.jobvance_marketing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK(action IN('sync','request_creation','create_idea','update_settings')),
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object' AND pg_column_size(details) <= 4000),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobvance_marketing_audit_at ON public.jobvance_marketing_audit(at DESC);

CREATE FUNCTION public.jobvance_marketing_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'MARKETING_AUDIT_IMMUTABLE'; END $$;
CREATE TRIGGER jobvance_marketing_audit_immutable BEFORE UPDATE OR DELETE ON public.jobvance_marketing_audit
FOR EACH ROW EXECUTE FUNCTION public.jobvance_marketing_audit_immutable();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jobvance_marketing_ideas','jobvance_marketing_creatives','jobvance_marketing_launches','jobvance_marketing_metrics','jobvance_marketing_requests','jobvance_marketing_settings','jobvance_marketing_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY service_role_only ON public.%I TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.jobvance_marketing_audit_immutable() FROM PUBLIC, anon, authenticated;

-- What exists on 24 Oct 2026 (receipts in jobvance-marketing-coordination/). Launch status
-- stays UNKNOWN and figures unknown until the first complete read from Meta.
INSERT INTO public.jobvance_marketing_ideas(slug,title,angle,status,source_path) VALUES
 ('version-a-search-rewrite-repeat','A: Search. Rewrite. Repeat?','Presenter names the repetitive job-search loop, then the four-step Job Loop demo.','launched','film-studio/revisions/2026-10-21-claude-loop-cut'),
 ('version-b-job-hunt-dragging','B: Job hunt dragging on for weeks?','Pain-question hook, owner line, then the Job Loop demo.','launched','film-studio/revisions/2026-10-22-version-B-pain'),
 ('version-c-drama','C: Dramatic real-life opening (woman presenter)','Stock cold open of job-search strain, a woman presenter with a matched voice, then one proof chain. Two openings (man first, partner first) in a Meta A/B test against B.','launched','film-studio/revisions/2026-10-24-version-C-drama'),
 ('concept-m2-the-loop','M2: The loop','Kinetic type loop concept from the 18 Oct agency run.','retired','jobvance-ad-studio/runs/2026-10-18/04-scripts/m2-the-loop.md'),
 ('concept-m1-let-me-show-you','M1: Let me show you','Presenter screen walkthrough concept from the 18 Oct agency run.','retired','jobvance-ad-studio/runs/2026-10-18/04-scripts/m1-let-me-show-you.md'),
 ('concept-b1-job-title-job-searcher','B1: Job title: job searcher','Deadpan job-title joke hook from the 18 Oct agency run.','idea','jobvance-ad-studio/runs/2026-10-18/04-scripts/b1-job-title-job-searcher.md'),
 ('concept-b5-wont','B5: This job tool won''t apply for you','Refusal hook that turns the no-auto-apply rule into the selling point.','idea','jobvance-ad-studio/runs/2026-10-18/04-scripts/b5-wont.md');

INSERT INTO public.jobvance_marketing_creatives(idea_id,label,kind,format,file_name,sha256,approved,approved_at,notes)
SELECT i.id, c.label, c.kind, c.format, c.file_name, c.sha256, c.approved, CASE WHEN c.approved THEN c.approved_at::timestamptz END, c.notes
FROM (VALUES
 ('version-a-search-rewrite-repeat','A feed 4x5','video','4x5','Jobvance-A-Feed-4x5.mp4',NULL,true,'2026-10-23T18:30:00Z','Approved by the owner in chat on 23 Oct. Replaced by v4 on 24 Oct.'),
 ('version-a-search-rewrite-repeat','A Reels 9x16 v2 (Reels-safe captions)','video','9x16','Jobvance-A-Reels-9x16-v2-upload.mp4','9b59165f4d2bedc81b667adddd3677a9fd9bb288342331b310705624d2801ac3',true,'2026-10-23T18:30:00Z','Approved by the owner in chat on 23 Oct ("Yes, switch Reels on"). Replaced by v4 on 24 Oct.'),
 ('version-b-job-hunt-dragging','B feed 4x5','video','4x5','Jobvance-B-Feed-4x5.mp4',NULL,true,'2026-10-23T18:30:00Z','Approved by the owner in chat on 23 Oct. Replaced by v4 on 24 Oct.'),
 ('version-b-job-hunt-dragging','B Reels 9x16 v2 (Reels-safe captions)','video','9x16','Jobvance-B-Reels-9x16-v2-upload.mp4','7cecb3f0b2848af84cb912eb44a3ec366120aa49d87c24a9921ab3d0a9a58ea9',true,'2026-10-23T18:30:00Z','Approved by the owner in chat on 23 Oct. Replaced by v4 on 24 Oct.'),
 ('version-a-search-rewrite-repeat','A feed 4x5 v4 (younger Liam voice, proof held earlier)','video','4x5','Jobvance-A-Feed-4x5-v4-upload.mp4','8e7b292ac0f3096cf3a7939697d1b04011af7357cadeef8a50a6231f3df255db',true,'2026-10-23T19:00:00Z','Live in Feeds since 24 Oct. Owner: "Yes, swap the Liam voice versions into the live A and B ads."'),
 ('version-a-search-rewrite-repeat','A Reels 9x16 v4 (younger Liam voice, proof held earlier)','video','9x16','Jobvance-A-Reels-9x16-v4-upload.mp4','6100c60cebdea0d45d3575d6ee450808ecb3cbc6455c35c072f5f77b390196b8',true,'2026-10-23T19:00:00Z','Live in Stories and Reels since 24 Oct.'),
 ('version-b-job-hunt-dragging','B feed 4x5 v4 (younger Liam voice, proof held earlier)','video','4x5','Jobvance-B-Feed-4x5-v4-upload.mp4','9481cc79c5d344881244bf96ce8f3b3dec288cbbed92bc9b35a223f00b3f0d58',true,'2026-10-23T19:00:00Z','Live in Feeds since 24 Oct.'),
 ('version-b-job-hunt-dragging','B Reels 9x16 v4 (younger Liam voice, headline off the eyes)','video','9x16','Jobvance-B-Reels-9x16-v4-upload.mp4','731faf669c82d42f7ea2b37b2d54adcf12e7c287d5ca972a720f247af13eafcd',true,'2026-10-23T19:00:00Z','Live in Stories and Reels since 24 Oct.'),
 ('version-a-search-rewrite-repeat','Copy C: the hard part is everything before applying','copy','text',NULL,NULL,true,'2026-10-23T18:30:00Z','Primary-text option in both ads.'),
 ('version-a-search-rewrite-repeat','Copy D: can''t fix the job market, takes the repetitive part','copy','text',NULL,NULL,true,'2026-10-23T18:30:00Z','Primary-text option in both ads.'),
 ('version-c-drama','C feed 4x5 v2 (man first)','video','4x5','Jobvance-C-Feed-4x5-v2-upload.mp4','36227a6a82b9fd795158487a7c3be6d64ba65883d49842fe5be531083dbc9dd4',true,'2026-10-24T13:00:00Z','Owner: "Approved. Launch C as its own A/B test against B." Feeds of Version C - man first.'),
 ('version-c-drama','C Reels 9x16 v2 (man first)','video','9x16','Jobvance-C-Reels-9x16-v2-upload.mp4','e939713882bac3e57260d5aecd714a3cec30d46503c7328c48e57bab0929da60',true,'2026-10-24T13:00:00Z','Stories and Reels of Version C - man first.'),
 ('version-c-drama','C feed 4x5 v2 (partner first)','video','4x5','Jobvance-C-partnerfirst-Feed-4x5-v2-upload.mp4','5c509f958b6eca997d633619cb077b2f2f786bfbb7a1569e89689d2ec6d3c240',true,'2026-10-24T13:00:00Z','Feeds of Version C - partner first.'),
 ('version-c-drama','C Reels 9x16 v2 (partner first)','video','9x16','Jobvance-C-partnerfirst-Reels-9x16-v2-upload.mp4','847c4380aaf6a253235f7e7ef6ce6bb9fa8a330eadf786f80b6b11eb1f8b76f1',true,'2026-10-24T13:00:00Z','Stories and Reels of Version C - partner first.'),
 ('version-c-drama','C text A: auto-apply bots vs Jobvance hunts, checks fit, tailors','copy','text',NULL,NULL,true,'2026-10-24T13:00:00Z','Primary-text option in both C ads (LOCKED-SCRIPT-v2 section 4).'),
 ('version-c-drama','C text B: Jobvance hands you the CV to approve instead','copy','text',NULL,NULL,true,'2026-10-24T13:00:00Z','Primary-text option in both C ads (LOCKED-SCRIPT-v2 section 4).')
) AS c(slug,label,kind,format,file_name,sha256,approved,approved_at,notes)
JOIN public.jobvance_marketing_ideas i ON i.slug=c.slug;

INSERT INTO public.jobvance_marketing_launches(idea_id,name,meta_campaign_id,meta_adset_id,meta_ad_id,daily_budget_minor,currency,end_at)
SELECT i.id, l.name, '120252906111780325', l.adset, l.ad, 50000, 'INR', '2026-10-30T13:00:00Z'::timestamptz
FROM (VALUES
 ('version-a-search-rewrite-repeat','Version A - Search Rewrite Repeat','120252906157150325','120252906172570325'),
 ('version-b-job-hunt-dragging','Version B - Job hunt dragging','120252994824000325','120252994824010325'),
 ('version-c-drama','Version C - man first','120253003770950325','120253003770960325'),
 ('version-c-drama','Version C - partner first','120253003770930325','120253003770940325')
) AS l(slug,name,adset,ad)
JOIN public.jobvance_marketing_ideas i ON i.slug=l.slug;

COMMIT;
