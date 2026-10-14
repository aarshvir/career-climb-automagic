BEGIN;

-- A browser's last displayed workspace generation is part of its intent.
-- Reading a fresh epoch when an old HTTP request finally arrives is not enough.
ALTER TABLE public.job_loop_oauth_states ADD COLUMN lifecycle_generation bigint NOT NULL DEFAULT 0 CHECK(lifecycle_generation>=0);
ALTER TABLE public.job_loop_connections ADD COLUMN lifecycle_generation bigint NOT NULL DEFAULT 0 CHECK(lifecycle_generation>=0);

-- Preserve currently valid connections and short-lived OAuth states. The
-- metadata-only backfill also works while an owner's erasure is in progress.
DO $$
DECLARE owner_id uuid; lifecycle public.job_loop_lifecycle; prior_context text;
BEGIN
  FOR owner_id IN SELECT user_id FROM public.job_loop_oauth_states UNION SELECT user_id FROM public.job_loop_connections ORDER BY 1 LOOP
    lifecycle:=public.job_loop_erasure_owner_lock(owner_id);
    prior_context:=current_setting('jobvance.loop.erasure_owner',true);
    PERFORM set_config('jobvance.loop.erasure_owner',owner_id::text,true);
    UPDATE public.job_loop_oauth_states SET lifecycle_generation=lifecycle.generation WHERE user_id=owner_id;
    UPDATE public.job_loop_connections SET lifecycle_generation=lifecycle.generation WHERE user_id=owner_id;
    PERFORM set_config('jobvance.loop.erasure_owner',COALESCE(prior_context,''),true);
  END LOOP;
END $$;

