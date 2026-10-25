import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminApiError, callAdmin } from '@/lib/admin-api';
import { callMarketing, inr } from '@/lib/marketing-api';
import type { MarketingOverview } from '@/lib/marketing-types';
import type { AdminGuestSupport, AdminSupportStatus } from '@/lib/admin-types';
import type { AdminDashboard } from '@/lib/admin-dashboard';
import { LineChart } from './charts';
import { Kpi } from './sections';
import { ago, day, statusPill } from './format';

/** Read-only view of the Meta figures the marketing function already stores. Nothing here changes an ad. */
type AccessFailure = (reason: { kind?: string; message: string }) => void;
export function MarketingSection({ userId, refresh = 0, onAccessFailure }: { userId: string; refresh?: number; onAccessFailure?: AccessFailure }) {
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setError(''); setOverview(null);
    void callMarketing(userId, { action: 'overview' }).then(result => { if (alive) setOverview(result.overview); })
      .catch(reason => { if (alive) { setError(reason instanceof Error ? reason.message : 'Marketing figures could not be loaded.'); if (reason instanceof Error) onAccessFailure?.(reason); } });
    return () => { alive = false; };
  }, [userId, refresh, onAccessFailure]);
  if (error) return <div className="vh-callout vh-callout--bad" role="alert"><strong>Marketing figures didn't load.</strong> {error}</div>;
  if (!overview) return <div className="vh-grid" role="status" aria-label="Loading">{Array.from({ length: 4 }, (_, index) => <div key={index} className="vh-skeleton" />)}</div>;
  const { totals, launches, meta } = overview;
  const complete = meta.configured && launches.length > 0 && totals.incompleteLaunches === 0 && launches.every(launch => launch.metrics === 'fresh' && launch.totals);
  const unknown = 'Unknown';
  const money = (minor: number) => inr(minor, totals.currency);
  const byDay = new Map<string, number>();
  for (const launch of launches) for (const row of launch.daily) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.spendMinor);
  const spend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, value]) => ({ label: day(date), value: value / 100 }));
  const clicks = launches.reduce((sum, launch) => sum + (launch.totals?.linkClicks ?? 0), 0);
  return <>
    {!meta.configured && <div className="vh-callout"><strong>Meta isn't connected yet.</strong> Add the ads-read token in Supabase to see live ad figures here. {meta.message}</div>}
    {totals.incompleteLaunches > 0 && <div className="vh-callout"><strong>Some figures are missing.</strong> {totals.incompleteLaunches} ad{totals.incompleteLaunches === 1 ? '' : 's'} could not be read completely, so the real totals may be higher.</div>}
    <div className="vh-grid">
      <Kpi label="Recorded ad spend" value={complete ? money(totals.spendMinor) : unknown} help={complete ? `Today so far: ${money(totals.todaySpendMinor)}` : 'A complete fresh read is required.'} />
      <Kpi label="Impressions" value={complete ? totals.impressions.toLocaleString() : unknown} />
      <Kpi label="Link clicks" value={complete ? clicks.toLocaleString() : unknown} />
      <Kpi label="Landing page views" value={complete ? totals.landingPageViews.toLocaleString() : unknown} help={complete && totals.landingPageViews ? `${money(Math.round(totals.spendMinor / totals.landingPageViews))} per landing page view` : undefined} />
      <Kpi label="Active at last read" value={complete ? String(totals.activeLaunches) : unknown} help={`of ${launches.length} tracked ads · configured status; see effective status below`} />
    </div>
    <section className="vh-card vh-section"><h2>Ad spend per day</h2><p className="vh-sub">Last 30 recorded days, in {totals.currency}.</p>{complete ? <LineChart points={spend} label="Ad spend per day" format={value => money(Math.round(value * 100))} /> : <p className="vh-empty">The chart is unavailable until every tracked ad has a complete fresh read.</p>}</section>
    <div className="vh-table-wrap vh-section"><table className="vh-table">
      <thead><tr><th>Ad</th><th>Status</th><th className="vh-r">Spend</th><th className="vh-r">Clicks</th><th className="vh-r">CTR</th><th className="vh-r">Landing views</th><th className="vh-r">Cost / view</th><th>Figures</th></tr></thead>
      <tbody>{launches.length ? launches.map(launch => <tr key={launch.id}>
        <td><span className="vh-strong">{launch.name}</span><small>Meta ad {launch.metaAdId}</small></td>
        <td>{statusPill(launch.status === 'ACTIVE' ? 'good' : launch.status === 'PAUSED' ? 'warn' : 'neutral', `${launch.status.toLowerCase()} · last read`)}<small>{launch.effectiveStatus ? `Meta: ${launch.effectiveStatus}` : 'Effective status unknown'}</small></td>
        <td className="vh-r">{launch.totals ? money(launch.totals.spendMinor) : '—'}</td>
        <td className="vh-r">{launch.totals?.linkClicks.toLocaleString() ?? '—'}</td>
        <td className="vh-r">{launch.totals?.ctrPct === null || !launch.totals ? '—' : `${launch.totals.ctrPct.toFixed(2)}%`}</td>
        <td className="vh-r">{launch.totals?.landingPageViews.toLocaleString() ?? '—'}</td>
        <td className="vh-r">{launch.totals?.costPerLpvMinor == null ? '—' : money(launch.totals.costPerLpvMinor)}</td>
        <td>{statusPill(launch.metrics === 'fresh' ? 'good' : launch.metrics === 'stale' ? 'warn' : 'neutral', launch.metrics)}<small>{launch.lastSyncedAt ? ago(launch.lastSyncedAt) : 'never read'}</small></td>
      </tr>) : <tr><td colSpan={8} className="vh-table-empty">No ads are tracked yet.</td></tr>}</tbody>
    </table></div>
    {overview.recommendations.length > 0 && <section className="vh-card vh-section"><h2>Suggestions</h2><p className="vh-sub">Advice only. Nothing is changed in Meta automatically.</p>
      <ul className="vh-list">{overview.recommendations.map(rec => <li key={rec.id}>{statusPill(rec.severity === 'action' ? 'bad' : rec.severity === 'warning' ? 'warn' : 'neutral', rec.severity === 'action' ? 'Act' : rec.severity === 'warning' ? 'Watch' : 'Info')} <strong>{rec.title}</strong> · {rec.reason}</li>)}</ul></section>}
    <p className="vh-help">Full ad details, ideas and settings: <Link className="vh-link" to="/marketing-admin">open the marketing workspace →</Link></p>
  </>;
}

