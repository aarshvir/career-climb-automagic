import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAdminAuthority } from '@/lib/admin-authority';
import { AdminApiError, adminRange, callAdmin } from '@/lib/admin-api';
import type { AdminDashboard } from '@/lib/admin-dashboard';
import { GrowthSection, OperationsSection, OverviewSection, RevenueSection, TodaySection } from './sections';
import { MarketingSection, SupportSection } from './live-sections';
import { AcquisitionSection, JourneysSection, PersonDetail, UsersWithContacts, VisitDetail } from './analytics-sections';
import './admin-home.css';

type Section = 'overview' | 'today' | 'revenue' | 'growth' | 'marketing' | 'acquisition' | 'journeys' | 'users' | 'operations' | 'support';
const pages: Record<Section, { title: string; blurb: string; range: boolean }> = {
  overview: { title: 'Overview', blurb: 'Headline numbers for the selected range, compared with the range before it.', range: true },
  today: { title: 'Today', blurb: 'Today so far (UTC), compared with yesterday up to the same time.', range: false },
  revenue: { title: 'Revenue', blurb: 'Payments, subscriptions, paid places and anything that needs a refund check.', range: true },
  growth: { title: 'Growth', blurb: 'How new accounts move from sign-up to a first application, and who comes back.', range: true },
  marketing: { title: 'Meta ads', blurb: 'Meta ad spend and clicks, read straight from the ads account.', range: false },
  acquisition: { title: 'Acquisition', blurb: 'Visitors, where they come from, which pages they read and what they click. Staff and test accounts are left out.', range: true },
  journeys: { title: 'Journeys', blurb: 'Every visit: who it was, where they came from, the pages they saw and how long they stayed. Open one to see each step.', range: true },
  users: { title: 'Users', blurb: 'Every real account, newest first. Test accounts are left out.', range: false },
  operations: { title: 'Ops & health', blurb: 'Anything stuck, failed or waiting on you.', range: false },
  support: { title: 'Support', blurb: 'Messages from signed-in users and visitors. Reply or close them here.', range: false },
};
const nav: [string, [Section, string][]][] = [
  ['Product', [['today', 'Today'], ['overview', 'Overview'], ['revenue', 'Revenue'], ['growth', 'Growth']]],
  ['Marketing', [['acquisition', 'Acquisition'], ['journeys', 'Journeys'], ['marketing', 'Meta ads']]],
  ['People & ops', [['users', 'Users'], ['operations', 'Ops'], ['support', 'Support']]],
];
const sectionOf = (value: string | undefined): Section | null => value === undefined ? 'overview' : Object.prototype.hasOwnProperty.call(pages, value) && value !== 'overview' ? value as Section : null;
const href = (section: Section) => section === 'overview' ? '/admin' : `/admin/${section}`;

