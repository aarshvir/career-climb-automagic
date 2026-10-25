BEGIN;

-- The /admin dashboard. Read-only: it changes nothing and returns no CV text, messages or card data.
-- Every figure leaves out QA fixtures, reserved test domains and admin staff, except place
-- occupancy, which counts every holder because test and staff accounts use real places.

CREATE FUNCTION public.jobvance_admin_people() RETURNS TABLE(id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT u.id,u.email::text,u.created_at,u.last_sign_in_at,
    CASE WHEN EXISTS(SELECT 1 FROM public.jobvance_admin_members m WHERE m.user_id=u.id) THEN 'staff'
      WHEN COALESCE(u.raw_user_meta_data->>'qa_fixture','false')='true' OR lower(COALESCE(u.email,'')) ~ '@(example\.(com|org|net|test)|test\.invalid)$' THEN 'test'
      ELSE 'real' END
  FROM auth.users u
$$;

-- One row per live payment from both ledgers. Refunded payments count as zero dollars.
-- Non-USD Job Loop charges use Dodo's USD accounting amount, or the plan's USD list price when absent.
CREATE FUNCTION public.jobvance_admin_payments() RETURNS TABLE(user_id uuid,at timestamptz,plan_label text,amount_minor bigint,currency text,usd numeric,refunded boolean,usd_exact boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.user_id,p.starts_at,
    CASE s.plan WHEN 'weekly' THEN 'Job Loop Starter' WHEN 'three_weekly' THEN 'Job Loop Advanced' ELSE 'Job Loop Pro' END,
    p.amount,p.currency,
    CASE WHEN p.revoked THEN 0 ELSE round(CASE WHEN p.currency='USD' THEN p.amount ELSE COALESCE(a.accounting_amount_minor,CASE s.plan WHEN 'weekly' THEN 2900 WHEN 'three_weekly' THEN 5900 ELSE 9900 END) END/100.0,2) END,
    p.revoked,p.currency='USD' OR a.payment_id IS NOT NULL
  FROM jobvance_private.loop_subscription_periods p
  JOIN jobvance_private.loop_subscriptions s ON s.subscription_id=p.subscription_id
  LEFT JOIN jobvance_private.loop_provider_accounting a ON a.mode=p.mode AND a.payment_id=p.payment_id
  WHERE p.mode='live'
  UNION ALL
  SELECT o.user_id,COALESCE(b.paid_at,b.created_at,o.created_at),COALESCE(pp.name||' pass','CV credits'),o.amount::bigint,'USD',
    round(greatest(0,o.amount-CASE WHEN COALESCE(b.refund_amount,0)>0 THEN b.refund_amount WHEN o.status='refunded' THEN o.amount ELSE 0 END)/100.0,2),
    o.status='refunded' OR COALESCE(b.refund_amount,0)>0,true
  FROM public.billing_orders o
  LEFT JOIN public.billing_payments b ON b.payment_intent=o.payment_intent
  LEFT JOIN public.jobvance_pass_plans pp ON pp.plan=o.plan
  WHERE o.billing_mode='live' AND o.status IN('paid','refunded')
$$;

CREATE FUNCTION public.jobvance_admin_email(p_email text,p_full boolean) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN p_email IS NULL THEN '(no email)' WHEN p_full THEN p_email ELSE left(split_part(p_email,'@',1),1)||'***@'||split_part(p_email,'@',2) END
$$;

CREATE FUNCTION public.jobvance_admin_dashboard(p_actor uuid,p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
  actor_role text; full_email boolean; ending timestamptz:=now(); starting timestamptz; earlier timestamptz;
  midnight timestamptz:=date_trunc('day',now()); month_key text:=to_char(now(),'YYYY-MM');
  sched public.job_loop_scheduler_config; cfg public.jobvance_admin_config;
  coverage_json jsonb; today_json jsonb; kpis_json jsonb; daily_json jsonb; funnel_json jsonb; cohorts_json jsonb;
  revenue_json jsonb; users_json jsonb; ops_json jsonb; support_json jsonb; notes jsonb;
  real_users bigint; test_users bigint; staff_users bigint; pilot_used bigint; pilot_other bigint; approximate bigint;
BEGIN
  actor_role:=public.jobvance_assert_admin(p_actor);
  IF p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'ADMIN_INPUT_INVALID'; END IF;
  full_email:=actor_role='owner';
  starting:=ending-make_interval(days=>p_days); earlier:=starting-make_interval(days=>p_days);
  SELECT * INTO sched FROM public.job_loop_scheduler_config WHERE singleton;
  SELECT * INTO cfg FROM public.jobvance_admin_config WHERE singleton;

  SELECT count(*) FILTER(WHERE kind='real'),count(*) FILTER(WHERE kind='test'),count(*) FILTER(WHERE kind='staff') INTO real_users,test_users,staff_users FROM public.jobvance_admin_people();
  SELECT count(*),count(*) FILTER(WHERE p.kind<>'real') INTO pilot_used,pilot_other FROM public.job_loop_pilot_users u JOIN public.jobvance_admin_people() p ON p.id=u.user_id WHERE u.active;
  SELECT count(*) FILTER(WHERE NOT x.usd_exact) INTO approximate FROM public.jobvance_admin_payments() x JOIN public.jobvance_admin_people() p ON p.id=x.user_id AND p.kind='real';

  -- Today so far against yesterday up to the same clock time.
  WITH customers AS (SELECT id,created_at FROM public.jobvance_admin_people() WHERE kind='real'),
  pay AS (SELECT x.* FROM public.jobvance_admin_payments() x JOIN customers r ON r.id=x.user_id WHERE NOT x.refunded),
  tailor AS (SELECT t.created_at AS at FROM public.jobvance_tailor_usage t WHERE t.status='settled' AND (t.user_id IS NULL OR t.user_id IN(SELECT id FROM customers))),
  runs AS (SELECT x.finished_at AS at FROM public.job_loop_runs x JOIN customers r ON r.id=x.user_id WHERE x.status IN('completed','partial')),
  support AS (SELECT q.created_at AS at FROM public.job_loop_support_requests q JOIN public.jobvance_admin_people() p ON p.id=q.user_id AND p.kind<>'test' UNION ALL SELECT created_at FROM public.jobvance_guest_support_requests),
  spans AS (SELECT midnight AS a,ending AS b,'today' AS k UNION ALL SELECT midnight-interval '1 day',ending-interval '1 day','yesterday'),
  figures AS (SELECT sp.k,
    (SELECT count(*) FROM customers WHERE created_at>=sp.a AND created_at<sp.b) AS signups,
    (SELECT count(*) FROM tailor WHERE at>=sp.a AND at<sp.b) AS tailorings,
    (SELECT count(*) FROM runs WHERE at>=sp.a AND at<sp.b) AS runs,
    (SELECT count(*) FROM pay WHERE at>=sp.a AND at<sp.b) AS orders,
    (SELECT COALESCE(sum(usd),0) FROM pay WHERE at>=sp.a AND at<sp.b) AS revenue,
    (SELECT count(*) FROM support WHERE at>=sp.a AND at<sp.b) AS messages
    FROM spans sp)
  SELECT jsonb_build_array(
    jsonb_build_object('key','signups','label','New accounts','today',t.signups,'yesterday',y.signups,'kind','count'),
    jsonb_build_object('key','cv_checks','label','CV tailorings','today',t.tailorings,'yesterday',y.tailorings,'kind','count'),
    jsonb_build_object('key','runs','label','Job Loop runs finished','today',t.runs,'yesterday',y.runs,'kind','count'),
    jsonb_build_object('key','paid_orders','label','Paid orders','today',t.orders,'yesterday',y.orders,'kind','count'),
    jsonb_build_object('key','revenue','label','Revenue','today',t.revenue,'yesterday',y.revenue,'kind','usd'),
    jsonb_build_object('key','support','label','Support messages','today',t.messages,'yesterday',y.messages,'kind','count'))
  INTO today_json FROM figures t, figures y WHERE t.k='today' AND y.k='yesterday';

  -- Headline figures for this window and the window of the same length before it.
  WITH customers AS (SELECT id,created_at FROM public.jobvance_admin_people() WHERE kind='real'),
  pay AS (SELECT x.* FROM public.jobvance_admin_payments() x JOIN customers r ON r.id=x.user_id),
  engaged AS (SELECT r.id,r.created_at,
    EXISTS(SELECT 1 FROM public.jobvance_tailor_usage t WHERE t.user_id=r.id AND t.status='settled') OR EXISTS(SELECT 1 FROM public.cv_checks v WHERE v.user_id=r.id)
      OR EXISTS(SELECT 1 FROM public.job_loop_records j WHERE j.user_id=r.id AND j.data->'profile' IS NOT NULL AND j.data->'profile'<>'null'::jsonb)
      OR EXISTS(SELECT 1 FROM public.job_loop_runs x WHERE x.user_id=r.id) AS tried,
    EXISTS(SELECT 1 FROM pay WHERE pay.user_id=r.id AND NOT pay.refunded) AS paid FROM customers r),
  spans AS (SELECT starting AS a,ending AS b,'now' AS k UNION ALL SELECT earlier,starting,'before'),
  figures AS (SELECT sp.k,
    (SELECT count(*) FROM customers WHERE created_at>=sp.a AND created_at<sp.b) AS signups,
    (SELECT count(*) FROM engaged WHERE tried AND created_at>=sp.a AND created_at<sp.b) AS tried,
    (SELECT count(*) FROM engaged WHERE paid AND created_at>=sp.a AND created_at<sp.b) AS payers,
    (SELECT count(*) FROM public.jobvance_tailor_usage t WHERE t.status='settled' AND t.created_at>=sp.a AND t.created_at<sp.b AND (t.user_id IS NULL OR t.user_id IN(SELECT id FROM customers))) AS tailorings,
    (SELECT count(*) FROM public.job_loop_runs x JOIN customers r ON r.id=x.user_id WHERE x.status IN('completed','partial') AND x.finished_at>=sp.a AND x.finished_at<sp.b) AS runs,
    (SELECT count(*) FROM pay WHERE NOT refunded AND at>=sp.a AND at<sp.b) AS orders,
    (SELECT COALESCE(sum(usd),0) FROM pay WHERE at>=sp.a AND at<sp.b) AS revenue
    FROM spans sp)
  SELECT jsonb_build_array(
    jsonb_build_object('key','signups','label','New accounts','current',n.signups,'previous',b.signups,'kind','count','help','Real people who created an account.'),
    jsonb_build_object('key','activated','label','Tried Jobvance','current',n.tried,'previous',b.tried,'kind','count','help',
      CASE WHEN n.signups>0 THEN round(n.tried*100.0/n.signups)||'% of new accounts tailored a CV or used Job Loop.' ELSE 'New accounts that tailored a CV or used Job Loop.' END),
    jsonb_build_object('key','cv_checks','label','CV tailorings','current',n.tailorings,'previous',b.tailorings,'kind','count','help','AI-tailored CVs, including visitors without an account.'),
    jsonb_build_object('key','runs','label','Job Loop runs','current',n.runs,'previous',b.runs,'kind','count','help','Runs that finished, fully or partly.'),
    jsonb_build_object('key','paid_orders','label','Paid orders','current',n.orders,'previous',b.orders,'kind','count','help','Job Loop subscription payments and CV passes, not counting refunds.'),
    jsonb_build_object('key','revenue','label','Revenue','current',n.revenue,'previous',b.revenue,'kind','usd','help','After refunds, in US dollars.'),
    jsonb_build_object('key','new_payers','label','New accounts that paid','current',n.payers,'previous',b.payers,'kind','count','help',
      CASE WHEN n.signups>0 THEN round(n.payers*100.0/n.signups,1)||'% of new accounts in this range have paid.' ELSE 'New accounts that have paid for anything.' END))
  INTO kpis_json FROM figures n, figures b WHERE n.k='now' AND b.k='before';

  -- One row per UTC day, ending today.
  WITH customers AS (SELECT id,created_at FROM public.jobvance_admin_people() WHERE kind='real'),
  pay AS (SELECT x.* FROM public.jobvance_admin_payments() x JOIN customers r ON r.id=x.user_id),
  days AS (SELECT generate_series(midnight-make_interval(days=>p_days-1),midnight,interval '1 day') AS d)
  SELECT jsonb_agg(jsonb_build_object('day',to_char(d,'YYYY-MM-DD'),
    'signups',(SELECT count(*) FROM customers WHERE created_at>=d AND created_at<d+interval '1 day'),
    'cvChecks',(SELECT count(*) FROM public.jobvance_tailor_usage t WHERE t.status='settled' AND t.created_at>=d AND t.created_at<d+interval '1 day' AND (t.user_id IS NULL OR t.user_id IN(SELECT id FROM customers))),
    'runs',(SELECT count(*) FROM public.job_loop_runs x JOIN customers r ON r.id=x.user_id WHERE x.status IN('completed','partial') AND x.finished_at>=d AND x.finished_at<d+interval '1 day'),
    'paidOrders',(SELECT count(*) FROM pay WHERE NOT refunded AND at>=d AND at<d+interval '1 day'),
    'revenueUsd',(SELECT COALESCE(sum(usd),0) FROM pay WHERE at>=d AND at<d+interval '1 day')) ORDER BY d) INTO daily_json FROM days;

  -- Accounts created in the window; each step counts people who also passed every earlier step.
  WITH cohort AS (SELECT p.id FROM public.jobvance_admin_people() p WHERE p.kind='real' AND p.created_at>=starting AND p.created_at<ending),
  stages AS (SELECT c.id,
    EXISTS(SELECT 1 FROM public.jobvance_tailor_usage t WHERE t.user_id=c.id AND t.status='settled') OR EXISTS(SELECT 1 FROM public.cv_checks v WHERE v.user_id=c.id)
      OR EXISTS(SELECT 1 FROM public.job_loop_records j WHERE j.user_id=c.id AND j.data->'profile' IS NOT NULL AND j.data->'profile'<>'null'::jsonb) AS tried,
    EXISTS(SELECT 1 FROM public.job_loop_records j WHERE j.user_id=c.id AND j.data->'profile' IS NOT NULL AND j.data->'profile'<>'null'::jsonb) AS profile,
    EXISTS(SELECT 1 FROM public.job_loop_runs x WHERE x.user_id=c.id AND x.status IN('completed','partial')) AS ran,
    EXISTS(SELECT 1 FROM public.job_loop_packets k WHERE k.user_id=c.id AND k.status='approved') AS approved
    FROM cohort c)
  SELECT jsonb_build_array(
    jsonb_build_object('label','Created an account','count',count(*),'hint','Real people only; test and staff accounts are left out.'),
    jsonb_build_object('label','Tried Jobvance','count',count(*) FILTER(WHERE tried),'hint','Tailored a CV or saved a Job Loop profile.'),
    jsonb_build_object('label','Saved a Job Loop profile','count',count(*) FILTER(WHERE tried AND profile),'hint','Finished the Job Loop set-up with their CV.'),
    jsonb_build_object('label','Got a Job Loop run','count',count(*) FILTER(WHERE tried AND profile AND ran),'hint','At least one search finished, fully or partly.'),
    jsonb_build_object('label','Approved an application pack','count',count(*) FILTER(WHERE tried AND profile AND ran AND approved),'hint','Approved at least one prepared CV and cover note.'))
  INTO funnel_json FROM stages;

  -- Weekly sign-up groups (Monday to Sunday, UTC) and the share active in each later week.
  WITH customers AS (SELECT id,created_at FROM public.jobvance_admin_people() WHERE kind='real'),
  weeks AS (SELECT generate_series(date_trunc('week',ending)-interval '7 weeks',date_trunc('week',ending),interval '1 week') AS w),
  acts AS (
    SELECT a.user_id,a.at FROM public.job_loop_activity a WHERE a.actor='candidate' AND a.at>=date_trunc('week',ending)-interval '7 weeks'
    UNION ALL SELECT t.user_id,t.created_at FROM public.jobvance_tailor_usage t WHERE t.user_id IS NOT NULL AND t.status='settled' AND t.created_at>=date_trunc('week',ending)-interval '7 weeks'
    UNION ALL SELECT v.user_id,v.created_at FROM public.cv_checks v WHERE v.created_at>=date_trunc('week',ending)-interval '7 weeks'
    UNION ALL SELECT x.user_id,x.created_at FROM public.job_loop_runs x WHERE COALESCE(x.consents->>'scheduled','false')<>'true' AND x.created_at>=date_trunc('week',ending)-interval '7 weeks')
  SELECT jsonb_agg(jsonb_build_object('week',to_char(w,'DD Mon'),'size',size,'weeks',shares) ORDER BY w DESC) INTO cohorts_json
  FROM weeks
  CROSS JOIN LATERAL (SELECT count(*) AS size FROM customers r WHERE r.created_at>=w AND r.created_at<w+interval '1 week') m
  CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(CASE WHEN m.size=0 THEN NULL ELSE round((SELECT count(DISTINCT r.id) FROM customers r JOIN acts a ON a.user_id=r.id
      WHERE r.created_at>=w AND r.created_at<w+interval '1 week' AND a.at>=w+make_interval(weeks=>i) AND a.at<w+make_interval(weeks=>i+1))*100.0/m.size) END ORDER BY i),'[]'::jsonb) AS shares
    FROM generate_series(0,least(7,floor(extract(epoch FROM ending-w)/604800)::int)) i) q;

  -- Revenue, subscriptions and places.
  WITH customers AS (SELECT id,email FROM public.jobvance_admin_people() WHERE kind='real'),
  pay AS (SELECT x.*,r.email FROM public.jobvance_admin_payments() x JOIN customers r ON r.id=x.user_id),
  subs AS (SELECT b.* FROM jobvance_private.loop_subscriptions b JOIN customers r ON r.id=b.user_id WHERE b.mode='live'),
  occupied AS (
    SELECT b.user_id FROM jobvance_private.loop_subscriptions b WHERE b.mode='live' AND NOT b.revoked
      AND ((b.status IN('active','cancelled') AND b.valid_until>ending) OR (b.status='past_due' AND b.grace_until>ending))
      AND (b.generation IS NULL OR EXISTS(SELECT 1 FROM public.job_loop_lifecycle l WHERE l.user_id=b.user_id AND l.generation=b.generation AND l.state='active'))
    UNION SELECT o.user_id FROM jobvance_private.loop_billing_orders o WHERE o.mode='live' AND o.state IN('creating','ready','uncertain') AND o.capacity_until>ending)
  SELECT jsonb_build_object(
    'allTimeUsd',(SELECT COALESCE(sum(usd),0) FROM pay),
    'allTimeOrders',(SELECT count(*) FROM pay WHERE NOT refunded),
    'payingCustomers',(SELECT count(DISTINCT user_id) FROM pay WHERE NOT refunded),
    'subscriptions',jsonb_build_object(
      'active',(SELECT count(*) FROM subs WHERE NOT revoked AND status='active' AND valid_until>ending AND NOT cancel_at_period_end),
      'cancelling',(SELECT count(*) FROM subs WHERE NOT revoked AND valid_until>ending AND (status='cancelled' OR status='active' AND cancel_at_period_end)),
      'pastDue',(SELECT count(*) FROM subs WHERE NOT revoked AND status IN('past_due','on_hold')),
      'ended',(SELECT count(*) FROM subs WHERE revoked OR status IN('expired','failed') OR status IN('active','cancelled') AND valid_until<=ending)),
    'places',jsonb_build_object('paidUsed',(SELECT count(DISTINCT user_id) FROM occupied),'paidCapacity',100,'pilotUsed',pilot_used,'pilotCapacity',10),
    'byPlan',(SELECT COALESCE(jsonb_agg(jsonb_build_object('label',plan_label,'usd',usd,'orders',orders) ORDER BY usd DESC),'[]'::jsonb) FROM (SELECT plan_label,sum(usd) AS usd,count(*) FILTER(WHERE NOT refunded) AS orders FROM pay GROUP BY plan_label) g),
    'byCurrency',(SELECT COALESCE(jsonb_agg(jsonb_build_object('currency',currency,'amountMinor',amount,'orders',orders) ORDER BY orders DESC,currency),'[]'::jsonb) FROM (SELECT currency,sum(amount_minor) AS amount,count(*) AS orders FROM pay WHERE NOT refunded GROUP BY currency) g),
    'recent',(SELECT COALESCE(jsonb_agg(jsonb_build_object('at',at,'userId',user_id,'emailDisplay',public.jobvance_admin_email(email,full_email),'plan',plan_label,'amountMinor',amount_minor,'currency',currency,'usd',CASE WHEN refunded THEN 0 ELSE usd END,'status',CASE WHEN refunded THEN 'refunded' ELSE 'paid' END) ORDER BY at DESC),'[]'::jsonb) FROM (SELECT * FROM pay ORDER BY at DESC LIMIT 50) r),
    'attention',jsonb_build_array(
      jsonb_build_object('key','unfulfilled','label','Paid but given no place','count',(SELECT count(*) FROM jobvance_private.loop_billing_pending_fulfillment WHERE mode='live' AND NOT resolved),'help','Someone paid for Job Loop when every paid place was taken. Give them a place or refund them in Dodo.'),
      jsonb_build_object('key','uncertain','label','Payments in an unknown state','count',(SELECT count(*) FROM jobvance_private.loop_billing_orders WHERE mode='live' AND state='uncertain')+(SELECT count(*) FROM jobvance_private.loop_billing_cancel_requests WHERE mode='live' AND state IN('uncertain','retryable')),'help','A checkout or cancellation whose result Dodo did not confirm. Check it in the Dodo dashboard.'),
      jsonb_build_object('key','past_due','label','Overdue subscriptions','count',(SELECT count(*) FROM subs WHERE NOT revoked AND status IN('past_due','on_hold')),'help','The renewal payment failed; Dodo keeps retrying during the grace period.'),
      jsonb_build_object('key','refunds','label','Refunds in this range','count',(SELECT count(*) FROM pay WHERE refunded AND at>=starting),'help','Refunded payments, counted by the date of the original payment.')))
  INTO revenue_json;

  -- Every real account, newest first.
  WITH people AS (SELECT * FROM public.jobvance_admin_people() WHERE kind='real' ORDER BY created_at DESC,id LIMIT 500),
  pay AS (SELECT x.user_id,sum(x.usd) AS usd FROM public.jobvance_admin_payments() x GROUP BY x.user_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',u.id,'emailDisplay',public.jobvance_admin_email(u.email,full_email),'joinedAt',u.created_at,'lastSignInAt',u.last_sign_in_at,
    'lastActiveAt',(SELECT max(at) FROM (
      SELECT max(a.at) AS at FROM public.job_loop_activity a WHERE a.user_id=u.id AND a.actor='candidate'
      UNION ALL SELECT max(t.created_at) FROM public.jobvance_tailor_usage t WHERE t.user_id=u.id
      UNION ALL SELECT max(v.created_at) FROM public.cv_checks v WHERE v.user_id=u.id
      UNION ALL SELECT max(x.created_at) FROM public.job_loop_runs x WHERE x.user_id=u.id AND COALESCE(x.consents->>'scheduled','false')<>'true') q),
    'plan',COALESCE(
      (SELECT CASE b.plan WHEN 'weekly' THEN 'Starter' WHEN 'three_weekly' THEN 'Advanced' ELSE 'Pro' END||CASE WHEN b.status='cancelled' OR b.cancel_at_period_end THEN ' · cancelling' WHEN b.status='past_due' THEN ' · overdue' ELSE '' END
        FROM jobvance_private.loop_subscriptions b WHERE b.user_id=u.id AND b.mode='live' AND NOT b.revoked AND ((b.status IN('active','cancelled') AND b.valid_until>ending) OR (b.status='past_due' AND b.grace_until>ending)) ORDER BY b.valid_until DESC LIMIT 1),
      (SELECT pp.name||' pass' FROM public.jobvance_passes ps JOIN public.jobvance_pass_plans pp ON pp.plan=ps.plan WHERE ps.user_id=u.id AND ps.billing_mode='live' AND ps.status='active' AND ps.expires_at>ending ORDER BY ps.expires_at DESC LIMIT 1)),
    'paidUsd',COALESCE((SELECT usd FROM pay WHERE pay.user_id=u.id),0),
    'cvChecks',(SELECT count(*) FROM public.jobvance_tailor_usage t WHERE t.user_id=u.id AND t.status='settled'),
    'runs',(SELECT count(*) FROM public.job_loop_runs x WHERE x.user_id=u.id AND x.status IN('completed','partial')),
    'failedRuns',(SELECT count(*) FROM public.job_loop_runs x WHERE x.user_id=u.id AND x.status='failed'),
    'hasProfile',EXISTS(SELECT 1 FROM public.job_loop_records j WHERE j.user_id=u.id AND j.data->'profile' IS NOT NULL AND j.data->'profile'<>'null'::jsonb),
    'pilot',EXISTS(SELECT 1 FROM public.job_loop_pilot_users l WHERE l.user_id=u.id AND l.active)
  ) ORDER BY u.created_at DESC,u.id),'[]'::jsonb) INTO users_json FROM people u;

  -- Anything failed, stuck or waiting.
  WITH people AS (SELECT * FROM public.jobvance_admin_people()),
  problems AS (
    SELECT 'Failed run' AS kind,x.finished_at AS at,x.user_id,COALESCE(left(x.data->'messages'->>-1,200),'The run stopped with an error.') AS detail
      FROM public.job_loop_runs x JOIN people p ON p.id=x.user_id AND p.kind='real' WHERE x.status='failed' AND x.finished_at>=ending-interval '7 days'
    UNION ALL SELECT 'Stuck run',x.created_at,x.user_id,'Still '||x.status||' after '||round(extract(epoch FROM ending-x.created_at)/60)||' minutes.'
      FROM public.job_loop_runs x JOIN people p ON p.id=x.user_id AND p.kind<>'test' WHERE x.status IN('queued','running') AND x.created_at<ending-interval '30 minutes'
    UNION ALL SELECT 'Paid, no place',f.created_at,f.user_id,'Paid for Job Loop while every paid place was taken.' FROM jobvance_private.loop_billing_pending_fulfillment f WHERE f.mode='live' AND NOT f.resolved
    UNION ALL SELECT 'Checkout unknown',o.created_at,o.user_id,'Dodo did not confirm this checkout.' FROM jobvance_private.loop_billing_orders o WHERE o.mode='live' AND o.state='uncertain'
    UNION ALL SELECT 'Cancellation unknown',q.created_at,q.user_id,'Dodo did not confirm this cancellation.' FROM jobvance_private.loop_billing_cancel_requests q WHERE q.mode='live' AND q.state IN('uncertain','retryable'))
  SELECT jsonb_build_object('schedulerEnabled',COALESCE(sched.enabled,false),'lastDispatchAt',sched.last_dispatch_at,
    'checks',jsonb_build_array(
      jsonb_build_object('key','failed_runs','label','Failed runs (7 days)','count',(SELECT count(*) FROM problems WHERE kind='Failed run'),'danger',true,'help','Job Loop runs that stopped with an error.'),
      jsonb_build_object('key','stuck_runs','label','Runs stuck over 30 min','count',(SELECT count(*) FROM problems WHERE kind='Stuck run'),'danger',true,'help','Started but not finished after 30 minutes.'),
      jsonb_build_object('key','overdue_schedules','label','Overdue schedules','count',(SELECT count(*) FROM public.job_loop_schedules WHERE status='active' AND next_run_at<ending-interval '20 minutes'),'danger',true,'help','Automatic searches more than 20 minutes late. Includes test accounts, which use the same worker.'),
      jsonb_build_object('key','unfulfilled','label','Paid but given no place','count',(SELECT count(*) FROM problems WHERE kind='Paid, no place'),'danger',true,'help','Give them a place or refund them in Dodo.'),
      jsonb_build_object('key','billing_unknown','label','Payments in an unknown state','count',(SELECT count(*) FROM problems WHERE kind IN('Checkout unknown','Cancellation unknown')),'danger',true,'help','Check these in the Dodo dashboard.'),
      jsonb_build_object('key','support_waiting','label','Messages waiting over a day','count',
        (SELECT count(*) FROM public.job_loop_support_requests q JOIN people p ON p.id=q.user_id AND p.kind<>'test' WHERE q.status<>'resolved' AND q.created_at<ending-interval '1 day')
        +(SELECT count(*) FROM public.jobvance_guest_support_requests g WHERE g.status<>'resolved' AND g.created_at<ending-interval '1 day'),'danger',true,'help','Support messages not closed within 24 hours.'),
      jsonb_build_object('key','partial_runs','label','Partial runs (7 days)','count',(SELECT count(*) FROM public.job_loop_runs x JOIN people p ON p.id=x.user_id AND p.kind='real' WHERE x.status='partial' AND x.finished_at>=ending-interval '7 days'),'danger',false,'help','Finished, but some job sources did not answer.'),
      jsonb_build_object('key','holding','label','Unpaid checkouts holding a place','count',(SELECT count(*) FROM jobvance_private.loop_billing_orders o WHERE o.mode='live' AND o.state IN('creating','ready','uncertain') AND o.capacity_until>ending
        AND NOT EXISTS(SELECT 1 FROM jobvance_private.loop_subscriptions b WHERE b.user_id=o.user_id AND b.request_id=o.request_id)),'danger',false,'help','Started checkouts keep a paid place for up to 4 days.')),
    'problems',(SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',r.kind,'at',r.at,'userId',r.user_id,'emailDisplay',public.jobvance_admin_email(p.email,full_email),'detail',r.detail) ORDER BY r.at DESC),'[]'::jsonb)
      FROM (SELECT * FROM problems ORDER BY at DESC LIMIT 50) r LEFT JOIN people p ON p.id=r.user_id),
    'budget',jsonb_build_object('month',month_key,'capUsd',COALESCE(cfg.monthly_cap_micros,0)/1000000.0,
      'committedUsd',COALESCE((SELECT committed_micros FROM public.job_loop_budget_months WHERE month=month_key),0)/1000000.0,
      'actualUsd',(COALESCE((SELECT sum(actual_micros) FROM public.job_loop_usage WHERE month=month_key AND status='settled'),0)
        +COALESCE((SELECT sum(actual_micros) FROM public.jobvance_admin_model_usage WHERE month=month_key AND status='settled'),0)
        +COALESCE((SELECT sum(actual_micros) FROM public.jobvance_tailor_usage WHERE month=month_key AND status='settled'),0))/1000000.0))
  INTO ops_json;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'emailDisplay',public.jobvance_admin_email(q.email,full_email),'category',q.category,'status',q.status,'createdAt',q.created_at,'version',q.admin_version) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
  INTO support_json FROM (SELECT r.id,r.user_id,r.category,r.status,r.created_at,r.admin_version,p.email FROM public.job_loop_support_requests r JOIN public.jobvance_admin_people() p ON p.id=r.user_id AND p.kind<>'test' ORDER BY r.created_at DESC,r.id LIMIT 100) q;

  notes:=jsonb_build_array(
    'Test accounts ('||test_users||') and admin staff ('||staff_users||') are left out of every figure except place occupancy.',
    'Times are UTC. Daily charts use calendar days; headline figures use the last '||p_days||' x 24 hours.',
    'Revenue is after refunds, in US dollars. Non-USD Job Loop payments use Dodo''s USD figure'||CASE WHEN approximate>0 THEN '; '||approximate||' payment(s) use the plan''s USD list price because Dodo has not reported one.' ELSE '.' END,
    'Visitors who do not sign up are not tracked yet, so there are no visit or traffic figures. Ad clicks and landing views are on the Marketing page.',
    'When someone deletes their Job Loop data, their runs and activity disappear from these figures.');
  IF pilot_other>0 THEN notes:=notes||to_jsonb(pilot_other||' of the '||pilot_used||' free Job Loop places are held by test or staff accounts.'); END IF;
  coverage_json:=jsonb_build_object('realUsers',real_users,'excludedTest',test_users,'excludedStaff',staff_users,'notes',notes);

  RETURN jsonb_build_object('generatedAt',ending,'window',jsonb_build_object('days',p_days,'start',starting,'end',ending),'coverage',coverage_json,
    'today',today_json,'kpis',kpis_json,'daily',COALESCE(daily_json,'[]'::jsonb),'funnel',funnel_json,'cohorts',COALESCE(cohorts_json,'[]'::jsonb),
    'revenue',revenue_json,'users',users_json,'ops',ops_json,'support',support_json);
END $$;

REVOKE ALL ON FUNCTION public.jobvance_admin_people(),public.jobvance_admin_payments(),public.jobvance_admin_email(text,boolean),public.jobvance_admin_dashboard(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobvance_admin_dashboard(uuid,integer) TO service_role;

COMMIT;