const statusLabel: Record<AdminSupportStatus, string> = { received: 'New', in_review: 'In progress', resolved: 'Closed' };
const statusTone = (status: AdminSupportStatus) => status === 'resolved' ? 'good' : status === 'in_review' ? 'warn' : 'bad';

/** Account messages and guest contact-form messages. Opening and saving are audited on the server. */
export function SupportSection({ userId, data, onSaved, refresh = 0, onAccessFailure }: { userId: string; data: AdminDashboard; onSaved: () => void; refresh?: number; onAccessFailure?: AccessFailure }) {
  const [guests, setGuests] = useState<AdminGuestSupport[] | null>(null);
  const [guestError, setGuestError] = useState('');
  const [open, setOpen] = useState<{ kind: 'account' | 'guest'; id: string; version: number; status: AdminSupportStatus; message: string; reply: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const ticket = useRef(0);
  useEffect(() => {
    let alive = true;
    ticket.current += 1; setOpen(null); setBusy(false); setError(''); setGuestError(''); setGuests(null);
    void callAdmin(userId, { action: 'guest_support_list' }).then(result => { if (alive) setGuests(result.guestSupport ?? []); }).catch(reason => {
      if (alive) { setGuestError('Visitor messages could not be loaded. Counts are unknown. Refresh to try again.'); if (reason instanceof Error) onAccessFailure?.(reason); }
    });
    return () => { alive = false; ticket.current += 1; };
  }, [userId, refresh, onAccessFailure]);
  const fail = (reason: unknown) => {
    setError(reason instanceof AdminApiError ? reason.message : 'That didn’t go through. Refresh and try again.');
    if (reason instanceof Error) onAccessFailure?.(reason);
  };
  async function show(kind: 'account' | 'guest', id: string, version: number, status: AdminSupportStatus) {
    const mine = ++ticket.current; setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'account') {
        const result = await callAdmin(userId, { action: 'support_detail', id });
        if (mine === ticket.current && result.supportDetail) setOpen({ kind, id, version, status, message: result.supportDetail.message, reply: '' });
      } else {
        const result = await callAdmin(userId, { action: 'guest_support_detail', id });
        const detail = result.guestSupportDetail;
        if (mine === ticket.current && detail) setOpen({ kind, id, version: detail.version, status: detail.status, message: detail.message, reply: detail.reply });
      }
    } catch (reason) { if (mine === ticket.current) fail(reason); } finally { if (mine === ticket.current) setBusy(false); }
  }
  async function save() {
    if (!open) return;
    const mine = ++ticket.current; setBusy(true); setError('');
    try {
      if (open.kind === 'account') await callAdmin(userId, { action: 'update_support', id: open.id, expectedVersion: open.version, status: open.status });
      else {
        const result = await callAdmin(userId, { action: 'guest_support_update', id: open.id, expectedVersion: open.version, status: open.status, reply: open.reply });
        const next = result.guestSupportDetail;
        if (mine === ticket.current && next) setGuests(rows => rows?.map(row => row.id === next.id ? { ...row, status: next.status, version: next.version, hasReply: !!next.reply } : row) ?? rows);
      }
      if (mine === ticket.current) { setOpen(null); setNotice('Saved. No email was sent; reply to the person yourself if needed.'); onSaved(); }
    } catch (reason) { if (mine === ticket.current) fail(reason); } finally { if (mine === ticket.current) setBusy(false); }
  }
  const accountOpen = data.support.filter(row => row.status !== 'resolved').length;
  const guestOpen = guests?.filter(row => row.status !== 'resolved').length;
  const rows = [
    ...data.support.map(row => ({ kind: 'account' as const, id: row.id, who: row.emailDisplay, userId: row.userId, category: row.category, status: row.status, at: row.createdAt, version: row.version, replied: false })),
    ...(guests ?? []).map(row => ({ kind: 'guest' as const, id: row.id, who: 'Visitor (no account)', userId: null, category: row.category, status: row.status, at: row.createdAt, version: row.version, replied: row.hasReply })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return <>
    <div className="vh-grid">
      <Kpi label="Waiting on you" value={guestOpen === undefined ? 'Unknown' : String(accountOpen + guestOpen)} tone={guestOpen === undefined ? undefined : accountOpen + guestOpen ? 'bad' : 'good'} help="New or in progress" />
      <Kpi label="From users" value={String(data.support.length)} help={`${accountOpen} open`} />
      <Kpi label="From visitors" value={guests ? String(guests.length) : 'Unknown'} help={guestOpen === undefined ? 'Visitor source not confirmed' : `${guestOpen} open`} />
    </div>
    {notice && <p className="vh-ok" role="status">{notice}</p>}
    {guestError && <div className="vh-callout vh-callout--bad" role="alert">{guestError}</div>}
    {error && <div className="vh-callout vh-callout--bad" role="alert"><strong>Not saved.</strong> {error}</div>}
    {open && <section className="vh-card vh-section" aria-label="Open message">
      <h2>{open.kind === 'guest' ? 'Visitor message' : 'User message'}</h2>
      <div className="vh-detail">{open.message || 'This message is empty.'}</div>
      {open.kind === 'guest' && <><label className="vh-label" htmlFor="vh-reply" style={{ display: 'block', marginTop: 12 }}>Reply shown on their receipt</label><textarea id="vh-reply" className="vh-reply" maxLength={2000} value={open.reply} onChange={event => setOpen({ ...open, reply: event.target.value })} /></>}
      <div className="vh-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
        <label>Status <select className="vh-select" value={open.status} onChange={event => setOpen({ ...open, status: event.target.value as AdminSupportStatus })}>{(Object.keys(statusLabel) as AdminSupportStatus[]).map(status => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
        <button type="button" className="vh-button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="vh-button vh-button--ghost" disabled={busy} onClick={() => setOpen(null)}>Close</button>
      </div>
    </section>}
    <div className="vh-table-wrap"><table className="vh-table">
      <thead><tr><th>From</th><th>Topic</th><th>Status</th><th>Received</th><th /></tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={`${row.kind}-${row.id}`}>
        <td>{row.userId ? <Link className="vh-link" to={`/admin/users?focus=${row.userId}`}>{row.who}</Link> : row.who}{row.replied && <small>Reply recorded</small>}</td>
        <td>{row.category === 'bug' ? 'Something broken' : row.category === 'privacy' ? 'Privacy' : 'Help'}</td>
        <td>{statusPill(statusTone(row.status), statusLabel[row.status])}</td>
        <td>{ago(row.at)}</td>
        <td className="vh-r"><button type="button" className="vh-button vh-button--ghost" disabled={busy} onClick={() => void show(row.kind, row.id, row.version, row.status)}>Open</button></td>
      </tr>) : <tr><td colSpan={5} className="vh-table-empty">{guestError ? 'Visitor messages unavailable.' : guests === null ? 'Loading…' : 'No messages yet.'}</td></tr>}</tbody>
    </table></div>
  </>;
}
