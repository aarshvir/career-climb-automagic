import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, BarChart3, BriefcaseBusiness, ChevronRight, LayoutDashboard, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAdminAuthority } from '@/lib/admin-authority';
import { AdminApiError, adminRange, callAdmin } from '@/lib/admin-api';
import type { AdminAction, AdminResponse, AdminSnapshot } from '@/lib/admin-types';
import AdminOperations from './AdminOperations';
import AdminFounder from './AdminFounder';
import { Badge, Notice } from './AdminShared';
import { utc } from './admin-format';
import './AdminPortal.css';

export default function AdminPortal({ view }: { view: 'operations' | 'founder' }) {
  const { userId, authority, authLoading, isCurrent } = useAdminAuthority();
  const [params, setParams] = useSearchParams();
  const days = adminRange(params.get('days'));
  const path = view === 'operations' ? '/admin-original' : '/admin2';
  const returnPath = `${path}?days=${days}`;
  const [loaded, setLoaded] = useState<{ authority: string; days: number; view: string; snapshot: AdminSnapshot } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const [refresh, setRefresh] = useState(0);
  const snapshot = authority && loaded?.authority === authority && loaded.days === days && loaded.view === view ? loaded.snapshot : null;

  useEffect(() => {
    const revision = ++generation.current;
    setLoaded(null); setError(null); setNotice(''); setLoading(true); setBusy(false); setNeedsRefresh(false);
    if (!authority || !userId) return;
    void callAdmin(userId, { action: 'snapshot', days }).then(result => {
      if (generation.current === revision && isCurrent(authority)) setLoaded({ authority, days, view, snapshot: result.snapshot });
    }).catch(reason => {
      if (generation.current === revision && isCurrent(authority)) setError(reason instanceof AdminApiError ? reason : new AdminApiError('unavailable', 'Administration could not be loaded. Try refreshing.'));
    }).finally(() => { if (generation.current === revision && isCurrent(authority)) setLoading(false); });
    return () => { generation.current += 1; };
  }, [userId, authority, days, refresh, view, isCurrent]);
  useEffect(() => {
    document.getElementById('admin-content')?.focus();
    window.scrollTo(0, 0);
  }, [view]);

  const onAction = useCallback(async (action: AdminAction): Promise<AdminResponse | void> => {
    if (!userId || !authority || busy || needsRefresh && action.action !== 'provider_status' && action.action !== 'support_detail') return;
    const revision = generation.current;
    setBusy(true); setNotice(''); if (!needsRefresh) setError(null);
    try {
      const result = await callAdmin(userId, action);
      if (generation.current !== revision || !isCurrent(authority)) return;
      if (action.action === 'provider_status') { setNotice('Connection status checked. No model generation was started.'); return result; }
      if (action.action === 'support_detail') return result;
      // A save response confirms persistence; a separate read returns its audit record and current counters.
      const current = await callAdmin(userId, { action: 'snapshot', days });
      if (generation.current !== revision || !isCurrent(authority)) return;
      setLoaded({ authority, days, view, snapshot: current.snapshot });
      setNotice(action.action === 'update_config' ? 'Controls saved and audited. Existing candidate consent still applies.' : 'Support status saved and audited.');
      return result;
    } catch (reason) {
      if (generation.current !== revision || !isCurrent(authority)) return;
      const failure = reason instanceof AdminApiError ? reason : new AdminApiError('unavailable', 'This action could not be confirmed. Refresh before retrying.');
      setError(failure);
      if (action.action === 'update_config' || action.action === 'update_support') setNeedsRefresh(true);
      if (failure.kind === 'forbidden' || failure.kind === 'unauthenticated') setLoaded(null);
    } finally { if (generation.current === revision && isCurrent(authority)) setBusy(false); }
  }, [userId, authority, isCurrent, busy, days, needsRefresh, view]);

  const authorized = !!snapshot && error?.kind !== 'forbidden' && error?.kind !== 'unauthenticated';
  const sections = view === 'operations' ? [['support', 'Support receipts'], ['runs', 'Preparation runs'], ['schedules', 'Scheduler & pilot'], ['users', 'Candidate records'], ['audit', 'Admin audit']] : [['milestones', 'Observed milestones'], ['funnel', 'Signup cohort funnel'], ['retention', 'Retention'], ['budget', 'Costs & revenue'], ['providers', 'Model connection'], ['controls', 'Owner controls']];

  return <div className="admin-workspace">
    <Helmet><title>{view === 'operations' ? 'Operations' : 'Founder overview'} · Private Jobvance</title><meta name="robots" content="noindex, nofollow, noarchive" /><meta name="googlebot" content="noindex, nofollow, noarchive" /></Helmet>
    {!authLoading && (!userId || error?.kind === 'unauthenticated') && <Navigate to={`/auth?next=${encodeURIComponent(returnPath)}`} replace />}
    <a href="#admin-content" className="admin-skip">Skip to administration content</a>
    <header className="admin-topbar"><Link to="/" className="admin-brand"><span><BriefcaseBusiness size={20} aria-hidden="true" /></span>Jobvance <small>private workspace</small></Link><div className="admin-topbar-links"><Badge><LockKeyhole size={12} aria-hidden="true" /> Private</Badge><Link to="/admin">New admin</Link><Link to="/"><ArrowUpRight size={14} aria-hidden="true" /> Return to site</Link></div></header>
    <div className={`admin-layout ${authorized ? '' : 'admin-layout--locked'}`}>
      {authorized && <aside className="admin-sidebar"><p className="admin-nav-label">Workspaces</p><nav aria-label="Administration workspaces"><Link to={`/admin-original?days=${days}`} aria-current={view === 'operations' ? 'page' : undefined}><LayoutDashboard size={18} aria-hidden="true" />Operations<ChevronRight size={14} aria-hidden="true" /></Link><Link to={`/admin2?days=${days}`} aria-current={view === 'founder' ? 'page' : undefined}><BarChart3 size={18} aria-hidden="true" />Founder<ChevronRight size={14} aria-hidden="true" /></Link></nav><p className="admin-nav-label admin-section-label">On this page</p><nav className="admin-section-nav" aria-label="Page sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={19} aria-hidden="true" /><strong>Server-verified {snapshot.actor.role}</strong><p>Access is checked again for every request.</p></div></aside>}
      <main id="admin-content" className="admin-main" tabIndex={-1}>
        <div className="admin-page-head"><div><p className="admin-eyebrow">Original administration / {view === 'operations' ? 'Daily operations' : 'Founder overview'}</p><h1>{view === 'operations' ? 'Keep the pilot moving.' : 'See the evidence. Set the bounds.'}</h1><p>{view === 'operations' ? 'Candidate support, preparation health and manual decisions.' : 'Observed progress, honest costs and carefully bounded controls.'}</p></div>{authorized && <div className="admin-head-controls"><div className="admin-range" role="group" aria-label="Measurement window">{([7, 30, 90] as const).map(range => <button type="button" key={range} aria-pressed={days === range} disabled={busy} onClick={() => setParams({ days: String(range) })}>{range} days</button>)}</div><button type="button" className="admin-icon-button" aria-label="Refresh administration" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button></div>}</div>
        {(authLoading || loading) && !error && <div className="admin-loading" role="status"><span className="admin-loading-icon"><ShieldCheck size={25} aria-hidden="true" /></span><h2>{authLoading ? 'Checking your account…' : 'Verifying administration access…'}</h2><p>Private records open after the server verifies this account’s role.</p><div className="admin-skeleton-grid" aria-hidden="true"><div /><div /><div /></div></div>}
        {error?.kind === 'forbidden' && <div className="admin-access-state" role="alert"><LockKeyhole size={30} aria-hidden="true" /><h2>Administration access required</h2><p>This signed-in account is not authorized for this private workspace. No administration data has been opened.</p><Link to="/dashboard" className="admin-button"><ArrowLeft size={15} aria-hidden="true" />Return to your candidate workspace</Link></div>}
        {error && error.kind !== 'forbidden' && error.kind !== 'unauthenticated' && <Notice tone={error.kind === 'conflict' ? 'warning' : 'error'} alert><strong>{error.kind === 'conflict' ? 'Save stopped: a newer version exists.' : 'This request could not be confirmed.'}</strong><p>{error.message}</p><button type="button" className="admin-button admin-button--small" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh current data</button></Notice>}
        {authorized && <><Notice>This is the original admin, kept for reference. Its payment and free-place figures were written before live billing started. <Link to="/admin">Open the new admin</Link> for current numbers.</Notice><div className="admin-evidence-line"><span><span className="admin-live-dot" aria-hidden="true" />Server snapshot · {utc(snapshot.generatedAt)}</span><span>{days}-day UTC window · {snapshot.coverage.excludedQaUsers} QA accounts excluded</span></div>{snapshot.coverage.notes.length > 0 && <details className="admin-coverage"><summary>Measurement coverage & limits</summary><ul>{snapshot.coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}{notice && <Notice>{notice}</Notice>}{view === 'operations' ? <AdminOperations snapshot={snapshot} busy={busy || needsRefresh} onAction={onAction} /> : <AdminFounder snapshot={snapshot} busy={busy} stale={needsRefresh} onAction={onAction} />}<footer className="admin-workspace-footer"><LockKeyhole size={13} aria-hidden="true" />Private administration · UTC measurements · every change requires a verified role</footer></>}
      </main>
    </div>
  </div>;
}
