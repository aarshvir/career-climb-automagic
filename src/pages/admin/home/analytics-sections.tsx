import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminApiError, callAdmin } from '@/lib/admin-api';
import type { AdminAction, AdminWindow } from '@/lib/admin-types';
import type { AdminAnalytics, AdminContacts, AdminPerson, AdminVisit } from '@/lib/admin-analytics';
import type { AdminDashboard } from '@/lib/admin-dashboard';
import { Bars, Delta, LineChart } from './charts';
import { Kpi, UsersSection } from './sections';
import { ago, day, seconds, usd } from './format';

type AccessFailure = (reason: { kind?: string; message: string }) => void;
interface Live { userId: string; refresh?: number; onAccessFailure?: AccessFailure }

/** Loads one admin read and reloads it on refresh. */
function useAdminRead<T>(userId: string, action: AdminAction, pick: (result: Record<string, unknown>) => unknown, refresh = 0, onAccessFailure?: AccessFailure) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string }>({ key: '', data: null, error: '' });
  const key = JSON.stringify(action);
  useEffect(() => {
    let alive = true;
    setState({ key, data: null, error: '' });
    void callAdmin(userId, JSON.parse(key) as AdminAction).then(result => { if (alive) setState({ key, data: (pick(result as Record<string, unknown>) ?? null) as T | null, error: '' }); })
      .catch(reason => { if (alive) { setState({ key, data: null, error: reason instanceof Error ? reason.message : 'This page could not be loaded.' }); if (reason instanceof AdminApiError) onAccessFailure?.(reason); } });
    return () => { alive = false; };
    // pick is a stable accessor per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, refresh, onAccessFailure]);
  return state.key === key ? state : { key, data: null, error: '' };
}
const Loading = () => <div className="vh-grid" role="status" aria-label="Loading">{Array.from({ length: 4 }, (_, index) => <div key={index} className="vh-skeleton" />)}</div>;
const Failed = ({ error }: { error: string }) => <div className="vh-callout vh-callout--bad" role="alert"><strong>This page didn't load.</strong> {error}</div>;
const Empty = () => <div className="vh-callout"><strong>No visits recorded yet.</strong> Visit tracking starts with the release that added it; this page fills in as people arrive.</div>;
const who = (row: { name?: string | null; email?: string | null; visitorId?: string }) => row.name || row.email || `Visitor ${row.visitorId?.slice(0, 6) ?? ''}`;
const tel = (phone?: string | null) => phone && !phone.includes('•') ? <a className="vh-link" href={`tel:${phone}`}>{phone}</a> : phone || <span className="vh-muted">—</span>;
const where = (row: { device?: string | null; browser?: string | null; inApp?: string | null }) => [row.device, row.inApp ? `${row.inApp} app` : row.browser].filter(Boolean).join(' · ');

export function AcquisitionSection({ userId, days, refresh, onAccessFailure }: Live & { days: AdminWindow }) {
  const { data, error } = useAdminRead<AdminAnalytics>(userId, { action: 'analytics', days }, result => result.analytics, refresh, onAccessFailure);
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  const { totals, previous } = data;
  if (!totals.sessions && !previous.sessions) return <Empty />;
  const versus = (now: number, before: number) => <><Delta current={now} previous={before} /> vs previous {days} days ({before.toLocaleString()})</>;
  return <>
    <div className="vh-grid">
      <Kpi label="Visitors" value={totals.visitors.toLocaleString()} spark={data.daily.map(row => row.visitors)} foot={versus(totals.visitors, previous.visitors)} help={`${totals.today} so far today`} />
      <Kpi label="Visits" value={totals.sessions.toLocaleString()} foot={versus(totals.sessions, previous.sessions)} help="A visit ends after 30 minutes without activity." />
      <Kpi label="Page views" value={totals.pageViews.toLocaleString()} foot={versus(totals.pageViews, previous.pageViews)} />
      <Kpi label="Time per visit" value={seconds(totals.avgSeconds)} help="Average time with the page on screen." />
      <Kpi label="New accounts from visits" value={totals.newAccounts.toLocaleString()} help={totals.visitors ? `${(totals.newAccounts / totals.visitors * 100).toFixed(1)}% of visitors signed up.` : undefined} />
    </div>
    <section className="vh-card vh-section"><h2>Visitors per day</h2><p className="vh-sub">Different browsers each day. Staff and test accounts are left out.</p><LineChart label="Visitors per day" tone="success" points={data.daily.map(row => ({ label: day(row.day), value: row.visitors }))} /></section>
    <div className="vh-grid vh-grid--2">
      <section className="vh-card"><h2>Where visits come from</h2><p className="vh-sub">Ad tags first, then the site that sent them.</p><Bars rows={data.channels.map(row => ({ label: row.label, value: row.sessions, note: `${row.visitors} visitors · ${row.newAccounts} new accounts` }))} format={value => `${value} visits`} /></section>
      <section className="vh-card"><h2>Most clicked</h2><p className="vh-sub">Buttons and links, with the page they're on.</p>
        <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>Clicked</th><th>On page</th><th className="vh-r">Clicks</th></tr></thead>
          <tbody>{data.clicks.length ? data.clicks.slice(0, 15).map(row => <tr key={`${row.label}${row.path}`}><td className="vh-strong">{row.label}{row.href && <small>→ {row.href}</small>}</td><td>{row.path}</td><td className="vh-r">{row.count}<small>{row.visitors} people</small></td></tr>) : <tr><td colSpan={3} className="vh-table-empty">No clicks yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
    <h2 className="vh-label" style={{ margin: '8px 0 10px' }}>Ad campaigns</h2>
    <div className="vh-table-wrap vh-section"><table className="vh-table"><thead><tr><th>Source</th><th>Campaign</th><th>Ad</th><th className="vh-r">Visits</th><th className="vh-r">New accounts</th></tr></thead>
      <tbody>{data.campaigns.length ? data.campaigns.map(row => <tr key={`${row.source}${row.campaign}${row.content}`}><td>{row.source}</td><td>{row.campaign || '—'}</td><td>{row.content || '—'}</td><td className="vh-r">{row.sessions}</td><td className="vh-r">{row.newAccounts}</td></tr>) : <tr><td colSpan={5} className="vh-table-empty">No tagged ad visits yet.</td></tr>}</tbody></table></div>
    <div className="vh-grid vh-grid--2">
      <section className="vh-card"><h2>Landing pages</h2><p className="vh-sub">The first page of each visit.</p>
        <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>Page</th><th className="vh-r">Visits</th><th className="vh-r">Avg time</th><th className="vh-r">Sign-ups</th></tr></thead>
          <tbody>{data.landings.map(row => <tr key={row.path}><td>{row.path}</td><td className="vh-r">{row.sessions}</td><td className="vh-r">{seconds(row.avgSeconds)}</td><td className="vh-r">{row.newAccounts}</td></tr>)}</tbody></table></div>
      </section>
      <section className="vh-card"><h2>Pages</h2><p className="vh-sub">Every page view, with the average time on screen.</p>
        <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>Page</th><th className="vh-r">Views</th><th className="vh-r">People</th><th className="vh-r">Avg time</th></tr></thead>
          <tbody>{data.pages.map(row => <tr key={row.path}><td>{row.path}</td><td className="vh-r">{row.views}</td><td className="vh-r">{row.visitors}</td><td className="vh-r">{seconds(row.avgSeconds)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  </>;
}

export function JourneysSection({ userId, days, refresh, onAccessFailure }: Live & { days: AdminWindow }) {
  const { data, error } = useAdminRead<AdminAnalytics>(userId, { action: 'analytics', days }, result => result.analytics, refresh, onAccessFailure);
  const [query, setQuery] = useState(''), [known, setKnown] = useState(false);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.sessions ?? []).filter(row => (!known || row.userId) && (!needle || [row.name, row.email, row.phone, row.channel, row.campaign, row.landing, row.lastPage].some(value => value?.toLowerCase().includes(needle))));
  }, [data, query, known]);
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  if (!data.sessions.length) return <Empty />;
  return <>
    <div className="vh-toolbar">
      <input className="vh-search" type="search" placeholder="Search name, email, phone, campaign or page" aria-label="Search visits" value={query} onChange={event => setQuery(event.target.value)} />
      <label><input type="checkbox" checked={known} onChange={event => setKnown(event.target.checked)} /> Only people with an account</label>
      <span>{rows.length} of {data.sessions.length} latest visits</span>
    </div>
    <div className="vh-table-wrap"><table className="vh-table">
      <thead><tr><th>Who</th><th>Phone</th><th>Came from</th><th>Landed on → left from</th><th className="vh-r">Pages</th><th className="vh-r">Time</th><th className="vh-r">Clicks</th><th>Device</th><th>When</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={row.id}>
        <td><Link className="vh-link" to={`/admin/journeys/${row.id}`}>{who(row)}</Link>{row.userId ? <small>{row.email}</small> : <small>no account yet</small>}</td>
        <td className="vh-nowrap">{tel(row.phone)}</td>
        <td className="vh-source">{row.channel}{row.campaign && <small>{row.campaign}</small>}</td>
        <td>{row.landing ?? '—'}<small>→ {row.lastPage ?? '—'}</small></td>
        <td className="vh-r">{row.pages}</td><td className="vh-r vh-nowrap">{seconds(row.seconds)}</td><td className="vh-r">{row.clicks}</td>
        <td>{where(row)}</td><td className="vh-nowrap">{ago(row.startedAt)}</td>
      </tr>) : <tr><td colSpan={9} className="vh-table-empty">No visits match.</td></tr>}</tbody>
    </table></div>
  </>;
}

