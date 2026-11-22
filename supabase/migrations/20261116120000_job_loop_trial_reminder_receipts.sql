BEGIN;

-- Resolves TODO(trial-reminder-email) in 20261111120000_job_loop_seven_day_trial.
--
-- Jobvance has no transactional mail provider, and it does not add one here.
-- Dodo Payments, the merchant of record, already sends its own "Subscription
-- Trial Ending" customer email before a trial's first charge (Settings >
-- Communication > Customer Emails, on by default; test-mode emails are
-- delivered too, with a [TEST MODE] subject). Sending a second Jobvance email
-- would duplicate it.
--
-- What this migration can and cannot prove. Dodo exposes a customer-wide email
-- log (GET /customers/{customer_id}/emails). Its documented entries carry a
-- type, a time and a delivery status, but NO subscription, product or payment
-- reference. A trial-ending email on that log therefore cannot be tied to this
-- subscription (another product's trial of the same customer can produce an
-- identical row), so it is never treated as proof: reminder_sent_at is NOT set
-- from it. The email is kept as UNBOUND candidate evidence, the trial is
-- escalated with reason 'unbound', and a person checks it in the Dodo
-- dashboard. If Dodo ever documents a subscription binding, confirmation can be
-- added in a later migration; none is guessed here.
--
-- What it does prove, stated as such:
--   * whether the log could be read at all (unavailable attempts are recorded
--     apart from "no email found");
--   * whether a trial-ending-type email exists in the three days before the
--     first charge, its send time (written once, never changed) and how many
--     such emails there were (more than one means other trials overlapped);
--   * the email's delivery outcome, tracked apart from its send time: Dodo
--     documents status 'sent' as provisional, so an in-flight email is
--     rechecked (bounded) and a later failed / complained / blocked answer is
--     surfaced on the support list. A delivered answer ends the rechecks.
--
-- An incident is durable: it lives on the receipt row, survives the first
-- charge, and the support list keeps it for 30 days after that charge. Nothing
-- here charges, cancels or emails anyone.

