BEGIN;

-- Privilege is tied to one verified existing Auth UUID; metadata and email edits
-- never authorize access. No signup trigger or default administrator exists.
CREATE TABLE public.jobvance_admin_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK(role IN('owner','operator')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.jobvance_admin_members(user_id,role)
SELECT id,'owner' FROM auth.users
WHERE id='be619aa5-b1b8-4978-8780-b62461361980'::uuid AND lower(email)='aarshvir@gmail.com'
ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE public.jobvance_admin_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
  monthly_cap_micros bigint NOT NULL DEFAULT 50000000 CHECK(monthly_cap_micros BETWEEN 1 AND 50000000),
  router_enabled boolean NOT NULL DEFAULT false,
  default_model text NOT NULL DEFAULT 'openai/gpt-6.1-sol' CHECK(default_model IN('openai/gpt-6.1-sol','anthropic/claude-sonnet-5.5')),
  reasoning text NOT NULL DEFAULT 'medium' CHECK(reasoning='medium'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.jobvance_admin_config(singleton) VALUES(true);
ALTER TABLE public.job_loop_support_requests ADD COLUMN admin_version bigint NOT NULL DEFAULT 0 CHECK(admin_version>=0);

CREATE TABLE public.jobvance_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL, action text NOT NULL CHECK(action IN('snapshot','config_updated','support_updated','provider_status','independent_review','admin_commentary')),
  target_id uuid, at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=2000)
);
CREATE INDEX jobvance_admin_audit_date ON public.jobvance_admin_audit(at DESC);
CREATE FUNCTION public.jobvance_admin_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'ADMIN_AUDIT_IMMUTABLE'; END $$;
CREATE TRIGGER jobvance_admin_audit_immutable BEFORE UPDATE OR DELETE ON public.jobvance_admin_audit FOR EACH ROW EXECUTE FUNCTION public.jobvance_admin_audit_immutable();

CREATE TABLE public.jobvance_admin_task_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.jobvance_admin_members(user_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN('provider_status','independent_review','admin_commentary')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=150000),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 minutes')
);
CREATE TABLE public.jobvance_admin_model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES public.jobvance_admin_members(user_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL, operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 100),
  action text NOT NULL CHECK(action IN('independent_review','admin_commentary')), batch_id uuid,
  month text NOT NULL REFERENCES public.job_loop_budget_months(month), provider text NOT NULL CHECK(provider='openrouter'),
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 150),
  reserved_micros bigint NOT NULL CHECK(reserved_micros BETWEEN 1 AND 50000000), actual_micros bigint,
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','settled','uncertain')),
  result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id,operation_key), CHECK(actual_micros IS NULL OR actual_micros BETWEEN 0 AND reserved_micros),
  CHECK(action<>'independent_review' OR batch_id IS NOT NULL),
  CHECK(result IS NULL OR jsonb_typeof(result)='object' AND octet_length(result::text)<=150000)
);
CREATE INDEX jobvance_admin_model_usage_month ON public.jobvance_admin_model_usage(month);

ALTER TABLE public.jobvance_admin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_task_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_task_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobvance_admin_model_usage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobvance_admin_members,public.jobvance_admin_config,public.jobvance_admin_audit,public.jobvance_admin_task_tickets,public.jobvance_admin_model_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.jobvance_admin_members,public.jobvance_admin_config,public.jobvance_admin_task_tickets,public.jobvance_admin_model_usage TO service_role;
GRANT SELECT,INSERT ON public.jobvance_admin_audit TO service_role;