const stepText: Record<string, (event: AdminVisit['events'][number]) => string> = {
  page_view: event => `Opened ${event.path}`,
  click: event => `Clicked “${event.label ?? 'something'}”${event.href ? ` → ${event.href}` : ''}`,
  form_submit: event => `Submitted “${event.label ?? 'a form'}”`,
  identify: () => 'Signed in',
};

export function VisitDetail({ userId, id, refresh, onAccessFailure }: Live & { id: string }) {
  const { data, error } = useAdminRead<AdminVisit>(userId, { action: 'visit', id }, result => result.visit, refresh, onAccessFailure);
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  const ctx = data.context as Record<string, string | boolean>;
  const total = data.events.reduce((sum, event) => sum + (event.seconds ?? 0), 0);
  return <>
    <p className="vh-help" style={{ marginTop: 0 }}><Link className="vh-link" to="/admin/journeys">← All visits</Link></p>
    <div className="vh-grid">
      <Kpi text label="Who" value={data.person?.name || (data.person ? data.person.email : 'Anonymous')} help={data.person ? `${data.person.email} · joined ${ago(data.person.joinedAt)}` : 'Has not signed in on this browser yet.'} />
      <Kpi text label="Phone" value={tel(data.person?.phone)} />
      <Kpi label="Time on site" value={seconds(total)} help={`${data.events.filter(event => event.kind === 'page_view').length} pages · ${data.events.filter(event => event.kind === 'click').length} clicks`} />
      <Kpi text label="Came from" value={data.channel} help={[ctx.utm_campaign, ctx.utm_content].filter(Boolean).join(' · ') || (typeof ctx.referrer === 'string' ? ctx.referrer : undefined)} />
    </div>
    <section className="vh-card vh-section"><h2>What they did</h2><p className="vh-sub">Started {new Date(data.startedAt).toUTCString().slice(5, 22)} UTC on {[data.device, data.os, data.inApp ? `${data.inApp} app` : data.browser].filter(Boolean).join(' · ')}{data.country ? ` in ${data.country}` : ''}. {data.otherVisits > 0 && `${data.otherVisits} other visit${data.otherVisits === 1 ? '' : 's'} from this browser.`} {data.person && <Link className="vh-link" to={`/admin/users/${data.person.userId}`}>See everything this person did →</Link>}</p>
      <ol className="vh-timeline">{data.events.map((event, index) => <li key={index} className={`vh-step vh-step--${event.kind}`}>
        <time className="vh-nowrap">{event.at.slice(11, 19)}</time>
        <div><strong>{stepText[event.kind]?.(event) ?? event.kind}</strong>{event.kind === 'page_view' && <small>{seconds(event.seconds ?? 0)} on screen{event.scroll ? ` · scrolled ${event.scroll}%` : ''}{event.title ? ` · ${event.title}` : ''}</small>}</div>
      </li>)}</ol>
    </section>
  </>;
}