CREATE TABLE jobvance_private.loop_trial_reminder_receipts (
  mode text NOT NULL CHECK(mode IN('test','live')),
  subscription_id text NOT NULL CHECK(subscription_id ~ '^sub_[A-Za-z0-9_-]{1,100}$'),
  -- Every attempt to read the customer's email log, readable or not. A fair
  -- sweep takes the least recently attempted row first; backoff_step spaces
  -- the next attempt (20 minutes, doubling to at most 4 hours).
  checks integer NOT NULL DEFAULT 0 CHECK(checks BETWEEN 0 AND 1000),
  last_checked_at timestamptz,
  last_read_at timestamptz,
  backoff_step integer NOT NULL DEFAULT 0 CHECK(backoff_step BETWEEN 0 AND 4),
  -- Attempts whose log could not be read or parsed, recorded apart from
  -- "read fine, no email". The streak resets on a readable log.
  unavailable_checks integer NOT NULL DEFAULT 0 CHECK(unavailable_checks BETWEEN 0 AND 1000),
  unavailable_streak integer NOT NULL DEFAULT 0 CHECK(unavailable_streak BETWEEN 0 AND 1000),
  first_unavailable_at timestamptz,
  last_unavailable_at timestamptz,
  last_unavailable_cause text CHECK(last_unavailable_cause IS NULL OR last_unavailable_cause IN('read_failed','invalid_response','incomplete')),
  -- Candidate trial-ending email on the CUSTOMER's log. It is not bound to this
  -- subscription (see above). Written once; the send time is historical
  -- evidence and is never rewritten (a trigger enforces it).
  email_log_id text CHECK(email_log_id IS NULL OR email_log_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  email_type text CHECK(email_type IS NULL OR email_type ~ '^[a-z0-9_.-]{1,100}$'),
  email_created_at timestamptz,
  first_email_status text CHECK(first_email_status IS NULL OR first_email_status IN('sent','delivered','failed','complained','blocked')),
  candidate_count integer CHECK(candidate_count IS NULL OR candidate_count BETWEEN 1 AND 100),
  -- Delivery outcome, tracked apart from the send time. It only ever moves
  -- forward: sent, then delivered, then failed / complained / blocked.
  delivery_status text CHECK(delivery_status IS NULL OR delivery_status IN('sent','delivered','failed','complained','blocked')),
  delivery_status_at timestamptz,
  delivery_checks integer NOT NULL DEFAULT 0 CHECK(delivery_checks BETWEEN 0 AND 1000),
  -- Incidents. The timestamps are the first time each was recorded and are
  -- never cleared; escalation_reasons are the incidents open right now.
  unbound_at timestamptz,
  not_found_at timestamptz,
  unavailable_overdue_at timestamptz,
  escalated_at timestamptz,
  escalation_reasons text[] NOT NULL DEFAULT '{}'
    CHECK(escalation_reasons <@ ARRAY['unbound','not_found','unavailable_overdue','delivery_failed','delivery_complained','delivery_blocked']::text[]),
  PRIMARY KEY(mode,subscription_id),
  CHECK((email_log_id IS NULL)=(email_type IS NULL) AND (email_log_id IS NULL)=(email_created_at IS NULL) AND (email_log_id IS NULL)=(first_email_status IS NULL)
    AND (email_log_id IS NULL)=(candidate_count IS NULL) AND (email_log_id IS NULL)=(delivery_status IS NULL) AND (email_log_id IS NULL)=(delivery_status_at IS NULL)
    AND (email_log_id IS NULL)=(unbound_at IS NULL)),
  CHECK(escalated_at IS NOT NULL OR cardinality(escalation_reasons)=0)
);
ALTER TABLE jobvance_private.loop_trial_reminder_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_trial_reminder_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Delivery outcomes only move forward, so a stale read can never hide a bounce.
CREATE FUNCTION jobvance_private.loop_email_delivery_rank(p_status text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_status WHEN 'sent' THEN 0 WHEN 'delivered' THEN 1 WHEN 'failed' THEN 2 WHEN 'complained' THEN 2 WHEN 'blocked' THEN 2 END
$$;
CREATE FUNCTION jobvance_private.loop_trial_reminder_reason(p_reasons text[],p_reason text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p_reason=ANY(p_reasons) THEN p_reasons ELSE array_append(p_reasons,p_reason) END
$$;

-- The send evidence and the first incident time are history: a candidate email
-- is never replaced or rewritten, and a delivery outcome never moves backward.
CREATE FUNCTION jobvance_private.immutable_loop_trial_reminder_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (OLD.email_log_id IS NOT NULL AND (NEW.email_log_id IS DISTINCT FROM OLD.email_log_id OR NEW.email_type IS DISTINCT FROM OLD.email_type
      OR NEW.email_created_at IS DISTINCT FROM OLD.email_created_at OR NEW.first_email_status IS DISTINCT FROM OLD.first_email_status
      OR NEW.unbound_at IS DISTINCT FROM OLD.unbound_at))
    OR (OLD.escalated_at IS NOT NULL AND NEW.escalated_at IS DISTINCT FROM OLD.escalated_at)
    OR (OLD.not_found_at IS NOT NULL AND NEW.not_found_at IS DISTINCT FROM OLD.not_found_at)
    OR (OLD.unavailable_overdue_at IS NOT NULL AND NEW.unavailable_overdue_at IS DISTINCT FROM OLD.unavailable_overdue_at)
    OR (OLD.delivery_status IS NOT NULL AND (NEW.delivery_status IS NULL
      OR jobvance_private.loop_email_delivery_rank(NEW.delivery_status)<jobvance_private.loop_email_delivery_rank(OLD.delivery_status))) THEN
    RAISE EXCEPTION 'LOOP_TRIAL_REMINDER_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loop_trial_reminder_receipt_immutable BEFORE UPDATE ON jobvance_private.loop_trial_reminder_receipts
  FOR EACH ROW EXECUTE FUNCTION jobvance_private.immutable_loop_trial_reminder_receipt();

-- The one place that decides which trials the sweep and the dispatcher look at,
-- least recently attempted first (never attempted first of all) so an
-- unavailable provider cannot keep the same oldest rows at the front of the
-- batch and starve later ones: a failed attempt pushes its row behind the rest
-- for 20 minutes, doubling to at most 4 hours.
--   * a granted trial whose reminder time has come and whose marker is unset;
--   * the first charge is NOT a stop: rows are watched until three days after
--     it, so an outage that spans the charge still produces an incident;
--   * a trial cancelled at period end or revoked owes no reminder and is
--     dropped; before the charge the subscription must still be active, after
--     it any status counts (loop_trial_reminder_owed, below);
--   * a row with no email yet keeps being read; a row whose email is still
--     'sent' is rechecked at most 24 times; a delivered, failed, complained or
--     blocked answer ends the rechecks.

-- Whether a trial still owes (or has missed) a reminder, from its subscription.
-- ONE definition, used by the sweep selector and by the database backstop so
-- they cannot drift apart. A subscription cancelled at period end or revoked
-- owes nothing, at any time. Before the first charge the subscription must still
-- be active. After the first charge its status no longer matters: a failed
-- first charge moves it to on_hold (and failed, past_due, paused or expired are
-- possible), and the missed-reminder incident must survive that.
CREATE FUNCTION jobvance_private.loop_trial_reminder_owed(p_first_charge_at timestamptz,p_status text,p_cancel_at_period_end boolean,p_revoked boolean)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT NOT p_cancel_at_period_end AND NOT p_revoked AND (p_first_charge_at<=now() OR p_status='active')
$$;

CREATE FUNCTION jobvance_private.loop_trial_reminder_targets(p_mode text,p_limit integer)
RETURNS TABLE(subscription_id text,customer_id text,reminder_at timestamptz,first_charge_at timestamptz,checks integer,email_log_id text,delivery_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT t.subscription_id,s.customer_id,t.reminder_at,t.first_charge_at,COALESCE(r.checks,0),r.email_log_id,r.delivery_status
  FROM jobvance_private.loop_subscription_trials t
  JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND s.mode=t.mode
  LEFT JOIN jobvance_private.loop_trial_reminder_receipts r ON r.mode=t.mode AND r.subscription_id=t.subscription_id
  WHERE t.mode=p_mode AND t.granted AND t.reminder_sent_at IS NULL AND t.reminder_at<=now() AND now()<t.first_charge_at+interval '3 days'
    AND jobvance_private.loop_trial_reminder_owed(t.first_charge_at,s.status,s.cancel_at_period_end,s.revoked)
    AND (r.email_log_id IS NULL OR (r.delivery_status='sent' AND r.delivery_checks<24))
    AND (r.last_checked_at IS NULL OR r.last_checked_at+LEAST(interval '20 minutes'*power(2,r.backoff_step),interval '4 hours')<=now())
  ORDER BY r.last_checked_at NULLS FIRST,t.reminder_at,t.subscription_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)
$$;

-- Due reminders to look at, with the provider customer whose email log is read
-- and, for a row already holding a candidate email, that email's id (the same
-- email is followed on later sweeps).
CREATE FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(p_mode text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subscriptionId',d.subscription_id,'customerId',d.customer_id,'reminderAt',d.reminder_at,
    'firstChargeAt',d.first_charge_at,'checks',d.checks,'emailLogId',d.email_log_id,'deliveryStatus',d.delivery_status)),'[]'::jsonb)
  FROM jobvance_private.loop_trial_reminder_targets(p_mode,p_limit) d
