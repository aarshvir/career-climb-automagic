BEGIN;

-- Browser identity is not account authority. The first linked owner is never
-- reassigned; each visit has its own immutable account association after claim.
CREATE TABLE public.jobvance_visitors (
  visitor_id uuid PRIMARY KEY,
  user_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(first_context)='object' AND octet_length(first_context::text)<4000)
);
CREATE INDEX jobvance_visitors_user ON public.jobvance_visitors(user_id) WHERE user_id IS NOT NULL;
CREATE TABLE public.jobvance_sessions (
  session_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES public.jobvance_visitors(visitor_id) ON DELETE CASCADE,
  user_id uuid,
  started_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(context)='object' AND octet_length(context::text)<4000),
  device_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  device text CHECK(length(device)<=20), browser text CHECK(length(browser)<=40), os text CHECK(length(os)<=20),
  in_app text CHECK(length(in_app)<=20), country text CHECK(length(country)<=2)
);
CREATE INDEX jobvance_sessions_started ON public.jobvance_sessions(started_at DESC);
CREATE INDEX jobvance_sessions_visitor ON public.jobvance_sessions(visitor_id);
CREATE INDEX jobvance_sessions_user ON public.jobvance_sessions(user_id) WHERE user_id IS NOT NULL;
-- Retain the submitted actor separately from later NULL -> first-account linkage.
-- Exact retry returns the original receipt, including its original inserted count.
CREATE TABLE public.jobvance_tracking_batches (
  batch_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.jobvance_sessions(session_id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  original_user_id uuid,
  payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),
  receipt jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jobvance_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE, page_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.jobvance_tracking_batches(batch_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.jobvance_sessions(session_id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL, user_id uuid, original_user_id uuid,
  payload jsonb NOT NULL,
  at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK(kind IN('page_view','page_leave','click','form_submit','identify')),
  path text NOT NULL CHECK(length(path) BETWEEN 1 AND 300),
  title text CHECK(length(title)<=160), label text CHECK(length(label)<=100), href text CHECK(length(href)<=200),
  duration_ms integer CHECK(duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  props jsonb CHECK(props IS NULL OR jsonb_typeof(props)='object' AND octet_length(props::text)<1000)
);
CREATE UNIQUE INDEX jobvance_events_page_view ON public.jobvance_events(page_id) WHERE kind='page_view';
CREATE INDEX jobvance_events_session ON public.jobvance_events(session_id,at,id);
CREATE INDEX jobvance_events_at ON public.jobvance_events(at);
CREATE INDEX jobvance_events_page ON public.jobvance_events(session_id,page_id);
CREATE TABLE public.jobvance_analytics_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.jobvance_analytics_coverage(singleton) VALUES(true);
ALTER TABLE public.jobvance_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_tracking_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_analytics_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_visitors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_tracking_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_analytics_coverage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobvance_visitors,public.jobvance_sessions,public.jobvance_tracking_batches,public.jobvance_events,public.jobvance_analytics_coverage FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.jobvance_track(p_visitor uuid,p_session uuid,p_batch uuid,p_user uuid,p_context jsonb,p_device jsonb,p_events jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payload jsonb; v_batch public.jobvance_tracking_batches; v_visit public.jobvance_sessions;
  v_visitor_owner uuid; v_e jsonb; v_key text; v_value jsonb; v_id uuid; v_page uuid;
  v_first timestamptz; v_last timestamptz; v_time timestamptz; v_inserted integer:=0; v_accepted integer; v_receipt jsonb;
BEGIN
  IF p_visitor IS NULL OR p_session IS NULL OR p_batch IS NULL OR p_context IS NULL OR p_device IS NULL OR p_events IS NULL
    OR jsonb_typeof(p_context)<>'object' OR octet_length(p_context::text)>=4000
    OR jsonb_typeof(p_device)<>'object' OR octet_length(p_device::text)>=1000
    OR jsonb_typeof(p_events)<>'array' THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
  v_accepted:=jsonb_array_length(p_events);
  IF v_accepted NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
  -- Device/country is first-receipt observation, not retry or session authority.
  v_payload:=jsonb_build_object('visitor',p_visitor,'session',p_session,'user',p_user,'context',p_context,'events',p_events);
  IF octet_length(v_payload::text)>65536 THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jobvance-batch:'||p_batch::text,0));
  SELECT * INTO v_batch FROM public.jobvance_tracking_batches WHERE batch_id=p_batch;
  IF FOUND THEN
    IF v_batch.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'TRACK_BATCH_CONFLICT'; END IF;
    RETURN v_batch.receipt;
  END IF;
  IF p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'TRACK_USER_INVALID'; END IF;
  FOR v_e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(v_e)<>'object' THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_e))>11
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_e) k WHERE k NOT IN('id','pageId','kind','at','path','title','label','href','durationMs','props'))
      OR jsonb_typeof(v_e->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_e->'pageId') IS DISTINCT FROM 'string'
      OR COALESCE(v_e->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR COALESCE(v_e->>'pageId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR COALESCE(v_e->>'kind','') NOT IN('page_view','page_leave','click','form_submit','identify')
      OR jsonb_typeof(v_e->'at') IS DISTINCT FROM 'string' OR jsonb_typeof(v_e->'path') IS DISTINCT FROM 'string'
      OR length(v_e->>'path') NOT BETWEEN 1 AND 300 OR left(v_e->>'path',1)<>'/' OR left(v_e->>'path',2)='//'
      THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    v_time:=(v_e->>'at')::timestamptz;
    IF v_time<now()-interval '1 day' OR v_time>now()+interval '5 minutes' THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    v_first:=LEAST(v_first,v_time); v_last:=GREATEST(v_last,v_time);
    FOREACH v_key IN ARRAY ARRAY['title','label','href'] LOOP
      IF v_e ? v_key AND (jsonb_typeof(v_e->v_key)<>'string' OR length(v_e->>v_key)>CASE v_key WHEN 'title' THEN 160 WHEN 'label' THEN 100 ELSE 200 END) THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    END LOOP;
    IF v_e->>'kind'='page_leave' AND NOT(v_e ? 'durationMs') THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    IF v_e ? 'durationMs' AND (jsonb_typeof(v_e->'durationMs')<>'number' OR (v_e->>'durationMs') !~ '^\d{1,8}$'
      OR (v_e->>'durationMs')::numeric>86400000 OR v_e->>'kind'<>'page_leave') THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    IF v_e ? 'props' THEN
      IF jsonb_typeof(v_e->'props')<>'object' THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
      IF octet_length((v_e->'props')::text)>=1000
        OR (SELECT count(*) FROM jsonb_object_keys(v_e->'props'))>10 THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
      FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_e->'props') LOOP
        IF v_key !~ '^[a-zA-Z]{1,30}$' OR jsonb_typeof(v_value) NOT IN('string','number','boolean')
          OR jsonb_typeof(v_value)='string' AND length(v_value#>>'{}')>100 THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
      END LOOP;
      IF v_e->'props' ? 'maxScroll' AND (jsonb_typeof(v_e->'props'->'maxScroll')<>'number'
        OR (v_e->'props'->>'maxScroll')::numeric NOT BETWEEN 0 AND 100) THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_events) e)<>v_accepted
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_events) e GROUP BY e->>'pageId' HAVING count(DISTINCT e->>'path')>1 OR count(*) FILTER(WHERE e->>'kind'='page_view')>1)
    THEN RAISE EXCEPTION 'TRACK_EVENT_CONFLICT'; END IF;
  INSERT INTO public.jobvance_visitors(visitor_id,first_seen_at,last_seen_at,first_context) VALUES(p_visitor,v_first,v_last,p_context) ON CONFLICT(visitor_id) DO NOTHING;
  SELECT user_id INTO v_visitor_owner FROM public.jobvance_visitors WHERE visitor_id=p_visitor FOR UPDATE;
  SELECT * INTO v_visit FROM public.jobvance_sessions WHERE session_id=p_session FOR UPDATE;
  IF FOUND THEN
    IF v_visit.visitor_id<>p_visitor OR v_visit.user_id IS NOT NULL AND v_visit.user_id IS DISTINCT FROM p_user
      OR v_visit.context IS DISTINCT FROM p_context THEN RAISE EXCEPTION 'TRACK_SESSION_CONFLICT'; END IF;
  ELSE
    INSERT INTO public.jobvance_sessions(session_id,visitor_id,user_id,started_at,last_seen_at,context,device_context,device,browser,os,in_app,country)
      VALUES(p_session,p_visitor,p_user,v_first,v_last,p_context,p_device,left(p_device->>'device',20),left(p_device->>'browser',40),left(p_device->>'os',20),left(p_device->>'inApp',20),left(p_device->>'country',2));
  END IF;
  -- Lock page and event references in stable order before testing global identity.
  FOR v_id IN SELECT DISTINCT (e->>'pageId')::uuid FROM jsonb_array_elements(p_events) e ORDER BY 1 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jobvance-page:'||v_id::text,0));
  END LOOP;
  FOR v_id IN SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_events) e ORDER BY 1 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jobvance-event:'||v_id::text,0));
  END LOOP;
  FOR v_e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_id:=(v_e->>'id')::uuid; v_page:=(v_e->>'pageId')::uuid;
    IF EXISTS(SELECT 1 FROM public.jobvance_events e WHERE e.event_id=v_id AND (e.session_id<>p_session OR e.visitor_id<>p_visitor
        OR e.original_user_id IS DISTINCT FROM p_user OR e.payload IS DISTINCT FROM v_e))
      OR EXISTS(SELECT 1 FROM public.jobvance_events e WHERE e.page_id=v_page AND (e.session_id<>p_session OR e.visitor_id<>p_visitor OR e.path<>v_e->>'path'))
      OR v_e->>'kind'='page_view' AND EXISTS(SELECT 1 FROM public.jobvance_events e WHERE e.page_id=v_page AND e.kind='page_view' AND e.event_id<>v_id)
      THEN RAISE EXCEPTION 'TRACK_EVENT_CONFLICT'; END IF;
  END LOOP;
  IF p_user IS NOT NULL THEN
    IF v_visitor_owner IS NULL THEN
      UPDATE public.jobvance_visitors SET user_id=p_user WHERE visitor_id=p_visitor AND user_id IS NULL;
      UPDATE public.jobvance_sessions SET user_id=p_user WHERE visitor_id=p_visitor AND user_id IS NULL;
      UPDATE public.jobvance_events SET user_id=p_user WHERE visitor_id=p_visitor AND user_id IS NULL;
    ELSE
      -- A later account may claim only its current anonymous visit, never browser history.
      UPDATE public.jobvance_sessions SET user_id=p_user WHERE session_id=p_session AND user_id IS NULL;
      UPDATE public.jobvance_events SET user_id=p_user WHERE session_id=p_session AND user_id IS NULL;
    END IF;
  END IF;
  INSERT INTO public.jobvance_tracking_batches(batch_id,session_id,visitor_id,original_user_id,payload,receipt)
    VALUES(p_batch,p_session,p_visitor,p_user,v_payload,'{}');
  INSERT INTO public.jobvance_events(event_id,page_id,batch_id,session_id,visitor_id,user_id,original_user_id,payload,at,kind,path,title,label,href,duration_ms,props)
    SELECT (e->>'id')::uuid,(e->>'pageId')::uuid,p_batch,p_session,p_visitor,p_user,p_user,e,(e->>'at')::timestamptz,e->>'kind',e->>'path',e->>'title',e->>'label',e->>'href',(e->>'durationMs')::integer,e->'props'
    FROM jsonb_array_elements(p_events) e ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  UPDATE public.jobvance_sessions SET last_seen_at=GREATEST(last_seen_at,v_last) WHERE session_id=p_session;
  UPDATE public.jobvance_visitors SET last_seen_at=GREATEST(last_seen_at,v_last) WHERE visitor_id=p_visitor;
  v_receipt:=jsonb_build_object('batchId',p_batch,'accepted',v_accepted,'inserted',v_inserted,'duplicate',v_inserted<v_accepted);
  UPDATE public.jobvance_tracking_batches SET receipt=v_receipt WHERE batch_id=p_batch;
  RETURN v_receipt;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID';