export function PersonDetail({ userId, id, refresh, onAccessFailure }: Live & { id: string }) {
  const { data, error } = useAdminRead<AdminPerson>(userId, { action: 'person', id }, result => result.person, refresh, onAccessFailure);
  if (error) return <Failed error={error} />;
  if (!data) return <Loading />;
  return <>
    <p className="vh-help" style={{ marginTop: 0 }}><Link className="vh-link" to="/admin/users">← All users</Link></p>
    <div className="vh-grid">
      <Kpi text label="Name" value={data.name || '—'} help={data.email} />
      <Kpi text label="Phone" value={tel(data.phone)} help={data.phone ? undefined : 'Not given yet'} />
      <Kpi label="Joined" value={new Date(data.joinedAt).toISOString().slice(0, 10)} help={`Last sign-in ${ago(data.lastSignInAt ?? null)}`} />
      <Kpi label="Paid" value={data.paidUsd ? usd(data.paidUsd) : '—'} />
      <Kpi label="Visits" value={String(data.totals.visits)} help={`${data.totals.pageViews} pages · ${seconds(data.totals.seconds)} in total`} />
    </div>
    {data.phone && !data.phone.includes('•') && <p className="vh-help"><a className="vh-button" href={`tel:${data.phone}`}>Call {data.phone}</a></p>}
    {data.firstVisit && <section className="vh-card vh-section"><h2>Where they came from</h2><p className="vh-sub">First recorded visit, {ago(data.firstVisit.at)}.</p>
      <ul className="vh-list"><li><strong>Channel:</strong> {data.firstVisit.channel}</li>{data.firstVisit.campaign && <li><strong>Ad:</strong> {data.firstVisit.campaign}</li>}<li><strong>Landed on:</strong> {data.firstVisit.landing ?? '—'}</li>{data.firstVisit.referrer && <li><strong>Referred by:</strong> {data.firstVisit.referrer}</li>}</ul></section>}
    <div className="vh-table-wrap"><table className="vh-table"><thead><tr><th>Visit</th><th>Came from</th><th>Landed on</th><th className="vh-r">Pages</th><th className="vh-r">Time</th><th className="vh-r">Clicks</th><th>Device</th></tr></thead>
      <tbody>{data.visits.length ? data.visits.map(row => <tr key={row.id}><td className="vh-nowrap"><Link className="vh-link" to={`/admin/journeys/${row.id}`}>{ago(row.startedAt)}</Link></td><td>{row.channel}</td><td>{row.landing ?? '—'}</td><td className="vh-r">{row.pages}</td><td className="vh-r">{seconds(row.seconds)}</td><td className="vh-r">{row.clicks}</td><td>{where(row)}</td></tr>)
        : <tr><td colSpan={7} className="vh-table-empty">No visits recorded for this person yet.</td></tr>}</tbody></table></div>
  </>;
}

/** The Users list, with each person's name, mobile number and how they found Jobvance. */
export function UsersWithContacts({ userId, data, refresh, onAccessFailure }: Live & { data: AdminDashboard }) {
  const { data: contacts, error } = useAdminRead<AdminContacts>(userId, { action: 'contacts' }, result => result.contacts, refresh, onAccessFailure);
  return <>{error && <div className="vh-callout" role="status"><strong>Names and phone numbers didn't load.</strong> {error}</div>}<UsersSection data={data} contacts={contacts} /></>;
}