$$;

-- Records one READABLE email-log check. A trial-ending-type email in the three
-- days before the first charge is recorded as unbound candidate evidence (never
-- as confirmation); no such email is 'not_found' once the 12-hour deadline after
-- reminder_at has passed. For a row already holding a candidate the same email
-- is rechecked and only its delivery outcome moves. Returns 'escalated' when an
-- incident is open after the call, otherwise 'pending'.
CREATE FUNCTION public.job_loop_billing_trial_reminder_check(p_mode text,p_subscription text,p_email_log_id text,p_email_type text,p_email_status text,p_email_created_at timestamptz,p_candidates integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t jobvance_private.loop_subscription_trials; r jobvance_private.loop_trial_reminder_receipts; has_email boolean:=p_email_log_id IS NOT NULL;
  reasons text[]; new_status text; step integer;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN('test','live') OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR (has_email AND (p_email_log_id !~ '^[A-Za-z0-9_-]{1,200}$' OR p_email_type IS NULL OR p_email_type !~ '^[a-z0-9_.-]{1,100}$'
      OR p_email_status IS NULL OR p_email_status NOT IN('sent','delivered','failed','complained','blocked')
      OR p_email_created_at IS NULL OR NOT isfinite(p_email_created_at) OR (p_candidates IS NOT NULL AND (p_candidates<1 OR p_candidates>100))))
    OR (NOT has_email AND (p_email_type IS NOT NULL OR p_email_status IS NOT NULL OR p_email_created_at IS NOT NULL OR (p_candidates IS NOT NULL AND p_candidates<>0))) THEN
    RAISE EXCEPTION 'LOOP_BILLING_UNBOUND';
  END IF;
  SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE mode=p_mode AND subscription_id=p_subscription AND granted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_UNBOUND'; END IF;
  -- An email outside the three days before the first charge is not this reminder.
  IF has_email AND (p_email_created_at<t.first_charge_at-interval '3 days' OR p_email_created_at>=t.first_charge_at) THEN
    RAISE EXCEPTION 'LOOP_BILLING_UNBOUND';
  END IF;
  -- Another channel already marked this reminder sent: nothing left to observe.
  IF t.reminder_sent_at IS NOT NULL THEN RETURN 'pending'; END IF;
  INSERT INTO jobvance_private.loop_trial_reminder_receipts(mode,subscription_id) VALUES(p_mode,p_subscription) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM jobvance_private.loop_trial_reminder_receipts WHERE mode=p_mode AND subscription_id=p_subscription FOR UPDATE;
  -- A recorded email is followed by its own id; the evidence is never swapped.
  IF r.email_log_id IS NOT NULL AND p_email_log_id IS DISTINCT FROM r.email_log_id THEN RAISE EXCEPTION 'LOOP_BILLING_UNBOUND'; END IF;
  -- A readable log ends a "could not read" incident; a found email ends "not found".
  reasons:=array_remove(r.escalation_reasons,'unavailable_overdue');
  IF has_email THEN
    reasons:=array_remove(reasons,'not_found');
    reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'unbound');
    new_status:=CASE WHEN r.delivery_status IS NULL OR jobvance_private.loop_email_delivery_rank(p_email_status)>jobvance_private.loop_email_delivery_rank(r.delivery_status)
      THEN p_email_status ELSE r.delivery_status END;
    IF new_status='failed' THEN reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'delivery_failed');
    ELSIF new_status='complained' THEN reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'delivery_complained');
    ELSIF new_status='blocked' THEN reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'delivery_blocked'); END IF;
    step:=CASE WHEN r.email_log_id IS NOT NULL AND new_status='sent' THEN LEAST(r.backoff_step+1,4) ELSE 0 END;
  ELSE
    IF now()>=t.reminder_at+interval '12 hours' THEN reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'not_found'); END IF;
    step:=CASE WHEN 'not_found'=ANY(reasons) THEN LEAST(r.backoff_step+1,4) ELSE 0 END;
  END IF;
  UPDATE jobvance_private.loop_trial_reminder_receipts SET checks=LEAST(checks+1,1000),last_checked_at=now(),last_read_at=now(),backoff_step=step,unavailable_streak=0,
    email_log_id=COALESCE(email_log_id,p_email_log_id),email_type=COALESCE(email_type,p_email_type),email_created_at=COALESCE(email_created_at,p_email_created_at),
    first_email_status=COALESCE(first_email_status,p_email_status),
    candidate_count=CASE WHEN has_email THEN GREATEST(COALESCE(candidate_count,1),COALESCE(p_candidates,1)) ELSE candidate_count END,
    unbound_at=CASE WHEN has_email THEN COALESCE(unbound_at,now()) ELSE unbound_at END,
    delivery_checks=CASE WHEN has_email AND email_log_id IS NOT NULL THEN LEAST(delivery_checks+1,1000) ELSE delivery_checks END,
    delivery_status_at=CASE WHEN has_email AND (delivery_status IS NULL OR new_status IS DISTINCT FROM delivery_status) THEN now() ELSE delivery_status_at END,
    delivery_status=CASE WHEN has_email THEN new_status ELSE delivery_status END,
    not_found_at=CASE WHEN 'not_found'=ANY(reasons) THEN COALESCE(not_found_at,now()) ELSE not_found_at END,
    escalation_reasons=reasons,escalated_at=COALESCE(escalated_at,CASE WHEN cardinality(reasons)>0 THEN now() END)
    WHERE mode=p_mode AND subscription_id=p_subscription;
  RETURN CASE WHEN cardinality(reasons)>0 THEN 'escalated' ELSE 'pending' END;