END $$;

-- Where a visit came from, in plain words.
CREATE FUNCTION public.jobvance_channel(p_context jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN (p_context->>'fbclid')='true' OR (lower(COALESCE(p_context->>'utm_source','')) ~ '^(facebook|fb|meta|instagram|ig)([. _-]|$)'
      AND lower(COALESCE(p_context->>'utm_medium','')) ~ '(^|[ _-])(paid|cpc|ppc|ads?)([ _-]|$)') THEN 'Meta ads (Instagram / Facebook)'
    WHEN (p_context->>'gclid')='true' OR (lower(COALESCE(p_context->>'utm_source',''))~'^google([. _-]|$)'
      AND lower(COALESCE(p_context->>'utm_medium',''))~'(^|[ _-])(paid|cpc|ppc|ads?)([ _-]|$)') THEN 'Google ads'
    WHEN lower(COALESCE(p_context->>'utm_source','')) ~ '^(facebook|fb|meta|instagram|ig|twitter|linkedin|reddit|youtube|tiktok|whatsapp)([. _-]|$)' THEN 'Social (unpaid)'
    WHEN lower(COALESCE(p_context->>'utm_source','')) ~ '^(google|bing|duckduckgo|yahoo|yandex|ecosia|baidu)([. _-]|$)' THEN 'Search engines'
    WHEN p_context->>'utm_source' IS NOT NULL THEN 'Campaign: '||left(p_context->>'utm_source',40)
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '^(www\.)?(google|bing|duckduckgo|search\.yahoo|yandex|ecosia|baidu)\.' THEN 'Search engines'
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '(chatgpt|openai|perplexity|claude\.ai|gemini|copilot)' THEN 'AI assistants'
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '(facebook|instagram|t\.co|twitter|x\.com|linkedin|reddit|youtube|tiktok|whatsapp)' THEN 'Social (unpaid)'
    WHEN p_context->>'referrer' IS NOT NULL THEN 'Other websites'
    ELSE 'Direct / unknown' END
$$;

-- A page exposure has its own UUID; late leave events cannot attach to a later
-- visit to the same URL. Distinct visible-time segments are counted once by id.
CREATE FUNCTION public.jobvance_page_exposures() RETURNS TABLE(session_id uuid,page_id uuid,path text,at timestamptz,event_row_id bigint,duration_ms bigint,max_scroll numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT w.session_id,w.page_id,w.path,w.at,w.id,COALESCE(sum(l.duration_ms),0)::bigint,
    max(CASE WHEN jsonb_typeof(l.props->'maxScroll')='number' THEN (l.props->>'maxScroll')::numeric END)
  FROM public.jobvance_events w LEFT JOIN public.jobvance_events l ON l.session_id=w.session_id AND l.page_id=w.page_id AND l.kind='page_leave' AND l.at>=w.at
  WHERE w.kind='page_view' GROUP BY w.id
$$;

CREATE FUNCTION public.jobvance_admin_phone(p_phone text,p_full boolean) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN COALESCE(p_phone,'')='' THEN NULL WHEN p_full THEN p_phone ELSE left(p_phone,3)||'••••'||right(p_phone,3) END
$$;

-- Real people with their name and mobile number, as saved at sign-up or the "one last step" screen.
CREATE FUNCTION public.jobvance_admin_identities() RETURNS TABLE(id uuid,email text,full_name text,phone text,created_at timestamptz,last_sign_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,p.email,NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')),''),NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'phone','')),''),p.created_at,p.last_sign_in_at
  FROM public.jobvance_admin_people() p JOIN auth.users u ON u.id=p.id WHERE p.kind='real'
$$;

-- Visits worth reporting: anyone not known to be a test or staff account.
CREATE FUNCTION public.jobvance_admin_visits(p_from timestamptz,p_to timestamptz) RETURNS TABLE(session_id uuid,visitor_id uuid,user_id uuid,started_at timestamptz,last_seen_at timestamptz,context jsonb,channel text,device text,browser text,in_app text,pages bigint,clicks bigint,seconds bigint,last_page text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH excluded AS (SELECT id FROM public.jobvance_admin_people() WHERE kind<>'real')
  SELECT s.session_id,s.visitor_id,s.user_id,s.started_at,s.last_seen_at,s.context,public.jobvance_channel(s.context),s.device,s.browser,s.in_app,
    count(*) FILTER(WHERE e.kind='page_view'),count(*) FILTER(WHERE e.kind='click'),
    (SELECT floor(COALESCE(sum(x.duration_ms),0)/1000)::bigint FROM public.jobvance_page_exposures() x WHERE x.session_id=s.session_id),
    (array_agg(e.path ORDER BY e.at DESC,e.id DESC) FILTER(WHERE e.kind='page_view'))[1]
  FROM public.jobvance_sessions s JOIN public.jobvance_visitors v ON v.visitor_id=s.visitor_id LEFT JOIN public.jobvance_events e ON e.session_id=s.session_id
  WHERE s.started_at>=p_from AND s.started_at<p_to AND (s.user_id IS NULL OR s.user_id NOT IN(SELECT id FROM excluded))
  GROUP BY s.session_id
$$;

CREATE FUNCTION public.jobvance_admin_analytics(p_actor uuid,p_days integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_role text; v_full boolean; v_end timestamptz:=now(); v_start timestamptz; v_before timestamptz; v_midnight timestamptz:=date_trunc('day',now()); v_result jsonb;
BEGIN
  v_role:=public.jobvance_assert_admin(p_actor);
  IF p_days IS NULL OR p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'ADMIN_INPUT_INVALID'; END IF;
  v_full:=v_role='owner'; v_start:=v_end-make_interval(days=>p_days); v_before:=v_start-make_interval(days=>p_days);
  WITH visits AS (SELECT * FROM public.jobvance_admin_visits(v_start,v_end)),
  earlier AS (SELECT * FROM public.jobvance_admin_visits(v_before,v_start)),
  people AS (SELECT * FROM public.jobvance_admin_identities()),
  -- First recorded touch for each new account; never credit every later return.
  joined AS (SELECT DISTINCT ON(p.id) s.session_id,public.jobvance_channel(s.context) AS channel,s.user_id,s.context
    FROM people p JOIN public.jobvance_sessions s ON s.user_id=p.id WHERE p.created_at>=v_start AND p.created_at<v_end
    ORDER BY p.id,s.started_at,s.session_id),
  events AS (SELECT e.* FROM public.jobvance_events e JOIN visits x ON x.session_id=e.session_id WHERE e.at>=v_start AND e.at<v_end),
  timed AS (SELECT w.path,w.session_id,w.duration_ms AS ms FROM public.jobvance_page_exposures() w JOIN visits x ON x.session_id=w.session_id WHERE w.at>=v_start AND w.at<v_end),
  channel_keys AS (SELECT channel FROM visits UNION SELECT channel FROM joined),
  campaign_keys AS (SELECT context->>'utm_source' AS source,COALESCE(context->>'utm_campaign','') AS campaign,COALESCE(context->>'utm_content','') AS content FROM visits WHERE context ? 'utm_source'
    UNION SELECT context->>'utm_source',COALESCE(context->>'utm_campaign',''),COALESCE(context->>'utm_content','') FROM joined WHERE context ? 'utm_source'),
  landing_keys AS (SELECT split_part(COALESCE(context->>'landing','(unknown)'),'?',1) AS path FROM visits
    UNION SELECT split_part(COALESCE(context->>'landing','(unknown)'),'?',1) FROM joined)

  SELECT jsonb_build_object(
    'window',jsonb_build_object('days',p_days,'start',v_start,'end',v_end),
    'coverage',(SELECT jsonb_build_object('startedAt',started_at,'status',CASE WHEN v_start<started_at THEN 'partial' ELSE 'available' END) FROM public.jobvance_analytics_coverage WHERE singleton),
    'totals',jsonb_build_object('visitors',(SELECT count(DISTINCT visitor_id) FROM visits),'sessions',(SELECT count(*) FROM visits),'pageViews',(SELECT COALESCE(sum(pages),0) FROM visits),
      'avgSeconds',(SELECT COALESCE(round(avg(seconds)),0) FROM visits),'signedIn',(SELECT count(DISTINCT user_id) FROM visits WHERE user_id IS NOT NULL),'newAccounts',(SELECT count(DISTINCT user_id) FROM joined),
      'today',(SELECT count(DISTINCT visitor_id) FROM visits WHERE started_at>=v_midnight)),
    'previous',jsonb_build_object('visitors',(SELECT count(DISTINCT visitor_id) FROM earlier),'sessions',(SELECT count(*) FROM earlier),'pageViews',(SELECT COALESCE(sum(pages),0) FROM earlier)),
    'daily',(SELECT COALESCE(jsonb_agg(jsonb_build_object('day',to_char(d,'YYYY-MM-DD'),'visitors',(SELECT count(DISTINCT visitor_id) FROM visits WHERE started_at>=d AND started_at<d+interval '1 day'),
        'sessions',(SELECT count(*) FROM visits WHERE started_at>=d AND started_at<d+interval '1 day'),'pageViews',(SELECT count(*) FROM events WHERE kind='page_view' AND at>=d AND at<d+interval '1 day')) ORDER BY d),'[]'::jsonb)
      FROM generate_series(v_midnight-make_interval(days=>p_days-1),v_midnight,interval '1 day') d),
    'channels',(SELECT COALESCE(jsonb_agg(jsonb_build_object('label',channel,'sessions',sessions,'visitors',visitors,'newAccounts',accounts) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT k.channel,(SELECT count(*) FROM visits x WHERE x.channel=k.channel) AS sessions,(SELECT count(DISTINCT x.visitor_id) FROM visits x WHERE x.channel=k.channel) AS visitors,
        (SELECT count(*) FROM joined j WHERE j.channel=k.channel) AS accounts FROM channel_keys k) c),
    'campaigns',(SELECT COALESCE(jsonb_agg(jsonb_build_object('source',source,'campaign',campaign,'content',content,'sessions',sessions,'newAccounts',accounts) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT k.source,k.campaign,k.content,
        (SELECT count(*) FROM visits x WHERE x.context->>'utm_source'=k.source AND COALESCE(x.context->>'utm_campaign','')=k.campaign AND COALESCE(x.context->>'utm_content','')=k.content) AS sessions,
        (SELECT count(*) FROM joined j WHERE j.context->>'utm_source'=k.source AND COALESCE(j.context->>'utm_campaign','')=k.campaign AND COALESCE(j.context->>'utm_content','')=k.content) AS accounts
      FROM campaign_keys k ORDER BY 4 DESC LIMIT 50) c),
    'landings',(SELECT COALESCE(jsonb_agg(jsonb_build_object('path',path,'sessions',sessions,'newAccounts',accounts,'avgSeconds',seconds) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT k.path,(SELECT count(*) FROM visits x WHERE split_part(COALESCE(x.context->>'landing','(unknown)'),'?',1)=k.path) AS sessions,
        (SELECT count(*) FROM joined j WHERE split_part(COALESCE(j.context->>'landing','(unknown)'),'?',1)=k.path) AS accounts,
        COALESCE((SELECT round(avg(x.seconds)) FROM visits x WHERE split_part(COALESCE(x.context->>'landing','(unknown)'),'?',1)=k.path),0) AS seconds
      FROM landing_keys k ORDER BY 2 DESC LIMIT 30) c),
    'pages',(SELECT COALESCE(jsonb_agg(jsonb_build_object('path',path,'views',views,'visitors',visitors,'avgSeconds',seconds) ORDER BY views DESC),'[]'::jsonb) FROM (
      SELECT split_part(t.path,'?',1) AS path,count(*) AS views,count(DISTINCT x.visitor_id) AS visitors,round(avg(t.ms)/1000.0) AS seconds
      FROM timed t JOIN visits x ON x.session_id=t.session_id GROUP BY 1 ORDER BY 2 DESC LIMIT 40) c),
    'clicks',(SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'path',path,'href',href,'count',clicks,'visitors',visitors) ORDER BY clicks DESC),'[]'::jsonb) FROM (
      SELECT e.label,split_part(e.path,'?',1) AS path,max(e.href) AS href,count(*) AS clicks,count(DISTINCT e.visitor_id) AS visitors FROM events e WHERE e.kind='click' AND e.label IS NOT NULL GROUP BY 1,2 ORDER BY 4 DESC LIMIT 40) c),
    'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.session_id,'visitorId',x.visitor_id,'userId',x.user_id,'startedAt',x.started_at,'lastSeenAt',x.last_seen_at,
        'name',p.full_name,'email',CASE WHEN p.id IS NULL THEN NULL ELSE public.jobvance_admin_email(p.email,v_full) END,'phone',public.jobvance_admin_phone(p.phone,v_full),
        'channel',x.channel,'campaign',NULLIF(concat_ws(' · ',x.context->>'utm_campaign',x.context->>'utm_content'),''),'landing',x.context->>'landing','lastPage',x.last_page,
        'pages',x.pages,'clicks',x.clicks,'seconds',x.seconds,'device',x.device,'browser',x.browser,'inApp',x.in_app) ORDER BY x.started_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM visits ORDER BY started_at DESC LIMIT 300) x LEFT JOIN people p ON p.id=x.user_id))
  INTO v_result;
  RETURN v_result;
END $$;

-- One visit, step by step: each page with the seconds spent on it, clicks, form submits and sign-in.
CREATE FUNCTION public.jobvance_admin_session(p_actor uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_role text; v_full boolean; v_session public.jobvance_sessions; v_result jsonb;
BEGIN
  v_role:=public.jobvance_assert_admin(p_actor); v_full:=v_role='owner';
  SELECT * INTO v_session FROM public.jobvance_sessions WHERE session_id=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  IF v_session.user_id IN(SELECT id FROM public.jobvance_admin_people() WHERE kind<>'real') THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  WITH events AS (SELECT * FROM public.jobvance_events WHERE session_id=p_session ORDER BY at,id LIMIT 2000)
  SELECT jsonb_build_object('id',v_session.session_id,'visitorId',v_session.visitor_id,'userId',v_session.user_id,
    'startedAt',v_session.started_at,'lastSeenAt',v_session.last_seen_at,'channel',public.jobvance_channel(v_session.context),'context',v_session.context,
    'device',v_session.device,'browser',v_session.browser,'os',v_session.os,'inApp',v_session.in_app,'country',v_session.country,
    'person',(SELECT jsonb_build_object('userId',p.id,'name',p.full_name,'email',public.jobvance_admin_email(p.email,v_full),'phone',public.jobvance_admin_phone(p.phone,v_full),'joinedAt',p.created_at)
      FROM public.jobvance_admin_identities() p WHERE p.id=v_session.user_id),
    'otherVisits',(SELECT GREATEST(count(*)-1,0) FROM public.jobvance_sessions o WHERE CASE WHEN v_session.user_id IS NULL THEN o.visitor_id=v_session.visitor_id AND o.user_id IS NULL ELSE o.user_id=v_session.user_id END),
    'events',(SELECT COALESCE(jsonb_agg(jsonb_build_object('at',e.at,'kind',e.kind,'path',e.path,'title',e.title,'label',e.label,'href',e.href,
        'seconds',CASE WHEN e.kind='page_view' THEN (SELECT floor(x.duration_ms/1000.0)::bigint FROM public.jobvance_page_exposures() x WHERE x.event_row_id=e.id) END,
        'scroll',CASE WHEN e.kind='page_view' THEN (SELECT x.max_scroll FROM public.jobvance_page_exposures() x WHERE x.event_row_id=e.id) END) ORDER BY e.at,e.id),'[]'::jsonb)
      FROM events e WHERE e.kind<>'page_leave')) INTO v_result;
  RETURN v_result;
END $$;

-- One person: name, email, mobile number, where they first came from and every visit.
CREATE FUNCTION public.jobvance_admin_person(p_actor uuid,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_role text; v_full boolean; v_result jsonb;
BEGIN
  v_role:=public.jobvance_assert_admin(p_actor); v_full:=v_role='owner';
  WITH visits AS (SELECT s.session_id,s.started_at,s.last_seen_at,s.context,s.device,s.browser,s.in_app,
      (SELECT count(*) FROM public.jobvance_events e WHERE e.session_id=s.session_id AND e.kind='page_view') AS pages,
      (SELECT count(*) FROM public.jobvance_events e WHERE e.session_id=s.session_id AND e.kind='click') AS clicks,
      (SELECT floor(COALESCE(sum(e.duration_ms),0)/1000)::bigint FROM public.jobvance_page_exposures() e WHERE e.session_id=s.session_id) AS seconds
    FROM public.jobvance_sessions s WHERE s.user_id=p_user)
  SELECT jsonb_build_object('userId',p.id,'name',p.full_name,'email',public.jobvance_admin_email(p.email,v_full),'phone',public.jobvance_admin_phone(p.phone,v_full),
    'joinedAt',p.created_at,'lastSignInAt',p.last_sign_in_at,
    'paidUsd',(SELECT COALESCE(sum(x.usd),0) FROM public.jobvance_admin_payments() x WHERE x.user_id=p.id),
    'firstVisit',(SELECT jsonb_build_object('at',started_at,'channel',public.jobvance_channel(context),'campaign',NULLIF(concat_ws(' · ',context->>'utm_campaign',context->>'utm_content'),''),
      'landing',context->>'landing','referrer',context->>'referrer') FROM visits ORDER BY started_at LIMIT 1),
    'totals',jsonb_build_object('visits',(SELECT count(*) FROM visits),'pageViews',(SELECT COALESCE(sum(pages),0) FROM visits),'seconds',(SELECT COALESCE(sum(seconds),0) FROM visits)),
    'visits',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',session_id,'startedAt',started_at,'channel',public.jobvance_channel(context),'landing',context->>'landing',
      'pages',pages,'clicks',clicks,'seconds',seconds,'device',device,'inApp',in_app) ORDER BY started_at DESC),'[]'::jsonb) FROM (SELECT * FROM visits ORDER BY started_at DESC LIMIT 200) v))
  INTO v_result FROM public.jobvance_admin_identities() p WHERE p.id=p_user;
  IF v_result IS NULL THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  RETURN v_result;
