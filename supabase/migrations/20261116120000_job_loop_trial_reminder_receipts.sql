BEGIN;

-- Resolves TODO(trial-reminder-email) in 20261111120000_job_loop_seven_day_trial.
--
-- Jobvance has no transactional mail provider, and it does not add one here.
-- Dodo Payments, the merchant of record, already sends its own "Subscription
-- Trial Ending" customer email about two days before a trial's first charge
-- (Settings > Communication > Customer Emails, on by default; test-mode emails
-- are delivered too, with a [TEST MODE] subject). Sending a second Jobvance
-- email would duplicate it.
--
-- So the reminder is CONFIRMED, not sent: a sweep reads the customer's Dodo
-- email log (GET /customers/{customer_id}/emails) and sets the one-way
-- reminder_sent_at marker only from a sent or delivered trial-ending email
-- created in the three days before the first charge. A failed, spam-flagged
-- or blocked email, or no email twelve hours after reminder_at, is escalated
-- for support. Nothing here charges, cancels or emails anyone.

CREATE TABLE jobvance_private.loop_trial_reminder_receipts (
  mode text NOT NULL CHECK(mode IN('test','live')),
  subscription_id text NOT NULL CHECK(subscription_id ~ '^sub_[A-Za-z0-9_-]{1,100}$'),
  checks integer NOT NULL DEFAULT 0 CHECK(checks BETWEEN 0 AND 1000),
  last_checked_at timestamptz,
  -- The provider's email log entry that proves (or failed) the reminder.
  email_log_id text CHECK(email_log_id IS NULL OR email_log_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  email_type text CHECK(email_type IS NULL OR email_type ~ '^[a-z0-9_.-]{1,100}$'),
  email_status text CHECK(email_status IS NULL OR email_status IN('sent','delivered','failed','complained','blocked')),
  email_created_at timestamptz,
  confirmed_at timestamptz,
  escalated_at timestamptz,
  escalation_reason text CHECK(escalation_reason IS NULL OR escalation_reason IN('not_found','failed','complained','blocked')),
  PRIMARY KEY(mode,subscription_id),
  CHECK(confirmed_at IS NULL OR (email_log_id IS NOT NULL AND email_status IN('sent','delivered') AND email_created_at IS NOT NULL)),
  CHECK((escalated_at IS NULL)=(escalation_reason IS NULL))
);
ALTER TABLE jobvance_private.loop_trial_reminder_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jobvance_private.loop_trial_reminder_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Due, unconfirmed reminders of live (active, not cancelling, not revoked)
-- granted trials, with the provider customer whose email log proves them.
-- A row checked in the last 20 minutes waits for the next sweep.
CREATE FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(p_mode text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subscriptionId',d.subscription_id,'customerId',d.customer_id,'reminderAt',d.reminder_at,
    'firstChargeAt',d.first_charge_at,'checks',d.checks) ORDER BY d.reminder_at),'[]'::jsonb)
  FROM (SELECT t.subscription_id,s.customer_id,t.reminder_at,t.first_charge_at,COALESCE(r.checks,0) checks
    FROM jobvance_private.loop_subscription_trials t
    JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND s.mode=t.mode
      AND s.status='active' AND NOT s.cancel_at_period_end AND NOT s.revoked
    LEFT JOIN jobvance_private.loop_trial_reminder_receipts r ON r.mode=t.mode AND r.subscription_id=t.subscription_id
    WHERE t.mode=p_mode AND t.granted AND t.reminder_sent_at IS NULL AND t.reminder_at<=now() AND t.first_charge_at>now()
      AND (r.last_checked_at IS NULL OR r.last_checked_at<now()-interval '20 minutes')
    ORDER BY t.reminder_at LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)) d
$$;