END $$;

-- Records one attempt whose email log could NOT be read or parsed, apart from
-- "read fine, no email". Past the 12-hour deadline, with no candidate email on
-- record, it opens an 'unavailable_overdue' incident: an overdue reminder that
-- could not be verified is escalated, not silently retried forever.
CREATE FUNCTION public.job_loop_billing_trial_reminder_unavailable(p_mode text,p_subscription text,p_cause text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t jobvance_private.loop_subscription_trials; r jobvance_private.loop_trial_reminder_receipts; reasons text[];
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN('test','live') OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR p_cause IS NULL OR p_cause NOT IN('read_failed','invalid_response','incomplete') THEN
    RAISE EXCEPTION 'LOOP_BILLING_UNBOUND';
  END IF;
  SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE mode=p_mode AND subscription_id=p_subscription AND granted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_UNBOUND'; END IF;
  IF t.reminder_sent_at IS NOT NULL THEN RETURN 'pending'; END IF;
  INSERT INTO jobvance_private.loop_trial_reminder_receipts(mode,subscription_id) VALUES(p_mode,p_subscription) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM jobvance_private.loop_trial_reminder_receipts WHERE mode=p_mode AND subscription_id=p_subscription FOR UPDATE;
  reasons:=r.escalation_reasons;
  IF r.email_log_id IS NULL AND now()>=t.reminder_at+interval '12 hours' THEN reasons:=jobvance_private.loop_trial_reminder_reason(reasons,'unavailable_overdue'); END IF;
  UPDATE jobvance_private.loop_trial_reminder_receipts SET checks=LEAST(checks+1,1000),last_checked_at=now(),backoff_step=LEAST(backoff_step+1,4),
    unavailable_checks=LEAST(unavailable_checks+1,1000),unavailable_streak=LEAST(unavailable_streak+1,1000),
    first_unavailable_at=COALESCE(first_unavailable_at,now()),last_unavailable_at=now(),last_unavailable_cause=p_cause,
    unavailable_overdue_at=CASE WHEN 'unavailable_overdue'=ANY(reasons) THEN COALESCE(unavailable_overdue_at,now()) ELSE unavailable_overdue_at END,
    escalation_reasons=reasons,escalated_at=COALESCE(escalated_at,CASE WHEN cardinality(reasons)>0 THEN now() END)
    WHERE mode=p_mode AND subscription_id=p_subscription;
  RETURN CASE WHEN cardinality(reasons)>0 THEN 'escalated' ELSE 'pending' END;
END $$;

-- Database-side backstop that needs neither the edge function nor Dodo: a
-- reminder still owed whose email log has not been read since its 12-hour
-- deadline (plus an hour for the next sweep) gets an 'unavailable_overdue'
-- incident, so a dead scheduler or a long provider outage cannot make an
-- overdue trial vanish. It also covers a first charge that has already passed,
-- including one whose failure moved the subscription out of 'active'.
CREATE FUNCTION jobvance_private.loop_trial_reminder_flag_overdue() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE flagged integer;
BEGIN
  WITH overdue AS (
    SELECT t.mode,t.subscription_id
    FROM jobvance_private.loop_subscription_trials t
    JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND s.mode=t.mode
      AND jobvance_private.loop_trial_reminder_owed(t.first_charge_at,s.status,s.cancel_at_period_end,s.revoked)
    LEFT JOIN jobvance_private.loop_trial_reminder_receipts r ON r.mode=t.mode AND r.subscription_id=t.subscription_id
    WHERE t.granted AND t.reminder_sent_at IS NULL AND now()>=t.reminder_at+interval '13 hours' AND now()<t.first_charge_at+interval '30 days'
      AND r.email_log_id IS NULL AND (r.last_read_at IS NULL OR r.last_read_at<t.reminder_at+interval '12 hours')
  ), changed AS (
    INSERT INTO jobvance_private.loop_trial_reminder_receipts AS rc(mode,subscription_id,escalated_at,escalation_reasons,unavailable_overdue_at)
    SELECT mode,subscription_id,now(),ARRAY['unavailable_overdue'],now() FROM overdue
    ON CONFLICT (mode,subscription_id) DO UPDATE SET escalated_at=COALESCE(rc.escalated_at,now()),
      unavailable_overdue_at=COALESCE(rc.unavailable_overdue_at,now()),
      escalation_reasons=jobvance_private.loop_trial_reminder_reason(rc.escalation_reasons,'unavailable_overdue')
      WHERE NOT ('unavailable_overdue'=ANY(rc.escalation_reasons))
    RETURNING 1)
  SELECT count(*)::integer INTO flagged FROM changed;
  RETURN flagged;
END $$;

-- Support view: every trial with an open incident, until 30 days after its
-- first charge. 'reason' is the most serious open one (a delivery problem, then
-- not_found, unavailable_overdue, unbound); 'reasons' lists them all.
CREATE FUNCTION public.job_loop_billing_trial_reminders_escalated(p_mode text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',e.user_id,'subscriptionId',e.subscription_id,'firstChargeAt',e.first_charge_at,'charged',e.first_charge_at<=now(),
    'reason',CASE WHEN 'delivery_failed'=ANY(e.reasons) THEN 'delivery_failed' WHEN 'delivery_complained'=ANY(e.reasons) THEN 'delivery_complained'
      WHEN 'delivery_blocked'=ANY(e.reasons) THEN 'delivery_blocked' WHEN 'not_found'=ANY(e.reasons) THEN 'not_found'
      WHEN 'unavailable_overdue'=ANY(e.reasons) THEN 'unavailable_overdue' ELSE 'unbound' END,
    'reasons',to_jsonb(e.reasons),'escalatedAt',e.escalated_at,'emailStatus',e.delivery_status,'firstEmailStatus',e.first_email_status,
    'emailSentAt',e.email_created_at,'emailLogId',e.email_log_id,'candidates',e.candidate_count,'lastReadAt',e.last_read_at,
    'unavailableChecks',e.unavailable_checks,'unavailableStreak',e.unavailable_streak,'lastUnavailableCause',e.last_unavailable_cause,
    'subscriptionStatus',e.status,'cancelAtPeriodEnd',e.cancel_at_period_end,'revoked',e.revoked) ORDER BY e.first_charge_at,e.subscription_id),'[]'::jsonb)
  FROM (SELECT t.user_id,t.subscription_id,t.first_charge_at,r.escalation_reasons reasons,r.escalated_at,r.delivery_status,r.first_email_status,r.email_created_at,r.email_log_id,
      r.candidate_count,r.last_read_at,r.unavailable_checks,r.unavailable_streak,r.last_unavailable_cause,s.status,s.cancel_at_period_end,s.revoked
    FROM jobvance_private.loop_trial_reminder_receipts r
    JOIN jobvance_private.loop_subscription_trials t ON t.mode=r.mode AND t.subscription_id=r.subscription_id
    JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND s.mode=t.mode
    WHERE r.mode=p_mode AND cardinality(r.escalation_reasons)>0 AND t.reminder_sent_at IS NULL AND t.first_charge_at>now()-interval '30 days'
    ORDER BY t.first_charge_at,t.subscription_id LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)) e