CREATE FUNCTION public.jobvance_assert_admin(p_actor uuid,p_owner boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM public.jobvance_admin_members WHERE user_id=p_actor AND active FOR SHARE;
  IF NOT FOUND OR p_owner AND r<>'owner' THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN r;
END $$;
CREATE FUNCTION public.jobvance_consume_admin_ticket(p_ticket uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.jobvance_admin_task_tickets;
BEGIN
  UPDATE public.jobvance_admin_task_tickets SET consumed_at=now()
  WHERE id=p_ticket AND action=p_action AND expires_at>now() AND consumed_at IS NULL RETURNING * INTO t;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_TICKET_INVALID'; END IF;
  PERFORM public.jobvance_assert_admin(t.owner_id,p_action IN('independent_review','admin_commentary'));
  RETURN jsonb_build_object('owner_id',t.owner_id,'payload',t.payload);
END $$;

CREATE FUNCTION public.jobvance_admin_record_event(p_actor uuid,p_action text,p_target uuid DEFAULT NULL,p_details jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  -- Audit contains only allowlisted operational counters/statuses. Reject text
  -- blobs, messages, CV facts, raw provider results, credentials and unknown keys.
  IF jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR octet_length(p_details::text)>2000 OR EXISTS(
    SELECT 1 FROM jsonb_each(p_details) e WHERE e.key NOT IN('days','version','status','configured','valid','count','reservedMicros','actualMicros','requestId','model','batchId')
      OR jsonb_typeof(e.value) NOT IN('string','number','boolean','null') OR length(e.value::text)>160
  ) THEN RAISE EXCEPTION 'ADMIN_AUDIT_INVALID'; END IF;
  INSERT INTO public.jobvance_admin_audit(actor_id,action,target_id,details) VALUES(p_actor,p_action,p_target,p_details);
END $$;

CREATE FUNCTION public.jobvance_admin_reserve(p_actor uuid,p_request uuid,p_key text,p_action text,p_batch uuid,p_provider text,p_model text,p_micros bigint,p_cap_micros bigint DEFAULT 50000000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.jobvance_admin_model_usage; month_key text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM'); effective_cap bigint; batch_used bigint;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor,true);
  IF p_action NOT IN('independent_review','admin_commentary') OR p_micros NOT BETWEEN 1 AND 50000000 OR p_cap_micros NOT BETWEEN 1 AND 50000000 OR p_action='independent_review' AND p_batch IS NULL THEN RAISE EXCEPTION 'ADMIN_BUDGET_LIMIT'; END IF;
  -- Same budget lock as all candidate/search calls. Serializes concurrent batch
  -- checks and deduplication without fabricating a candidate run.
  INSERT INTO public.job_loop_budget_months(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.job_loop_budget_months WHERE month=month_key FOR UPDATE;
  SELECT * INTO u FROM public.jobvance_admin_model_usage WHERE request_id=p_request AND operation_key=p_key;
  IF FOUND THEN
    IF u.actor_id<>p_actor OR u.action<>p_action OR u.batch_id IS DISTINCT FROM p_batch OR u.provider<>p_provider OR u.model<>p_model OR u.reserved_micros<>p_micros THEN RAISE EXCEPTION 'ADMIN_REQUEST_CONFLICT'; END IF;
    RETURN to_jsonb(u)||'{"is_new":false}'::jsonb;
  END IF;
  SELECT least(p_cap_micros,monthly_cap_micros) INTO effective_cap FROM public.jobvance_admin_config WHERE singleton;
  IF p_action='independent_review' THEN
    SELECT COALESCE(sum(CASE WHEN status='settled' THEN actual_micros ELSE reserved_micros END),0) INTO batch_used FROM public.jobvance_admin_model_usage WHERE batch_id=p_batch;
    IF batch_used+p_micros>5000000 THEN RAISE EXCEPTION 'ADMIN_REVIEW_BATCH_LIMIT'; END IF;
  END IF;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros+p_micros WHERE month=month_key AND committed_micros+p_micros<=effective_cap;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_BUDGET_LIMIT'; END IF;
  INSERT INTO public.jobvance_admin_model_usage(actor_id,request_id,operation_key,action,batch_id,month,provider,model,reserved_micros) VALUES(p_actor,p_request,p_key,p_action,p_batch,month_key,p_provider,p_model,p_micros) RETURNING * INTO u;
  PERFORM public.jobvance_admin_record_event(p_actor,p_action,u.id,jsonb_build_object('reservedMicros',p_micros,'model',p_model,'requestId',p_request));
  RETURN to_jsonb(u)||'{"is_new":true}'::jsonb;
END $$;
CREATE FUNCTION public.jobvance_admin_settle(p_usage uuid,p_actual bigint,p_result jsonb,p_uncertain boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.jobvance_admin_model_usage;
BEGIN
  SELECT * INTO u FROM public.jobvance_admin_model_usage WHERE id=p_usage FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  IF u.status='settled' THEN RETURN to_jsonb(u); END IF;
  -- Unknown calls keep the full reserved amount; later known actuals may settle.
  IF p_uncertain OR p_actual IS NULL THEN
    UPDATE public.jobvance_admin_model_usage SET status='uncertain',result=p_result WHERE id=p_usage RETURNING * INTO u;
    RETURN to_jsonb(u);
  END IF;
  IF p_actual NOT BETWEEN 0 AND u.reserved_micros THEN RAISE EXCEPTION 'ADMIN_USAGE_INVALID'; END IF;
  UPDATE public.job_loop_budget_months SET committed_micros=committed_micros-(u.reserved_micros-p_actual) WHERE month=u.month;
  UPDATE public.jobvance_admin_model_usage SET status='settled',actual_micros=p_actual,result=p_result WHERE id=p_usage RETURNING * INTO u;
  RETURN to_jsonb(u);
END $$;

CREATE FUNCTION public.jobvance_admin_update_config(p_actor uuid,p_expected bigint,p_config jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.jobvance_admin_config; monthly bigint; scheduler_value boolean;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor,true);
  SELECT * INTO c FROM public.jobvance_admin_config WHERE singleton FOR UPDATE;
  IF c.version<>p_expected THEN RAISE EXCEPTION 'ADMIN_VERSION_CONFLICT'; END IF;
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_config))<>5 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE k NOT IN('monthlyCapUsd','schedulerEnabled','routerEnabled','defaultModel','reasoning')) OR jsonb_typeof(p_config->'monthlyCapUsd') IS DISTINCT FROM 'number' OR jsonb_typeof(p_config->'schedulerEnabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_config->'routerEnabled') IS DISTINCT FROM 'boolean' OR p_config->>'defaultModel' NOT IN('openai/gpt-6.1-sol','anthropic/claude-sonnet-5.5') OR p_config->>'reasoning' IS DISTINCT FROM 'medium' THEN RAISE EXCEPTION 'ADMIN_CONFIG_INVALID'; END IF;
  monthly:=floor((p_config->>'monthlyCapUsd')::numeric*1000000);
  -- Owner may only lower the configured ceiling. Raising requires a separate,
  -- reviewed operator migration; this API can never enable checkout.
  IF monthly NOT BETWEEN 1 AND c.monthly_cap_micros THEN RAISE EXCEPTION 'ADMIN_CONFIG_INVALID'; END IF;
  scheduler_value:=(p_config->>'schedulerEnabled')::boolean;
  UPDATE public.job_loop_scheduler_config SET enabled=scheduler_value WHERE singleton;
  UPDATE public.jobvance_admin_config SET version=version+1,monthly_cap_micros=monthly,router_enabled=(p_config->>'routerEnabled')::boolean,default_model=p_config->>'defaultModel',reasoning='medium',updated_at=now() WHERE singleton RETURNING * INTO c;
  PERFORM public.jobvance_admin_record_event(p_actor,'config_updated',NULL,jsonb_build_object('version',c.version));
  RETURN jsonb_build_object('version',c.version,'schedulerEnabled',scheduler_value,'monthlyCapUsd',c.monthly_cap_micros/1000000.0,'routerEnabled',c.router_enabled,'defaultModel',c.default_model,'reasoning',c.reasoning,'updatedAt',c.updated_at);
END $$;
CREATE FUNCTION public.jobvance_admin_update_support(p_actor uuid,p_id uuid,p_expected bigint,p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.job_loop_support_requests;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  IF p_status NOT IN('received','in_review','resolved') THEN RAISE EXCEPTION 'ADMIN_INPUT_INVALID'; END IF;
  SELECT * INTO s FROM public.job_loop_support_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  IF s.admin_version<>p_expected THEN RAISE EXCEPTION 'ADMIN_VERSION_CONFLICT'; END IF;
  UPDATE public.job_loop_support_requests SET status=p_status,admin_version=admin_version+1 WHERE id=p_id RETURNING * INTO s;
  PERFORM public.jobvance_admin_record_event(p_actor,'support_updated',p_id,jsonb_build_object('version',s.admin_version,'status',s.status));
  RETURN jsonb_build_object('id',s.id,'status',s.status,'version',s.admin_version);
END $$;

REVOKE ALL ON FUNCTION public.jobvance_assert_admin(uuid,boolean),public.jobvance_consume_admin_ticket(uuid,text),public.jobvance_admin_record_event(uuid,text,uuid,jsonb),public.jobvance_admin_reserve(uuid,uuid,text,text,uuid,text,text,bigint,bigint),public.jobvance_admin_settle(uuid,bigint,jsonb,boolean),public.jobvance_admin_update_config(uuid,bigint,jsonb),public.jobvance_admin_update_support(uuid,uuid,bigint,text),public.jobvance_admin_audit_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_assert_admin(uuid,boolean),public.jobvance_consume_admin_ticket(uuid,text),public.jobvance_admin_record_event(uuid,text,uuid,jsonb),public.jobvance_admin_reserve(uuid,uuid,text,text,uuid,text,text,bigint,bigint),public.jobvance_admin_settle(uuid,bigint,jsonb,boolean),public.jobvance_admin_update_config(uuid,bigint,jsonb),public.jobvance_admin_update_support(uuid,uuid,bigint,text) TO service_role;

COMMIT;