-- Records one email-log check. With a sent/delivered trial-ending email inside
-- the window it confirms the reminder and sets reminder_sent_at to the email's
-- own creation time. Returns confirmed, pending or escalated.
CREATE FUNCTION public.job_loop_billing_trial_reminder_check(p_mode text,p_subscription text,p_email_log_id text,p_email_type text,p_email_status text,p_email_created_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t jobvance_private.loop_subscription_trials; has_email boolean:=p_email_log_id IS NOT NULL; late boolean; reason text;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN('test','live') OR p_subscription IS NULL OR p_subscription !~ '^sub_[A-Za-z0-9_-]{1,100}$'
    OR (has_email AND (p_email_type IS NULL OR p_email_status IS NULL OR p_email_created_at IS NULL OR NOT isfinite(p_email_created_at)))
    OR (NOT has_email AND (p_email_type IS NOT NULL OR p_email_status IS NOT NULL OR p_email_created_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'LOOP_BILLING_UNBOUND';
  END IF;
  SELECT * INTO t FROM jobvance_private.loop_subscription_trials WHERE mode=p_mode AND subscription_id=p_subscription AND granted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOOP_BILLING_UNBOUND'; END IF;
  IF t.reminder_sent_at IS NOT NULL THEN RETURN 'confirmed'; END IF;
  -- An email outside the three days before the first charge is not this reminder.
  IF has_email AND (p_email_created_at<t.first_charge_at-interval '3 days' OR p_email_created_at>=t.first_charge_at) THEN
    RAISE EXCEPTION 'LOOP_BILLING_UNBOUND';
  END IF;
  INSERT INTO jobvance_private.loop_trial_reminder_receipts(mode,subscription_id) VALUES(p_mode,p_subscription) ON CONFLICT DO NOTHING;
  IF has_email AND p_email_status IN('sent','delivered') THEN
    UPDATE jobvance_private.loop_trial_reminder_receipts SET checks=LEAST(checks+1,1000),last_checked_at=now(),email_log_id=p_email_log_id,
      email_type=p_email_type,email_status=p_email_status,email_created_at=p_email_created_at,confirmed_at=now()
      WHERE mode=p_mode AND subscription_id=p_subscription;
    UPDATE jobvance_private.loop_subscription_trials SET reminder_sent_at=p_email_created_at
      WHERE mode=p_mode AND subscription_id=p_subscription AND reminder_sent_at IS NULL;
    RETURN 'confirmed';
  END IF;
  late:=now()>=t.reminder_at+interval '12 hours';
  reason:=CASE WHEN has_email THEN p_email_status WHEN late THEN 'not_found' END;
  UPDATE jobvance_private.loop_trial_reminder_receipts SET checks=LEAST(checks+1,1000),last_checked_at=now(),
    email_log_id=COALESCE(p_email_log_id,email_log_id),email_type=COALESCE(p_email_type,email_type),
    email_status=COALESCE(p_email_status,email_status),email_created_at=COALESCE(p_email_created_at,email_created_at),
    escalated_at=CASE WHEN escalated_at IS NULL AND reason IS NOT NULL THEN now() ELSE escalated_at END,
    escalation_reason=CASE WHEN escalated_at IS NULL AND reason IS NOT NULL THEN reason ELSE escalation_reason END
    WHERE mode=p_mode AND subscription_id=p_subscription;
  RETURN CASE WHEN reason IS NULL THEN 'pending' ELSE 'escalated' END;
END $$;

-- Support view: trials whose reminder could not be confirmed, until a day
-- after their first charge.
CREATE FUNCTION public.job_loop_billing_trial_reminders_escalated(p_mode text,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',e.user_id,'subscriptionId',e.subscription_id,'firstChargeAt',e.first_charge_at,
    'reason',e.escalation_reason,'escalatedAt',e.escalated_at,'emailStatus',e.email_status) ORDER BY e.first_charge_at),'[]'::jsonb)
  FROM (SELECT t.user_id,t.subscription_id,t.first_charge_at,r.escalation_reason,r.escalated_at,r.email_status
    FROM jobvance_private.loop_trial_reminder_receipts r
    JOIN jobvance_private.loop_subscription_trials t ON t.mode=r.mode AND t.subscription_id=r.subscription_id
    WHERE r.mode=p_mode AND r.escalated_at IS NOT NULL AND t.reminder_sent_at IS NULL AND t.first_charge_at>now()-interval '1 day'
    ORDER BY t.first_charge_at LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)) e
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

-- Every 30 minutes: wake the billing function of each mode that has a due,
-- unconfirmed reminder. Inert while no trial is due (live trials are off).
CREATE FUNCTION public.job_loop_trial_reminder_dispatch() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; public_key text; m text; issued uuid; headers jsonb; woken integer:=0;
BEGIN
  DELETE FROM public.job_loop_trial_reminder_tickets WHERE expires_at<now()-interval '1 day';
  SELECT api_origin,publishable_key INTO origin,public_key FROM public.job_loop_scheduler_config WHERE singleton;
  IF origin IS NULL OR origin !~ '^https://[a-z0-9]+\.supabase\.co$' THEN RETURN 0; END IF;
  FOREACH m IN ARRAY ARRAY['live','test'] LOOP
    IF EXISTS(SELECT 1 FROM jobvance_private.loop_subscription_trials t
      JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=t.subscription_id AND s.mode=t.mode
        AND s.status='active' AND NOT s.cancel_at_period_end AND NOT s.revoked
      WHERE t.mode=m AND t.granted AND t.reminder_sent_at IS NULL AND t.reminder_at<=now() AND t.first_charge_at>now()) THEN
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

REVOKE ALL ON FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(text,integer),
  public.job_loop_billing_trial_reminder_check(text,text,text,text,text,timestamptz),
  public.job_loop_billing_trial_reminders_escalated(text,integer),
  public.job_loop_billing_trial_reminder_consume_ticket(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.job_loop_billing_trial_reminders_unconfirmed(text,integer),
  public.job_loop_billing_trial_reminder_check(text,text,text,text,text,timestamptz),
  public.job_loop_billing_trial_reminders_escalated(text,integer),
  public.job_loop_billing_trial_reminder_consume_ticket(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.job_loop_trial_reminder_dispatch() FROM PUBLIC,anon,authenticated,service_role;

SELECT cron.schedule('jobvance-trial-reminder-check','*/30 * * * *','SELECT public.job_loop_trial_reminder_dispatch();');
COMMIT;
