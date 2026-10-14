-- Anonymous support has a private bearer receipt, a bounded intake, and audited staff review.
CREATE TABLE public.jobvance_guest_support_requests (
  id uuid PRIMARY KEY,
  receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
  rate_hash text NOT NULL CHECK(rate_hash ~ '^[a-f0-9]{64}$'),
  category text NOT NULL CHECK(category IN('help','bug','privacy')),
  message text NOT NULL CHECK(char_length(message) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'received' CHECK(status IN('received','in_review','resolved')),
  reply text NOT NULL DEFAULT '' CHECK(char_length(reply)<=2000),
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days'
);
CREATE INDEX jobvance_guest_support_created ON public.jobvance_guest_support_requests(created_at DESC);
CREATE INDEX jobvance_guest_support_rate ON public.jobvance_guest_support_requests(rate_hash,created_at DESC);
ALTER TABLE public.jobvance_guest_support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobvance_guest_support_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.jobvance_guest_support_requests TO service_role;

CREATE FUNCTION public.jobvance_guest_support_create(p_id uuid,p_receipt_hash text,p_rate_hash text,p_category text,p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.jobvance_guest_support_requests;
BEGIN
  IF p_id IS NULL OR p_receipt_hash !~ '^[a-f0-9]{64}$' OR p_rate_hash !~ '^[a-f0-9]{64}$'
    OR p_category NOT IN('help','bug','privacy') OR char_length(btrim(p_message)) NOT BETWEEN 5 AND 2000
    OR p_receipt_hash IS NULL OR p_rate_hash IS NULL OR p_category IS NULL OR p_message IS NULL THEN
    RAISE EXCEPTION 'GUEST_SUPPORT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(90311420);
  SELECT * INTO s FROM public.jobvance_guest_support_requests WHERE id=p_id;
  IF FOUND THEN
    IF s.receipt_hash<>p_receipt_hash OR s.category<>p_category OR s.message<>btrim(p_message) OR s.expires_at<=now() THEN
      RAISE EXCEPTION 'GUEST_SUPPORT_CONFLICT';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.jobvance_guest_support_requests WHERE rate_hash=p_rate_hash AND created_at>now()-interval '1 hour')>=5
      OR (SELECT count(*) FROM public.jobvance_guest_support_requests WHERE created_at>now()-interval '1 day')>=100 THEN
      RAISE EXCEPTION 'GUEST_SUPPORT_LIMIT';
    END IF;
    INSERT INTO public.jobvance_guest_support_requests(id,receipt_hash,rate_hash,category,message)
      VALUES(p_id,p_receipt_hash,p_rate_hash,p_category,btrim(p_message)) RETURNING * INTO s;
  END IF;
  RETURN jsonb_build_object('id',s.id,'category',s.category,'status',s.status,'reply',s.reply,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.expires_at);
END $$;

CREATE FUNCTION public.jobvance_guest_support_receipt(p_id uuid,p_receipt_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.jobvance_guest_support_requests;
BEGIN
  SELECT * INTO s FROM public.jobvance_guest_support_requests WHERE id=p_id AND receipt_hash=p_receipt_hash AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'GUEST_SUPPORT_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('id',s.id,'category',s.category,'status',s.status,'reply',s.reply,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.expires_at);
END $$;

CREATE FUNCTION public.jobvance_admin_guest_support_list(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows_json jsonb;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'category',s.category,'status',s.status,'version',s.version,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.expires_at,'hasReply',s.reply<>'') ORDER BY s.created_at DESC),'[]'::jsonb)
  INTO rows_json FROM (SELECT * FROM public.jobvance_guest_support_requests WHERE expires_at>now() ORDER BY created_at DESC,id LIMIT 100) s;
  PERFORM public.jobvance_admin_record_event(p_actor,'snapshot',NULL,jsonb_build_object('count',jsonb_array_length(rows_json)));
  RETURN rows_json;
END $$;

CREATE FUNCTION public.jobvance_admin_guest_support_detail(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.jobvance_guest_support_requests;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  SELECT * INTO s FROM public.jobvance_guest_support_requests WHERE id=p_id AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  PERFORM public.jobvance_admin_record_event(p_actor,'support_detail',p_id,jsonb_build_object('version',s.version));
  RETURN jsonb_build_object('id',s.id,'category',s.category,'status',s.status,'version',s.version,'message',s.message,'reply',s.reply,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.expires_at);
END $$;

CREATE FUNCTION public.jobvance_admin_guest_support_update(p_actor uuid,p_id uuid,p_expected_version bigint,p_status text,p_reply text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.jobvance_guest_support_requests;
BEGIN
  PERFORM public.jobvance_assert_admin(p_actor);
  IF p_status IS NULL OR p_status NOT IN('received','in_review','resolved') OR p_reply IS NULL OR char_length(p_reply)>2000 OR p_expected_version IS NULL OR p_expected_version<0 THEN RAISE EXCEPTION 'ADMIN_INPUT_INVALID'; END IF;
  SELECT * INTO s FROM public.jobvance_guest_support_requests WHERE id=p_id AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_NOT_FOUND'; END IF;
  IF s.version<>p_expected_version THEN RAISE EXCEPTION 'ADMIN_VERSION_CONFLICT'; END IF;
  UPDATE public.jobvance_guest_support_requests SET status=p_status,reply=p_reply,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO s;
  PERFORM public.jobvance_admin_record_event(p_actor,'support_updated',p_id,jsonb_build_object('version',s.version,'status',s.status));
  RETURN jsonb_build_object('id',s.id,'category',s.category,'status',s.status,'version',s.version,'message',s.message,'reply',s.reply,'createdAt',s.created_at,'updatedAt',s.updated_at,'expiresAt',s.expires_at);
END $$;

CREATE FUNCTION public.jobvance_guest_support_cleanup() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed bigint;
BEGIN DELETE FROM public.jobvance_guest_support_requests WHERE expires_at<=now(); GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed; END $$;

REVOKE ALL ON FUNCTION public.jobvance_guest_support_create(uuid,text,text,text,text),public.jobvance_guest_support_receipt(uuid,text),public.jobvance_admin_guest_support_list(uuid),public.jobvance_admin_guest_support_detail(uuid,uuid),public.jobvance_admin_guest_support_update(uuid,uuid,bigint,text,text),public.jobvance_guest_support_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_guest_support_create(uuid,text,text,text,text),public.jobvance_guest_support_receipt(uuid,text),public.jobvance_admin_guest_support_list(uuid),public.jobvance_admin_guest_support_detail(uuid,uuid),public.jobvance_admin_guest_support_update(uuid,uuid,bigint,text,text),public.jobvance_guest_support_cleanup() TO service_role;
DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE 'SELECT cron.schedule(''jobvance-guest-support-retention'',''17 3 * * *'',''SELECT public.jobvance_guest_support_cleanup()'')';
  END IF;
END $$;
