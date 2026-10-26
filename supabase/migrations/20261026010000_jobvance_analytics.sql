BEGIN;

-- First-party analytics: each browser (visitor), each visit (session, ends after 30 idle minutes)
-- and what happened in it: pages, visible seconds, clicks, form submits and sign-in. Written only
-- by the jobvance-track function (service role); read only through the admin RPCs below.
CREATE TABLE public.jobvance_visitors (
  visitor_id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(first_context)='object' AND pg_column_size(first_context)<4000)
);
CREATE INDEX jobvance_visitors_user ON public.jobvance_visitors(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE public.jobvance_sessions (
  session_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES public.jobvance_visitors(visitor_id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(context)='object' AND pg_column_size(context)<4000),
  device text CHECK(length(device)<=20), browser text CHECK(length(browser)<=40), os text CHECK(length(os)<=20),
  in_app text CHECK(length(in_app)<=20), country text CHECK(length(country)<=2)
);
CREATE INDEX jobvance_sessions_started ON public.jobvance_sessions(started_at DESC);
CREATE INDEX jobvance_sessions_visitor ON public.jobvance_sessions(visitor_id);
CREATE INDEX jobvance_sessions_user ON public.jobvance_sessions(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE public.jobvance_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.jobvance_sessions(session_id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL, user_id uuid,
  at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK(kind IN('page_view','page_leave','click','form_submit','identify')),
  path text NOT NULL CHECK(length(path) BETWEEN 1 AND 300),
  title text CHECK(length(title)<=160), label text CHECK(length(label)<=100), href text CHECK(length(href)<=200),
  duration_ms integer CHECK(duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  props jsonb CHECK(props IS NULL OR jsonb_typeof(props)='object' AND pg_column_size(props)<1000)
);
CREATE INDEX jobvance_events_session ON public.jobvance_events(session_id,at,id);
CREATE INDEX jobvance_events_at ON public.jobvance_events(at);
CREATE INDEX jobvance_events_visitor ON public.jobvance_events(visitor_id) WHERE user_id IS NULL;

ALTER TABLE public.jobvance_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobvance_visitors,public.jobvance_sessions,public.jobvance_events FROM PUBLIC,anon,authenticated;

-- Records one batch. A signed-in batch links the browser, and its earlier anonymous visits, to the account.
CREATE FUNCTION public.jobvance_track(p_visitor uuid,p_session uuid,p_user uuid,p_context jsonb,p_device jsonb,p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_inserted integer:=0; v_owner uuid; v_ctx jsonb:=CASE WHEN jsonb_typeof(p_context)='object' AND pg_column_size(p_context)<4000 THEN p_context ELSE '{}'::jsonb END;
  v_first timestamptz; v_last timestamptz;
BEGIN
  IF p_visitor IS NULL OR p_session IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>60 THEN RAISE EXCEPTION 'TRACK_INPUT_INVALID'; END IF;
  SELECT min(LEAST(GREATEST((e->>'at')::timestamptz,now()-interval '1 day'),now())),max(LEAST(GREATEST((e->>'at')::timestamptz,now()-interval '1 day'),now()))
    INTO v_first,v_last FROM jsonb_array_elements(p_events) e;
  v_first:=COALESCE(v_first,now()); v_last:=COALESCE(v_last,now());
  INSERT INTO public.jobvance_visitors(visitor_id,user_id,first_seen_at,last_seen_at,first_context) VALUES(p_visitor,p_user,v_first,v_last,v_ctx)
    ON CONFLICT(visitor_id) DO UPDATE SET last_seen_at=GREATEST(public.jobvance_visitors.last_seen_at,EXCLUDED.last_seen_at),user_id=COALESCE(EXCLUDED.user_id,public.jobvance_visitors.user_id);
  -- A session id belongs to the browser that started it.
  SELECT visitor_id INTO v_owner FROM public.jobvance_sessions WHERE session_id=p_session;
  IF v_owner IS NOT NULL AND v_owner<>p_visitor THEN RETURN 0; END IF;
  INSERT INTO public.jobvance_sessions(session_id,visitor_id,user_id,started_at,last_seen_at,context,device,browser,os,in_app,country)
    VALUES(p_session,p_visitor,p_user,v_first,v_last,v_ctx,left(p_device->>'device',20),left(p_device->>'browser',40),left(p_device->>'os',20),left(p_device->>'inApp',20),left(p_device->>'country',2))
    ON CONFLICT(session_id) DO UPDATE SET last_seen_at=GREATEST(public.jobvance_sessions.last_seen_at,EXCLUDED.last_seen_at),
      started_at=LEAST(public.jobvance_sessions.started_at,EXCLUDED.started_at),user_id=COALESCE(EXCLUDED.user_id,public.jobvance_sessions.user_id),
      context=CASE WHEN public.jobvance_sessions.context='{}'::jsonb THEN EXCLUDED.context ELSE public.jobvance_sessions.context END;
  INSERT INTO public.jobvance_events(session_id,visitor_id,user_id,at,kind,path,title,label,href,duration_ms,props)
  SELECT p_session,p_visitor,p_user,LEAST(GREATEST((e->>'at')::timestamptz,now()-interval '1 day'),now()),e->>'kind',left(e->>'path',300),left(e->>'title',160),left(e->>'label',100),left(e->>'href',200),
    CASE WHEN e->>'durationMs' ~ '^\d{1,8}$' THEN least((e->>'durationMs')::integer,86400000) END,
    CASE WHEN jsonb_typeof(e->'props')='object' AND pg_column_size(e->'props')<1000 THEN e->'props' END
  FROM jsonb_array_elements(p_events) e
  WHERE e->>'kind' IN('page_view','page_leave','click','form_submit','identify') AND left(e->>'path',1)='/' AND e->>'at' IS NOT NULL;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF p_user IS NOT NULL THEN
    UPDATE public.jobvance_sessions SET user_id=p_user WHERE visitor_id=p_visitor AND user_id IS NULL;
    UPDATE public.jobvance_events SET user_id=p_user WHERE visitor_id=p_visitor AND user_id IS NULL;
  END IF;
  RETURN v_inserted;
END $$;

-- Where a visit came from, in plain words.
CREATE FUNCTION public.jobvance_channel(p_context jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN (p_context->>'fbclid')='true' OR lower(COALESCE(p_context->>'utm_source','')) ~ '(facebook|^fb|meta|instagram|^ig$)' THEN 'Meta ads (Instagram / Facebook)'
    WHEN (p_context->>'gclid')='true' OR (lower(COALESCE(p_context->>'utm_source',''))~'google' AND lower(COALESCE(p_context->>'utm_medium',''))~'(cpc|paid|ads)') THEN 'Google ads'
    WHEN p_context->>'utm_source' IS NOT NULL THEN 'Campaign: '||left(p_context->>'utm_source',40)
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '^(www\.)?(google|bing|duckduckgo|search\.yahoo|yandex|ecosia|baidu)\.' THEN 'Search engines'
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '(chatgpt|openai|perplexity|claude\.ai|gemini|copilot)' THEN 'AI assistants'
    WHEN lower(COALESCE(p_context->>'referrer','')) ~ '(facebook|instagram|t\.co|twitter|x\.com|linkedin|reddit|youtube|tiktok|whatsapp)' THEN 'Social (unpaid)'
    WHEN p_context->>'referrer' IS NOT NULL THEN 'Other websites'
    ELSE 'Direct / unknown' END
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
    count(*) FILTER(WHERE e.kind='page_view'),count(*) FILTER(WHERE e.kind='click'),COALESCE(sum(e.duration_ms) FILTER(WHERE e.kind='page_leave'),0)/1000,
    (array_agg(e.path ORDER BY e.at DESC,e.id DESC) FILTER(WHERE e.kind='page_view'))[1]
  FROM public.jobvance_sessions s JOIN public.jobvance_visitors v ON v.visitor_id=s.visitor_id LEFT JOIN public.jobvance_events e ON e.session_id=s.session_id
  WHERE s.started_at>=p_from AND s.started_at<p_to AND (s.user_id IS NULL OR s.user_id NOT IN(SELECT id FROM excluded)) AND (v.user_id IS NULL OR v.user_id NOT IN(SELECT id FROM excluded))
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
  -- Accounts created in this window, credited to every channel that brought one of their visits.
  joined AS (SELECT DISTINCT x.session_id,x.channel,x.user_id FROM visits x JOIN people p ON p.id=x.user_id WHERE p.created_at>=v_start),
  events AS (SELECT e.* FROM public.jobvance_events e JOIN visits x ON x.session_id=e.session_id),
  views AS (SELECT e.session_id,e.path,e.at,e.id,row_number() OVER(PARTITION BY e.session_id ORDER BY e.at,e.id) AS n FROM events e WHERE e.kind='page_view'),
  timed AS (SELECT w.path,w.session_id,COALESCE((SELECT sum(l.duration_ms) FROM events l WHERE l.session_id=w.session_id AND l.kind='page_leave' AND l.path=w.path AND l.at>=w.at
      AND l.at<COALESCE((SELECT min(z.at) FROM views z WHERE z.session_id=w.session_id AND z.n>w.n),'infinity')),0) AS ms FROM views w)
  SELECT jsonb_build_object(
    'window',jsonb_build_object('days',p_days,'start',v_start,'end',v_end),
    'totals',jsonb_build_object('visitors',(SELECT count(DISTINCT visitor_id) FROM visits),'sessions',(SELECT count(*) FROM visits),'pageViews',(SELECT COALESCE(sum(pages),0) FROM visits),
      'avgSeconds',(SELECT COALESCE(round(avg(seconds)),0) FROM visits),'signedIn',(SELECT count(DISTINCT user_id) FROM visits WHERE user_id IS NOT NULL),'newAccounts',(SELECT count(DISTINCT user_id) FROM joined),
      'today',(SELECT count(DISTINCT visitor_id) FROM visits WHERE started_at>=v_midnight)),
    'previous',jsonb_build_object('visitors',(SELECT count(DISTINCT visitor_id) FROM earlier),'sessions',(SELECT count(*) FROM earlier),'pageViews',(SELECT COALESCE(sum(pages),0) FROM earlier)),
    'daily',(SELECT COALESCE(jsonb_agg(jsonb_build_object('day',to_char(d,'YYYY-MM-DD'),'visitors',(SELECT count(DISTINCT visitor_id) FROM visits WHERE started_at>=d AND started_at<d+interval '1 day'),
        'sessions',(SELECT count(*) FROM visits WHERE started_at>=d AND started_at<d+interval '1 day'),'pageViews',(SELECT COALESCE(sum(pages),0) FROM visits WHERE started_at>=d AND started_at<d+interval '1 day')) ORDER BY d),'[]'::jsonb)
      FROM generate_series(v_midnight-make_interval(days=>p_days-1),v_midnight,interval '1 day') d),
    'channels',(SELECT COALESCE(jsonb_agg(jsonb_build_object('label',channel,'sessions',sessions,'visitors',visitors,'newAccounts',accounts) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT x.channel,count(*) AS sessions,count(DISTINCT x.visitor_id) AS visitors,(SELECT count(DISTINCT j.user_id) FROM joined j WHERE j.channel=x.channel) AS accounts FROM visits x GROUP BY x.channel) c),
    'campaigns',(SELECT COALESCE(jsonb_agg(jsonb_build_object('source',source,'campaign',campaign,'content',content,'sessions',sessions,'newAccounts',accounts) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT x.context->>'utm_source' AS source,COALESCE(x.context->>'utm_campaign','') AS campaign,COALESCE(x.context->>'utm_content','') AS content,count(*) AS sessions,
        count(DISTINCT j.user_id) AS accounts FROM visits x LEFT JOIN joined j ON j.session_id=x.session_id WHERE x.context ? 'utm_source' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 50) c),
    'landings',(SELECT COALESCE(jsonb_agg(jsonb_build_object('path',path,'sessions',sessions,'newAccounts',accounts,'avgSeconds',seconds) ORDER BY sessions DESC),'[]'::jsonb) FROM (
      SELECT split_part(COALESCE(x.context->>'landing','(unknown)'),'?',1) AS path,count(*) AS sessions,count(DISTINCT j.user_id) AS accounts,round(avg(x.seconds)) AS seconds
      FROM visits x LEFT JOIN joined j ON j.session_id=x.session_id GROUP BY 1 ORDER BY 2 DESC LIMIT 30) c),
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
  WITH events AS (SELECT * FROM public.jobvance_events WHERE session_id=p_session ORDER BY at,id LIMIT 2000),
  views AS (SELECT id,at,path,row_number() OVER(ORDER BY at,id) AS n FROM events WHERE kind='page_view')
  SELECT jsonb_build_object('id',v_session.session_id,'visitorId',v_session.visitor_id,'userId',COALESCE(v_session.user_id,v.user_id),
    'startedAt',v_session.started_at,'lastSeenAt',v_session.last_seen_at,'channel',public.jobvance_channel(v_session.context),'context',v_session.context,
    'device',v_session.device,'browser',v_session.browser,'os',v_session.os,'inApp',v_session.in_app,'country',v_session.country,
    'person',(SELECT jsonb_build_object('userId',p.id,'name',p.full_name,'email',public.jobvance_admin_email(p.email,v_full),'phone',public.jobvance_admin_phone(p.phone,v_full),'joinedAt',p.created_at)
      FROM public.jobvance_admin_identities() p WHERE p.id=COALESCE(v_session.user_id,v.user_id)),
    'otherVisits',(SELECT count(*)-1 FROM public.jobvance_sessions o WHERE o.visitor_id=v_session.visitor_id),
    'events',(SELECT COALESCE(jsonb_agg(jsonb_build_object('at',e.at,'kind',e.kind,'path',e.path,'title',e.title,'label',e.label,'href',e.href,
        'seconds',CASE WHEN e.kind='page_view' THEN (SELECT COALESCE(sum(l.duration_ms),0)/1000 FROM events l WHERE l.kind='page_leave' AND l.path=e.path AND l.at>=e.at
          AND l.at<COALESCE((SELECT min(z.at) FROM views z WHERE z.n>(SELECT w.n FROM views w WHERE w.id=e.id)),'infinity')) END,
        'scroll',CASE WHEN e.kind='page_view' THEN (SELECT max((l.props->>'maxScroll')::numeric) FROM events l WHERE l.kind='page_leave' AND l.path=e.path AND l.at>=e.at
          AND l.at<COALESCE((SELECT min(z.at) FROM views z WHERE z.n>(SELECT w.n FROM views w WHERE w.id=e.id)),'infinity')) END) ORDER BY e.at,e.id),'[]'::jsonb)
      FROM events e WHERE e.kind<>'page_leave'))
  INTO v_result FROM public.jobvance_visitors v WHERE v.visitor_id=v_session.visitor_id;
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
      (SELECT COALESCE(sum(e.duration_ms),0)/1000 FROM public.jobvance_events e WHERE e.session_id=s.session_id AND e.kind='page_leave') AS seconds
    FROM public.jobvance_sessions s WHERE s.user_id=p_user OR s.visitor_id IN(SELECT visitor_id FROM public.jobvance_visitors WHERE user_id=p_user))
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

REVOKE ALL ON FUNCTION public.jobvance_track(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.jobvance_channel(jsonb),public.jobvance_admin_phone(text,boolean),public.jobvance_admin_identities(),
  public.jobvance_admin_visits(timestamptz,timestamptz),public.jobvance_admin_analytics(uuid,integer),public.jobvance_admin_session(uuid,uuid),public.jobvance_admin_person(uuid,uuid),public.jobvance_admin_contacts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_track(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.jobvance_admin_analytics(uuid,integer),public.jobvance_admin_session(uuid,uuid),public.jobvance_admin_person(uuid,uuid),public.jobvance_admin_contacts(uuid) TO service_role;

COMMIT;