export default function AdminHome() {
  const { userId, authority, authLoading, isCurrent } = useAdminAuthority();
  const { section: rawSection, id } = useParams();
  const section = sectionOf(rawSection);
  // Visits and people have their own page under Journeys and Users.
  const detail = id && (section === 'journeys' || section === 'users') ? id : null;
  const [params, setParams] = useSearchParams();
  const days = adminRange(params.get('days'));
  const [data, setData] = useState<{ authority: string; days: number; dashboard: AdminDashboard } | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const dashboard = authority && data?.authority === authority && data.days === days && !['forbidden', 'unauthenticated'].includes(error?.kind) ? data.dashboard : null;
  const accessFailure = useCallback((reason: { kind?: string; message: string }) => {
    if (reason.kind === 'forbidden' || reason.kind === 'unauthenticated') {
      generation.current += 1;
      setData(null); setLoading(false); setError(new AdminApiError(reason.kind, reason.message));
    }
  }, []);

  useEffect(() => {
    const revision = ++generation.current;
    setError(null); setLoading(true);
    if (authLoading || !userId || !authority) { setData(null); return; }
    void callAdmin(userId, { action: 'dashboard', days }).then(result => {
      if (generation.current === revision && isCurrent(authority) && result.dashboard) setData({ authority, days, dashboard: result.dashboard });
    }).catch(reason => {
      if (generation.current === revision && isCurrent(authority)) {
        if (reason instanceof AdminApiError && ['forbidden','unauthenticated'].includes(reason.kind)) setData(null);
        setError(reason instanceof AdminApiError ? reason : new AdminApiError('unavailable', 'The admin could not be loaded. Try refreshing.'));
      }
    }).finally(() => { if (generation.current === revision) setLoading(false); });
    return () => { generation.current += 1; };
  }, [userId, authority, authLoading, days, refresh, isCurrent]);
  // The Today page keeps itself current while it is open.
  useEffect(() => {
    if (section !== 'today') return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [section]);
  useEffect(() => { window.scrollTo(0, 0); }, [section, id]);
  const ready = !!dashboard;
  // On phones the menu scrolls sideways; keep the current page in view.
  useEffect(() => { navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [section, ready]);

  if (!section) return <Navigate to="/admin" replace />;
  if (id && !detail) return <Navigate to={href(section)} replace />;
  const page = detail ? { title: section === 'journeys' ? 'Visit' : 'Person', blurb: section === 'journeys' ? 'One visit, step by step: each page, how long it was on screen, and every click.' : 'Their details, where they first came from, and every visit since.', range: false } : pages[section];
  const query = days === 30 ? '' : `?days=${days}`;
  const returnPath = `${href(section)}${query}`;
  const denied = error?.kind === 'forbidden';
  const signedOut = !authLoading && (!userId || error?.kind === 'unauthenticated');

  return <div className="vh-admin">
    <Helmet><title>{`${page.title} · Jobvance Admin`}</title><meta name="robots" content="noindex, nofollow, noarchive" /><meta name="googlebot" content="noindex, nofollow, noarchive" /></Helmet>
    {signedOut && <Navigate to={`/auth?next=${encodeURIComponent(returnPath)}`} replace />}
    <a href="#vh-content" className="vh-skip">Skip to content</a>
    <header className="vh-top">
      <Link to="/admin" className="vh-brand">Jobvance Admin</Link>
      {ready && <nav ref={navRef} className="vh-nav" aria-label="Admin pages">{nav.map(([group, links], index) => <div className="vh-nav-group" key={group}>
        {index > 0 && <span className="vh-nav-sep" aria-hidden="true">|</span>}
        <span className="vh-nav-label">{group}</span>
        {links.map(([target, label]) => <Link key={target} to={`${href(target)}${query}`} aria-current={target === section ? 'page' : undefined}>{label}</Link>)}
      </div>)}<div className="vh-nav-group"><span className="vh-nav-sep" aria-hidden="true">|</span><Link to="/admin-original">Original admin</Link></div></nav>}
      <Link to="/" className="vh-back">← Back to site</Link>
    </header>
    <main id="vh-content" className="vh-main" tabIndex={-1}>
      {denied ? <div className="vh-state" role="alert"><h1>No admin access</h1><p>This account isn't on the admin list, so nothing private was opened.</p><Link to="/dashboard" className="vh-link">Go to your Jobvance dashboard →</Link></div> : <>
        <div className="vh-head">
          <div><h1>{page.title}</h1><p>{page.blurb}{section === 'today' && dashboard && <> As of {dashboard.generatedAt.slice(11, 16)} UTC · refreshes every minute.</>}</p></div>
          <div className="vh-controls">
            {page.range && <div className="vh-range" role="group" aria-label="Date range">{([7, 30, 90] as const).map(range => <button type="button" key={range} aria-pressed={days === range} disabled={loading && !dashboard} onClick={() => setParams(range === 30 ? {} : { days: String(range) })}>{range}d</button>)}</div>}
            <button type="button" className="vh-icon-btn" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh">{loading ? 'Loading…' : '↻ Refresh'}</button>
          </div>
        </div>
        {error && !denied && error.kind !== 'unauthenticated' && <div className="vh-callout vh-callout--bad" role="alert"><strong>Couldn't load the latest figures.</strong> {error.message} {dashboard && 'The figures below are from the last successful load.'}</div>}
        {!dashboard && (authLoading || loading) && <div className="vh-grid" role="status" aria-label="Loading">{Array.from({ length: 6 }, (_, index) => <div key={index} className="vh-skeleton" />)}</div>}
        {dashboard && <>
          {section === 'overview' && <OverviewSection data={dashboard} />}
          {section === 'today' && <TodaySection data={dashboard} />}
          {section === 'revenue' && <RevenueSection data={dashboard} />}
          {section === 'growth' && <GrowthSection data={dashboard} />}
          {section === 'marketing' && userId && <MarketingSection key={authority} userId={userId} refresh={refresh} onAccessFailure={accessFailure} />}
          {section === 'acquisition' && userId && <AcquisitionSection key={authority} userId={userId} days={days} refresh={refresh} onAccessFailure={accessFailure} />}
          {section === 'journeys' && userId && (detail ? <VisitDetail key={`${authority}${detail}`} userId={userId} id={detail} refresh={refresh} onAccessFailure={accessFailure} /> : <JourneysSection key={authority} userId={userId} days={days} refresh={refresh} onAccessFailure={accessFailure} />)}
          {section === 'users' && userId && (detail ? <PersonDetail key={`${authority}${detail}`} userId={userId} id={detail} refresh={refresh} onAccessFailure={accessFailure} /> : <UsersWithContacts key={authority} userId={userId} data={dashboard} refresh={refresh} onAccessFailure={accessFailure} />)}
          {section === 'operations' && <OperationsSection data={dashboard} />}
          {section === 'support' && userId && <SupportSection key={authority} userId={userId} data={dashboard} refresh={refresh} onAccessFailure={accessFailure} onSaved={() => setRefresh(value => value + 1)} />}
          <ul className="vh-note">{dashboard.coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </>}
      </>}
    </main>
  </div>;
}