CREATE FUNCTION public.job_loop_assert_generation(p_user uuid,p_generation bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  IF p_generation IS NULL OR p_generation<0 THEN RAISE EXCEPTION 'LOOP_REQUEST_GENERATION_REQUIRED'; END IF;
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF lifecycle.generation<>p_generation THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  IF lifecycle.state='erasing' THEN RAISE EXCEPTION 'LOOP_ERASURE_IN_PROGRESS'; END IF;
  IF lifecycle.state<>'active' THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
END $$;

CREATE FUNCTION public.job_loop_open_record(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_generation bigint; record public.job_loop_records;
BEGIN
  -- Only an intentional workspace read/first setup uses this activation path.
  -- Protected mutations assert the browser's expected generation before opening.
  owner_generation:=public.job_loop_assert_writable(p_user,true);
  INSERT INTO public.job_loop_records(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO record FROM public.job_loop_records WHERE user_id=p_user;
  RETURN to_jsonb(record)||jsonb_build_object('lifecycle_generation',owner_generation);
END $$;

CREATE FUNCTION public.job_loop_read_record(p_user uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record public.job_loop_records;
BEGIN
  -- Protected HTTP actions use this instead of open_record: erasure may finish
  -- between a preliminary generation check and this read. Never activate here.
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO record FROM public.job_loop_records WHERE user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_NOT_FOUND'; END IF;
  RETURN to_jsonb(record)||jsonb_build_object('lifecycle_generation',p_generation);
END $$;

CREATE FUNCTION public.job_loop_erasure_status(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  RETURN jsonb_build_object('state',lifecycle.state,'generation',lifecycle.generation);
END $$;

ALTER FUNCTION public.job_loop_begin_erase(uuid) RENAME TO job_loop_begin_erase_v23;
REVOKE ALL ON FUNCTION public.job_loop_begin_erase_v23(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.job_loop_begin_erase(p_user uuid,p_expected_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifecycle public.job_loop_lifecycle;
BEGIN
  IF p_expected_generation IS NULL OR p_expected_generation<0 THEN RAISE EXCEPTION 'LOOP_REQUEST_GENERATION_REQUIRED'; END IF;
  lifecycle:=public.job_loop_erasure_owner_lock(p_user);
  IF lifecycle.state='active' THEN
    IF p_expected_generation<>lifecycle.generation THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  ELSE
    -- Active G starts erasure G+1. The original G intent may only continue that
    -- same cleanup; neither value can erase a new active enrollment G+2.
    IF p_expected_generation<>lifecycle.generation AND p_expected_generation<>lifecycle.generation-1 THEN RAISE EXCEPTION 'LOOP_REQUEST_STALE'; END IF;
  END IF;
  RETURN public.job_loop_begin_erase_v23(p_user);
END $$;
CREATE FUNCTION public.job_loop_begin_erase(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'LOOP_REQUEST_GENERATION_REQUIRED'; END $$;

CREATE FUNCTION public.job_loop_save_schedule_bound(p_user uuid,p_generation bigint,p_expected bigint,p_settings jsonb,p_next timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  RETURN public.job_loop_save_schedule_unfenced(p_user,p_expected,p_settings,p_next);
END $$;
CREATE FUNCTION public.job_loop_schedule_action_bound(p_user uuid,p_generation bigint,p_expected bigint,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  RETURN public.job_loop_schedule_action_unfenced(p_user,p_expected,p_action);
END $$;

CREATE FUNCTION public.job_loop_start_run_bound(p_user uuid,p_generation bigint,p_request uuid,p_request_hash text,p_input_hash text,p_expected bigint,p_provider text,p_model text,p_consents jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  RETURN public.job_loop_start_run_unfenced(p_user,p_request,p_request_hash,p_input_hash,p_expected,p_provider,p_model,p_consents);
END $$;

CREATE FUNCTION public.job_loop_request_support(p_user uuid,p_generation bigint,p_category text,p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt public.job_loop_support_requests;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_category IS NULL OR p_category NOT IN('help','privacy','bug') OR p_message IS NULL
    OR length(btrim(p_message)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'LOOP_SUPPORT_INVALID'; END IF;
  -- The owner lock makes admission and insertion one quota decision. A delayed
  -- pre-erasure message cannot restore text into a new private workspace.
  IF (SELECT count(*) FROM public.job_loop_support_requests WHERE user_id=p_user AND created_at>=now()-interval '1 day')>=5 THEN RAISE EXCEPTION 'LOOP_SUPPORT_LIMIT'; END IF;
  INSERT INTO public.job_loop_support_requests(user_id,category,message) VALUES(p_user,p_category,btrim(p_message)) RETURNING * INTO receipt;
  RETURN to_jsonb(receipt);
END $$;

CREATE FUNCTION public.job_loop_create_oauth_state(p_user uuid,p_generation bigint,p_hash text,p_drafts boolean,p_verifier_cipher text,p_expires timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_drafts IS NULL OR p_verifier_cipher IS NULL
    OR length(p_verifier_cipher) NOT BETWEEN 30 AND 16000 OR p_expires IS NULL
    OR p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '10 minutes' THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  INSERT INTO public.job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at,lifecycle_generation)
    VALUES(p_hash,p_user,p_drafts,p_verifier_cipher,p_expires,p_generation);
END $$;

CREATE OR REPLACE FUNCTION public.job_loop_consume_oauth_state(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; owner_generation bigint;
BEGIN
  SELECT user_id,lifecycle_generation INTO owner_id,owner_generation FROM public.job_loop_oauth_states WHERE state_hash=p_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  PERFORM public.job_loop_assert_generation(owner_id,owner_generation);
  -- The returned row includes its immutable admission epoch. The callback must
  -- recheck it after exchanging tokens and before returning an activation ticket.
  RETURN public.job_loop_consume_oauth_state_unfenced(p_hash);
END $$;

CREATE FUNCTION public.job_loop_read_oauth_state(p_user uuid,p_generation bigint,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.job_loop_oauth_states;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO state FROM public.job_loop_oauth_states WHERE user_id=p_user AND state_hash=p_hash
    AND lifecycle_generation=p_generation AND consumed_at IS NOT NULL AND activated_at IS NULL AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  RETURN to_jsonb(state)-'verifier_ciphertext';
END $$;

CREATE FUNCTION public.job_loop_activate_gmail_bound(p_user uuid,p_generation bigint,p_hash text,p_cipher text,p_email text,p_drafts boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE activated boolean;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  PERFORM public.job_loop_read_oauth_state(p_user,p_generation,p_hash);
  activated:=public.job_loop_activate_gmail_unfenced(p_user,p_hash,p_cipher,p_email,p_drafts);
  UPDATE public.job_loop_connections SET lifecycle_generation=p_generation WHERE user_id=p_user;
  RETURN activated;
END $$;

CREATE FUNCTION public.job_loop_disconnect_gmail(p_user uuid,p_generation bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  DELETE FROM public.job_loop_connections WHERE user_id=p_user;
  DELETE FROM public.job_loop_oauth_states WHERE user_id=p_user;
END $$;

CREATE FUNCTION public.job_loop_read_gmail_connection(p_user uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE connection public.job_loop_connections;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  SELECT * INTO connection FROM public.job_loop_connections WHERE user_id=p_user AND lifecycle_generation=p_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_GMAIL_NOT_CONNECTED'; END IF;
  RETURN to_jsonb(connection);
END $$;

CREATE FUNCTION public.job_loop_refresh_gmail(p_user uuid,p_generation bigint,p_previous_cipher text,p_cipher text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_previous_cipher IS NULL OR p_cipher IS NULL OR length(p_cipher) NOT BETWEEN 30 AND 16000 THEN RAISE EXCEPTION 'LOOP_OAUTH_STATE'; END IF;
  UPDATE public.job_loop_connections SET token_ciphertext=p_cipher,updated_at=now()
    WHERE user_id=p_user AND lifecycle_generation=p_generation AND token_ciphertext=p_previous_cipher;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.job_loop_claim_draft_bound(p_user uuid,p_generation bigint,p_packet uuid,p_request uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  RETURN public.job_loop_claim_draft_unfenced(p_user,p_packet,p_request,p_hash);
END $$;

CREATE FUNCTION public.job_loop_finish_gmail_draft(p_user uuid,p_generation bigint,p_request uuid,p_hash text,p_status text,p_draft_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.job_loop_gmail_drafts;
BEGIN
  PERFORM public.job_loop_assert_generation(p_user,p_generation);
  IF p_status IS NULL OR p_status NOT IN('created','uncertain') OR (p_status='created' AND (p_draft_id IS NULL OR length(p_draft_id) NOT BETWEEN 1 AND 300)) THEN RAISE EXCEPTION 'LOOP_DRAFT_UNCERTAIN'; END IF;
  SELECT * INTO prior FROM public.job_loop_gmail_drafts WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
  IF NOT FOUND OR prior.fingerprint IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'LOOP_DRAFT_UNCERTAIN'; END IF;
  -- A repeated acknowledgement cannot downgrade a known created receipt or
  -- replace its external draft reference with another result.
  IF prior.status='created' THEN
    IF p_status='created' AND prior.draft_id IS NOT DISTINCT FROM p_draft_id THEN RETURN; END IF;
    RAISE EXCEPTION 'LOOP_DRAFT_UNCERTAIN';
  END IF;
  UPDATE public.job_loop_gmail_drafts SET status=p_status,draft_id=CASE WHEN p_status='created' THEN p_draft_id ELSE NULL END
    WHERE user_id=p_user AND request_id=p_request AND fingerprint=p_hash;
END $$;

-- A worker's inbox operations must inherit the epoch of this successful lease,
-- never re-read the newest epoch after an old job has crossed an HTTP boundary.
CREATE OR REPLACE FUNCTION public.job_loop_claim_run(p_run uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; lifecycle public.job_loop_lifecycle; claimed jsonb;
BEGIN
  SELECT user_id INTO owner_id FROM public.job_loop_runs WHERE id=p_run;
  IF NOT FOUND THEN RETURN NULL; END IF;
  lifecycle:=public.job_loop_erasure_owner_lock(owner_id);
  PERFORM public.job_loop_assert_generation(owner_id,lifecycle.generation);
  claimed:=public.job_loop_claim_run_unfenced(p_run,p_lease);
  IF claimed IS NULL THEN RETURN NULL; END IF;
  RETURN claimed||jsonb_build_object('lifecycle_generation',lifecycle.generation);
END $$;

-- Once this migration commits, the old generationless server routes must fail
-- closed. Deploy the matching Edge handlers and UI together immediately after
-- migration; an old browser tab must refresh rather than adopt a new epoch.
REVOKE EXECUTE ON FUNCTION public.job_loop_save_schedule(uuid,bigint,jsonb,timestamptz),
  public.job_loop_schedule_action(uuid,bigint,text),public.job_loop_activate_gmail(uuid,text,text,text,boolean),
  public.job_loop_claim_draft(uuid,uuid,uuid,text),public.job_loop_begin_erase(uuid),
  public.job_loop_start_run(uuid,uuid,text,text,bigint,text,text,jsonb),
  public.job_loop_start_run_core(uuid,uuid,text,text,bigint,text,text,jsonb),public.job_loop_enroll_pilot(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON public.job_loop_oauth_states,public.job_loop_connections,public.job_loop_gmail_drafts,
  public.job_loop_support_requests FROM service_role;

REVOKE ALL ON FUNCTION public.job_loop_assert_generation(uuid,bigint),public.job_loop_open_record(uuid),public.job_loop_read_record(uuid,bigint),public.job_loop_erasure_status(uuid),
  public.job_loop_begin_erase(uuid,bigint),public.job_loop_save_schedule_bound(uuid,bigint,bigint,jsonb,timestamptz),
  public.job_loop_schedule_action_bound(uuid,bigint,bigint,text),public.job_loop_create_oauth_state(uuid,bigint,text,boolean,text,timestamptz),
  public.job_loop_start_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb),public.job_loop_request_support(uuid,bigint,text,text),
  public.job_loop_read_oauth_state(uuid,bigint,text),public.job_loop_activate_gmail_bound(uuid,bigint,text,text,text,boolean),
  public.job_loop_disconnect_gmail(uuid,bigint),public.job_loop_read_gmail_connection(uuid,bigint),
  public.job_loop_refresh_gmail(uuid,bigint,text,text),public.job_loop_claim_draft_bound(uuid,bigint,uuid,uuid,text),
  public.job_loop_finish_gmail_draft(uuid,bigint,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_assert_generation(uuid,bigint),public.job_loop_open_record(uuid),public.job_loop_read_record(uuid,bigint),public.job_loop_erasure_status(uuid),
  public.job_loop_begin_erase(uuid,bigint),public.job_loop_save_schedule_bound(uuid,bigint,bigint,jsonb,timestamptz),
  public.job_loop_schedule_action_bound(uuid,bigint,bigint,text),public.job_loop_create_oauth_state(uuid,bigint,text,boolean,text,timestamptz),
  public.job_loop_start_run_bound(uuid,bigint,uuid,text,text,bigint,text,text,jsonb),public.job_loop_request_support(uuid,bigint,text,text),
  public.job_loop_read_oauth_state(uuid,bigint,text),public.job_loop_activate_gmail_bound(uuid,bigint,text,text,text,boolean),
  public.job_loop_disconnect_gmail(uuid,bigint),public.job_loop_read_gmail_connection(uuid,bigint),
  public.job_loop_refresh_gmail(uuid,bigint,text,text),public.job_loop_claim_draft_bound(uuid,bigint,uuid,uuid,text),
  public.job_loop_finish_gmail_draft(uuid,bigint,uuid,text,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