END $$;

-- Name and mobile number for every real account, with how often and how they visit.
CREATE FUNCTION public.jobvance_admin_contacts(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_role text; v_full boolean; v_result jsonb;
BEGIN
  v_role:=public.jobvance_assert_admin(p_actor); v_full:=v_role='owner';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',p.id,'name',p.full_name,'phone',public.jobvance_admin_phone(p.phone,v_full),
    'visits',(SELECT count(*) FROM public.jobvance_sessions s WHERE s.user_id=p.id),
    'lastVisitAt',(SELECT max(s.last_seen_at) FROM public.jobvance_sessions s WHERE s.user_id=p.id),
    'channel',(SELECT public.jobvance_channel(s.context) FROM public.jobvance_sessions s WHERE s.user_id=p.id ORDER BY s.started_at LIMIT 1)) ORDER BY p.created_at DESC),'[]'::jsonb)
  INTO v_result FROM (SELECT * FROM public.jobvance_admin_identities() ORDER BY created_at DESC LIMIT 1000) p;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.jobvance_track(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb),public.jobvance_channel(jsonb),public.jobvance_page_exposures(),public.jobvance_admin_phone(text,boolean),public.jobvance_admin_identities(),
  public.jobvance_admin_visits(timestamptz,timestamptz),public.jobvance_admin_analytics(uuid,integer),public.jobvance_admin_session(uuid,uuid),public.jobvance_admin_person(uuid,uuid),public.jobvance_admin_contacts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_track(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb),public.jobvance_admin_analytics(uuid,integer),public.jobvance_admin_session(uuid,uuid),public.jobvance_admin_person(uuid,uuid),public.jobvance_admin_contacts(uuid) TO service_role;

COMMIT;