$$;

-- Single-use, two-minute, mode-bound dispatch tickets. Only the definer
-- dispatch can mint one; a raw table insert cannot.
CREATE TABLE public.job_loop_trial_reminder_tickets (
  ticket uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK(mode IN('test','live')),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '2 minutes'),
  consumed_at timestamptz
);
ALTER TABLE public.job_loop_trial_reminder_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_loop_trial_reminder_tickets FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX job_loop_trial_reminder_ticket_expiry ON public.job_loop_trial_reminder_tickets(expires_at);

CREATE FUNCTION public.job_loop_billing_trial_reminder_consume_ticket(p_ticket uuid,p_mode text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE consumed uuid;
BEGIN
  UPDATE public.job_loop_trial_reminder_tickets SET consumed_at=clock_timestamp()
    WHERE ticket=p_ticket AND mode=p_mode AND consumed_at IS NULL AND expires_at>clock_timestamp()
    RETURNING ticket INTO consumed;
  RETURN consumed IS NOT NULL;
END $$;

-- Every 30 minutes: record overdue unverified reminders in the database, then
-- wake the billing function of each mode that has a trial to look at. Inert
-- while no trial is due (live trials are off).
CREATE FUNCTION public.job_loop_trial_reminder_dispatch() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; public_key text; m text; issued uuid; headers jsonb; woken integer:=0;
BEGIN
  PERFORM jobvance_private.loop_trial_reminder_flag_overdue();
  DELETE FROM public.job_loop_trial_reminder_tickets WHERE expires_at<now()-interval '1 day';
  SELECT api_origin,publishable_key INTO origin,public_key FROM public.job_loop_scheduler_config WHERE singleton;
  IF origin IS NULL OR origin !~ '^https://[a-z0-9]+\.supabase\.co$' THEN RETURN 0; END IF;
  FOREACH m IN ARRAY ARRAY['live','test'] LOOP
    IF EXISTS(SELECT 1 FROM jobvance_private.loop_trial_reminder_targets(m,1)) THEN
      INSERT INTO public.job_loop_trial_reminder_tickets(mode) VALUES(m) RETURNING ticket INTO issued;
      headers:=jsonb_build_object('Content-Type','application/json','x-trial-reminder-ticket',issued::text);
      IF public_key IS NOT NULL THEN headers:=headers||jsonb_build_object('apikey',public_key); END IF;
      PERFORM net.http_post(url:=origin||'/functions/v1/'||CASE m WHEN 'live' THEN 'job-loop-billing' ELSE 'job-loop-billing-test' END,
        headers:=headers,body:='{"action":"trial_reminders"}'::jsonb,timeout_milliseconds:=10000);
      woken:=woken+1;
    END IF;
  END LOOP;
  RETURN woken;
END $$;

REVOKE ALL ON FUNCTION jobvance_private.loop_email_delivery_rank(text),jobvance_private.loop_trial_reminder_reason(text[],text),
  jobvance_private.immutable_loop_trial_reminder_receipt(),jobvance_private.loop_trial_reminder_owed(timestamptz,text,boolean,boolean),
  jobvance_private.loop_trial_reminder_targets(text,integer),jobvance_private.loop_trial_reminder_flag_overdue() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(text,integer),
  public.job_loop_billing_trial_reminder_check(text,text,text,text,text,timestamptz,integer),
  public.job_loop_billing_trial_reminder_unavailable(text,text,text),
  public.job_loop_billing_trial_reminders_escalated(text,integer),
  public.job_loop_billing_trial_reminder_consume_ticket(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(text,integer),
  public.job_loop_billing_trial_reminder_check(text,text,text,text,text,timestamptz,integer),
  public.job_loop_billing_trial_reminder_unavailable(text,text,text),
  public.job_loop_billing_trial_reminders_escalated(text,integer),
  public.job_loop_billing_trial_reminder_consume_ticket(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.job_loop_trial_reminder_dispatch() FROM PUBLIC,anon,authenticated,service_role;

SELECT cron.schedule('jobvance-trial-reminder-check','*/30 * * * *','SELECT public.job_loop_trial_reminder_dispatch();');
COMMIT;
