import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowUpRight, BriefcaseBusiness, Eye, Lightbulb, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MarketingApiError, callMarketing, inr } from '@/lib/marketing-api';
import type { MarketingAction, MarketingIdea, MarketingLaunch, MarketingOverview, MarketingRecommendation, MarketingSettingsInput, MarketingTotals, MetricsIssue } from '@/lib/marketing-types';
import { Badge, Empty, Notice, Panel } from './AdminShared';
import { readable, utc } from './admin-format';
import './AdminPortal.css';

type Run = (action: MarketingAction) => Promise<boolean>;
const pct = (value: number | null) => value === null ? 'n/a' : `${value.toFixed(2)}%`;
const statusTone = (status: string) => status === 'ACTIVE' ? 'good' : status === 'PAUSED' ? 'warning' : status === 'UNKNOWN' ? 'neutral' : 'bad';
const ideaTone = (status: MarketingIdea['status']) => status === 'launched' ? 'good' : status === 'in_production' || status === 'ready' ? 'warning' : 'neutral';
const issueText: Record<MetricsIssue, string> = {
  invalid: 'Meta returned figures in an unexpected shape.',
  incomplete: 'Meta had more pages of figures than this page reads.',
  currency_mismatch: "The ad account's currency no longer matches this launch.",
  account_mismatch: 'The ad, its ad set or campaign, or the account time zone no longer matches the record.',
  meta_error: 'Meta did not answer the last read.',
};

function Confirm({ open, title, children, confirm, busy, onClose, onConfirm }: { open: boolean; title: string; children: ReactNode; confirm: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="admin-message-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription asChild><div>{children}</div></DialogDescription></DialogHeader>
    <DialogFooter><button type="button" className="admin-button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="admin-button admin-button--primary" onClick={onConfirm} disabled={busy}>{confirm}</button></DialogFooter></DialogContent></Dialog>;
}

function SpendBars({ launch }: { launch: MarketingLaunch }) {
  const days = launch.daily.slice(-14);
  const top = Math.max(1, ...days.map(day => day.spendMinor));
  if (!days.length) return <span className="admin-cell-note">No daily figures</span>;
  return <span aria-label={`Daily spend for the last ${days.length} days`} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 26, marginTop: 6 }}>
    {days.map(day => <span key={day.day} title={`${day.day}: ${inr(day.spendMinor, launch.currency)}, ${day.landingPageViews} landing page views`} style={{ width: 6, height: Math.max(2, Math.round(day.spendMinor / top * 26)), background: '#2850df', borderRadius: 2, opacity: .8 }} />)}
  </span>;
}

function LaunchRow({ launch, idea }: { launch: MarketingLaunch; idea?: MarketingIdea }) {
  const t = launch.totals;
  // Unknown figures are never shown as zero.
  const figure = (value: (totals: MarketingTotals) => ReactNode, note?: (totals: MarketingTotals) => ReactNode) => t ? <td>{value(t)}{note && <span className="admin-cell-note">{note(t)}</span>}</td> : <td><span title="No complete read from Meta yet">Unknown</span></td>;
  return <tr>
    <td><strong>{launch.name}</strong><span className="admin-cell-note">{idea?.title ?? 'Unknown idea'} · Meta ad {launch.metaAdId}</span><SpendBars launch={launch} /></td>
    <td><Badge tone={statusTone(launch.status)}>{readable(launch.status.toLowerCase())}</Badge><span className="admin-cell-note">{launch.effectiveStatus ? `Meta: ${readable(launch.effectiveStatus.toLowerCase())}` : 'Not read from Meta yet'}</span></td>
    <td>{inr(launch.dailyBudgetMinor, launch.currency)}<span className="admin-cell-note">{launch.endAt ? `ends ${utc(launch.endAt)}` : 'no end date'}</span></td>
    {figure(x => inr(x.spendMinor, launch.currency), x => `${x.days} day${x.days === 1 ? '' : 's'} with delivery`)}
    {figure(x => x.impressions.toLocaleString('en-IN'), x => `reach ${x.reach.toLocaleString('en-IN')}+`)}
    {figure(x => x.linkClicks.toLocaleString('en-IN'))}
    {figure(x => pct(x.ctrPct))}
    {figure(x => x.landingPageViews.toLocaleString('en-IN'))}
    {figure(x => inr(x.costPerLpvMinor, launch.currency))}
    <td><Badge tone={launch.metrics === 'fresh' ? 'good' : launch.metrics === 'stale' ? 'warning' : 'neutral'}>{launch.metrics === 'fresh' ? 'Fresh' : launch.metrics === 'stale' ? 'Stale' : 'Unknown'}</Badge><span className="admin-cell-note">{launch.lastSyncedAt ? `as of ${utc(launch.lastSyncedAt)}` : 'never read completely'}{launch.metricsIssue ? ` · ${issueText[launch.metricsIssue]}` : ''}</span></td>
  </tr>;
}

function Recommendation({ rec }: { rec: MarketingRecommendation }) {
  return <li className="admin-check-control" style={{ alignItems: 'center' }}><Sparkles size={17} aria-hidden="true" /><div style={{ flex: 1 }}><strong>{rec.title}</strong> <Badge tone={rec.severity === 'action' ? 'bad' : rec.severity === 'warning' ? 'warning' : 'neutral'}>{rec.severity === 'action' ? 'Action' : rec.severity === 'warning' ? 'Watch' : 'Info'}</Badge><small>{rec.reason}</small></div></li>;
}

function IdeaCard({ idea, overview, busy, run }: { idea: MarketingIdea; overview: MarketingOverview; busy: boolean; run: Run }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const creatives = overview.creatives.filter(item => item.ideaId === idea.id);
  const queued = overview.requests.some(item => item.ideaId === idea.id && (item.status === 'queued' || item.status === 'in_progress'));
  const launches = overview.launches.filter(item => item.ideaId === idea.id);
  return <article className="admin-check-control" style={{ display: 'block' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><strong style={{ fontSize: 13 }}>{idea.title}</strong><Badge tone={ideaTone(idea.status)}>{readable(idea.status)}</Badge></div>
    {idea.angle && <small>{idea.angle}</small>}
    {creatives.length > 0 && <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 11, lineHeight: 1.9 }}>{creatives.map(item => <li key={item.id}>{item.label}{item.format ? ` (${item.format})` : ''} · {item.approved ? <Badge tone="good">Owner-approved</Badge> : <Badge tone="warning">Not approved</Badge>}</li>)}</ul>}
    <small>{launches.length ? `${launches.length} Meta launch${launches.length === 1 ? '' : 'es'}` : 'Not launched'}{idea.sourcePath ? ` · files: ${idea.sourcePath}` : ''}</small>
    <div style={{ marginTop: 12 }}><button type="button" className="admin-button admin-button--small" disabled={busy || queued || idea.status === 'launched'} onClick={() => setOpen(true)}><Wand2 size={13} aria-hidden="true" />{queued ? 'In production queue' : idea.status === 'launched' ? 'Already launched' : 'Send to ad creation'}</button></div>
    <Confirm open={open} busy={busy} title={`Send "${idea.title}" to ad creation?`} confirm="Add to production queue" onClose={() => setOpen(false)} onConfirm={() => { setOpen(false); void run({ action: 'request_creation', ideaId: idea.id, note }); }}>
      <p>The ad team builds it with the locked workflow (script panel, captions, Reels-safe layout) and asks you to approve the exact files before anything goes live. Nothing is spent from this button.</p>
      <label className="admin-field" style={{ marginTop: 12 }}>Notes for the team (optional)<textarea value={note} maxLength={1000} rows={3} onChange={event => setNote(event.target.value)} style={{ border: '1px solid #c9d1df', borderRadius: 7, padding: 8 }} /></label>
    </Confirm>
  </article>;
}

function NewIdea({ busy, run }: { busy: boolean; run: Run }) {
  const [title, setTitle] = useState('');
  const [angle, setAngle] = useState('');
  return <form className="admin-check-control" style={{ display: 'grid', gap: 10 }} onSubmit={async event => { event.preventDefault(); if (await run({ action: 'create_idea', title, angle })) { setTitle(''); setAngle(''); } }}>
    <strong><Lightbulb size={14} aria-hidden="true" /> New idea</strong>
    <label className="admin-field">Title<input value={title} minLength={3} maxLength={140} required onChange={event => setTitle(event.target.value)} placeholder="D: Before and after a Monday job search" /></label>
    <label className="admin-field">Angle<input value={angle} maxLength={600} onChange={event => setAngle(event.target.value)} placeholder="One sentence on the hook and the proof" /></label>
    <div><button type="submit" className="admin-button admin-button--small admin-button--primary" disabled={busy || title.trim().length < 3}>Save idea</button></div>
  </form>;
}

function Thresholds({ overview, owner, busy, run }: { overview: MarketingOverview; owner: boolean; busy: boolean; run: Run }) {
  const s = overview.settings;
  const [form, setForm] = useState<MarketingSettingsInput>({ maxDailySpendMinor: s.maxDailySpendMinor, maxTotalSpendMinor: s.maxTotalSpendMinor, minImpressions: s.minImpressions, pauseCtrBelowPct: s.pauseCtrBelowPct, costPerLpvRatio: s.costPerLpvRatio });
  useEffect(() => { setForm({ maxDailySpendMinor: s.maxDailySpendMinor, maxTotalSpendMinor: s.maxTotalSpendMinor, minImpressions: s.minImpressions, pauseCtrBelowPct: s.pauseCtrBelowPct, costPerLpvRatio: s.costPerLpvRatio }); }, [s.version, s.maxDailySpendMinor, s.maxTotalSpendMinor, s.minImpressions, s.pauseCtrBelowPct, s.costPerLpvRatio]);
  const rupees = (minor: number) => String(Math.round(minor / 100));
  const valid = form.maxDailySpendMinor >= 100 && form.maxTotalSpendMinor >= form.maxDailySpendMinor && form.minImpressions >= 100 && form.pauseCtrBelowPct >= 0 && form.pauseCtrBelowPct <= 10 && form.costPerLpvRatio >= 1.2 && form.costPerLpvRatio <= 10;
  const disabled = !owner || busy;
  return <form onSubmit={event => { event.preventDefault(); void run({ action: 'update_settings', expectedVersion: s.version, settings: form }); }}>
    <div style={{ padding: '0 25px' }}><Notice tone="warning"><strong>Auto mode, pause and resume are not available yet.</strong><p>This page only reads from Meta, so make ad changes in Meta Ads Manager. Launching, pausing, resuming and auto mode come back only once each change is tied to the exact approved creative, fresh spend and account checks, and safe handling of overlapping or uncertain changes.</p></Notice></div>
    <div className="admin-control-grid">
      <label className="admin-field">Daily spend cap (₹)<input type="number" min={1} step={1} value={rupees(form.maxDailySpendMinor)} disabled={disabled} onChange={event => setForm({ ...form, maxDailySpendMinor: Math.round(Number(event.target.value) * 100) })} /><small>All ads together, per Meta account day. Meta can spend up to 75% over a day's budget, so keep this above your daily budgets.</small></label>
      <label className="admin-field">Total spend cap (₹)<input type="number" min={1} step={1} value={rupees(form.maxTotalSpendMinor)} disabled={disabled} onChange={event => setForm({ ...form, maxTotalSpendMinor: Math.round(Number(event.target.value) * 100) })} /><small>Across every ad listed here. Only the campaign's own Meta spending limit actually stops spend.</small></label>
      <label className="admin-field">Impressions before judging an ad<input type="number" min={100} step={100} value={form.minImpressions} disabled={disabled} onChange={event => setForm({ ...form, minImpressions: Math.round(Number(event.target.value)) })} /><small>No pause advice before this, so early noise does not kill a good ad.</small></label>
      <label className="admin-field">Advise pausing below this link click-through rate (%)<input type="number" min={0} max={10} step={0.05} value={form.pauseCtrBelowPct} disabled={disabled} onChange={event => setForm({ ...form, pauseCtrBelowPct: Number(event.target.value) })} /></label>
      <label className="admin-field">Advise pausing when cost per landing page view is this many times the best ad<input type="number" min={1.2} max={10} step={0.1} value={form.costPerLpvRatio} disabled={disabled} onChange={event => setForm({ ...form, costPerLpvRatio: Number(event.target.value) })} /></label>
    </div>
    <div className="admin-control-footer" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 25px 25px', alignItems: 'center' }}>
      <button type="submit" className="admin-button admin-button--primary" disabled={disabled || !valid}>Save caps and thresholds</button>
      <span className="admin-cell-note">Version {s.version} · these only shape the recommendations{!owner && ' · only the owner can change these'}</span>
    </div>
  </form>;
}

export default function MarketingAdmin() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MarketingApiError | null>(null);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const revision = ++generation.current;
    setError(null); setLoading(true);
    if (authLoading || !userId) return;
    void callMarketing(userId, { action: 'overview' }).then(result => { if (generation.current === revision) setOverview(result.overview); })
      .catch(reason => { if (generation.current === revision) { setOverview(null); setError(reason instanceof MarketingApiError ? reason : new MarketingApiError('unavailable', 'The marketing workspace could not be loaded.')); } })
      .finally(() => { if (generation.current === revision) setLoading(false); });
    return () => { generation.current += 1; };
  }, [userId, authLoading, refresh]);

  const run: Run = useCallback(async action => {
    if (!userId || busy) return false;
    const revision = generation.current;
    setBusy(true); setNotice(''); setError(null);
    try {
      const result = await callMarketing(userId, action);
      if (generation.current !== revision) return false;
      setOverview(result.overview);
      if (result.result) setNotice(result.result.message);
      return true;
    } catch (reason) {
      if (generation.current !== revision) return false;
      const failure = reason instanceof MarketingApiError ? reason : new MarketingApiError('unavailable', 'This action could not be confirmed. Refresh before retrying.');
      setError(failure);
      if (failure.kind === 'forbidden' || failure.kind === 'unauthenticated') setOverview(null);
      return false;
    } finally { if (generation.current === revision) setBusy(false); }
  }, [userId, busy]);

  const owner = overview?.actor.role === 'owner';
  const connected = !!overview?.meta.configured;
  const ideaById = new Map(overview?.ideas.map(idea => [idea.id, idea]) ?? []);
  const actionRecs = overview?.recommendations.filter(rec => rec.severity !== 'info') ?? [];
  const infoRecs = overview?.recommendations.filter(rec => rec.severity === 'info') ?? [];
  const totals = overview?.totals;
  const allUnknown = !!overview?.launches.length && overview.launches.every(launch => !launch.totals);
  const atLeast = (value: string) => allUnknown ? 'Unknown' : totals?.incompleteLaunches ? `At least ${value}` : value;
  const sections = [['summary', 'Summary'], ['recommendations', 'Recommendations'], ['launches', 'Meta ads'], ['ideas', 'Ideas'], ['queue', 'Production queue'], ['controls', 'Caps and auto mode'], ['audit', 'Audit log']];

  return <div className="admin-workspace">
    <Helmet><title>Marketing · Private Jobvance</title><meta name="robots" content="noindex, nofollow, noarchive" /><meta name="googlebot" content="noindex, nofollow, noarchive" /></Helmet>
    {!authLoading && (!user || error?.kind === 'unauthenticated') && <Navigate to={`/auth?next=${encodeURIComponent('/marketing-admin')}`} replace />}
    <a href="#marketing-content" className="admin-skip">Skip to marketing content</a>
    <header className="admin-topbar"><Link to="/" className="admin-brand"><span><BriefcaseBusiness size={20} aria-hidden="true" /></span>Jobvance <small>private workspace</small></Link><div className="admin-topbar-links"><Badge><LockKeyhole size={12} aria-hidden="true" /> Private</Badge><Link to="/admin2">Founder overview</Link><Link to="/"><ArrowUpRight size={14} aria-hidden="true" /> Return to site</Link></div></header>
    <div className={`admin-layout ${overview ? '' : 'admin-layout--locked'}`}>
      {overview && <aside className="admin-sidebar"><p className="admin-nav-label">Marketing</p><nav className="admin-section-nav" aria-label="Page sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={19} aria-hidden="true" /><strong>Server-verified {overview.actor.role}</strong><p>Access is checked again for every request. This page reads Meta and never changes an ad.</p></div></aside>}
      <main id="marketing-content" className="admin-main" tabIndex={-1}>
        <div className="admin-page-head"><div><p className="admin-eyebrow">Private administration / Marketing</p><h1>Every idea, every ad, every rupee.</h1><p>Ideas, the production queue and live Meta results in one read-only view. Pausing, resuming and auto mode are not available yet.</p></div>
          {overview && <div className="admin-head-controls"><button type="button" className="admin-button" disabled={busy || !connected} title={connected ? 'Reads the latest figures from Meta. It changes nothing in Meta.' : 'Connect Meta first'} onClick={() => void run({ action: 'sync' })}><RefreshCw size={15} aria-hidden="true" />Sync now</button><button type="button" className="admin-icon-button" aria-label="Refresh marketing workspace" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button></div>}</div>
        {(authLoading || loading) && !error && !overview && <div className="admin-loading" role="status"><span className="admin-loading-icon"><ShieldCheck size={25} aria-hidden="true" /></span><h2>{authLoading ? 'Checking your account…' : 'Verifying access…'}</h2><p>The marketing workspace opens after the server verifies this account's role.</p></div>}
        {error?.kind === 'forbidden' && !overview && <div className="admin-access-state" role="alert"><LockKeyhole size={30} aria-hidden="true" /><h2>Owner access required</h2><p>{error.message}</p><Link to="/dashboard" className="admin-button">Return to your workspace</Link></div>}
        {error && error.kind !== 'forbidden' && error.kind !== 'unauthenticated' && <Notice tone={error.kind === 'conflict' || error.kind === 'not_connected' ? 'warning' : 'error'} alert><strong>{error.kind === 'not_connected' ? 'Meta is not connected.' : error.kind === 'conflict' ? 'Not saved: something changed.' : 'This request could not be confirmed.'}</strong><p>{error.message}</p><button type="button" className="admin-button admin-button--small" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button></Notice>}
        {overview && totals && <>
          {notice && <Notice>{notice}</Notice>}
          {!connected && <Notice tone="warning"><strong>Meta is not connected yet.</strong><p>{overview.meta.message}</p></Notice>}
          <div className="admin-evidence-line"><span><span className="admin-live-dot" aria-hidden="true" />Server overview · {utc(overview.generatedAt)}</span><span>Last complete Meta sync {utc(overview.settings.lastSyncAt)}</span><span><Eye size={13} aria-hidden="true" /> Read-only</span></div>
          <Panel id="summary" title="Summary" subtitle="Totals across every ad listed here, from the last complete read of each ad.">
            <div className="admin-metrics">
              <article className="admin-metric"><div className="admin-metric-label">Spend so far</div><strong className="admin-metric-value">{atLeast(inr(totals.spendMinor, totals.currency))}</strong><div className="admin-metric-basis">of {inr(overview.settings.maxTotalSpendMinor, totals.currency)} total cap · {allUnknown ? 'today unknown' : `${totals.incompleteLaunches ? 'at least ' : ''}${inr(totals.todaySpendMinor, totals.currency)} today`}</div></article>
              <article className="admin-metric"><div className="admin-metric-label">Impressions</div><strong className="admin-metric-value">{atLeast(totals.impressions.toLocaleString('en-IN'))}</strong><div className="admin-metric-basis">{totals.activeLaunches} ad{totals.activeLaunches === 1 ? '' : 's'} active at the last read</div></article>
              <article className="admin-metric"><div className="admin-metric-label">Landing page views</div><strong className="admin-metric-value">{atLeast(totals.landingPageViews.toLocaleString('en-IN'))}</strong><div className="admin-metric-basis">{allUnknown ? 'cost unknown' : totals.landingPageViews ? `${inr(Math.round(totals.spendMinor / totals.landingPageViews), totals.currency)} each` : 'none yet'}</div></article>
            </div>
            {totals.incompleteLaunches > 0 && <div style={{ padding: '0 25px 25px' }}><Notice tone="warning"><strong>Figures for {totals.incompleteLaunches} ad{totals.incompleteLaunches === 1 ? ' are' : 's are'} unknown or stale.</strong><p>Unknown figures are left out rather than counted as zero, so the true totals may be higher. Sync now, or check Meta Ads Manager.</p></Notice></div>}
          </Panel>
          <Panel id="recommendations" title="Recommendations" subtitle="Advice from your caps and the latest complete figures. Nothing is applied automatically: make any change in Meta Ads Manager.">
            {overview.recommendations.length === 0 ? <Empty title="Nothing to do right now">No ad needs a change. Sync now for the latest figures.</Empty> : <ul style={{ display: 'grid', gap: 10, padding: '0 25px 25px', listStyle: 'none', margin: 0 }}>{[...actionRecs, ...infoRecs].map(rec => <Recommendation key={rec.id} rec={rec} />)}</ul>}
          </Panel>
          <Panel id="launches" title="Meta ads" subtitle="Each row is one ad as read from Meta. There are no pause or resume buttons yet; change ads in Meta Ads Manager.">
            {overview.launches.length === 0 ? <Empty title="No launches yet">Launches appear here once an approved idea is set up in Meta.</Empty> : <div className="admin-table-scroll"><table><thead><tr><th>Ad</th><th>Live status</th><th>Budget / day</th><th>Spend</th><th>Impressions</th><th>Link clicks</th><th>Link CTR</th><th>Landing page views</th><th>Cost per view</th><th>Figures</th></tr></thead><tbody>{overview.launches.map(launch => <LaunchRow key={launch.id} launch={launch} idea={ideaById.get(launch.ideaId)} />)}</tbody></table></div>}
          </Panel>
          <Panel id="ideas" title="Ideas" subtitle="Every concept, script and version the agency has made, with its approved files.">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', padding: '0 25px 25px' }}><NewIdea busy={busy} run={run} />{overview.ideas.map(idea => <IdeaCard key={idea.id} idea={idea} overview={overview} busy={busy} run={run} />)}</div>
          </Panel>
          <Panel id="queue" title="Production queue" subtitle="Ideas sent to ad creation. The ad team picks them up and asks for your approval before launch.">
            {overview.requests.length === 0 ? <Empty title="The queue is empty">Use "Send to ad creation" on an idea to queue it.</Empty> : <div className="admin-table-scroll"><table><thead><tr><th>Idea</th><th>Status</th><th>Notes</th><th>Queued</th></tr></thead><tbody>{overview.requests.map(request => <tr key={request.id}><td><strong>{ideaById.get(request.ideaId)?.title ?? 'Unknown idea'}</strong></td><td><Badge tone={request.status === 'done' ? 'good' : request.status === 'cancelled' ? 'neutral' : 'warning'}>{readable(request.status)}</Badge></td><td>{request.note || '—'}</td><td>{utc(request.createdAt)}</td></tr>)}</tbody></table></div>}
          </Panel>
          <Panel id="controls" title="Caps and auto mode" subtitle="Your caps and thresholds shape the recommendations above." aside={<Badge tone="neutral">Auto mode: not available yet</Badge>}>
            <Thresholds overview={overview} owner={owner} busy={busy} run={run} />
          </Panel>
          <Panel id="audit" title="Audit log" subtitle="Every sync and every change on this page. Entries cannot be edited or deleted.">
            {overview.audit.length === 0 ? <Empty title="No changes yet">Changes appear here as they happen.</Empty> : <ul className="admin-audit-list">{overview.audit.map(entry => <li key={entry.id}><span className="admin-audit-dot" aria-hidden="true" /><div><strong>{readable(entry.action)}</strong> · {entry.actorId ? (entry.actorId === overview.actor.id ? 'you' : 'another admin') : 'system'} · {utc(entry.at)}<span className="admin-cell-note">{Object.entries(entry.details).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</span></div></li>)}</ul>}
          </Panel>
          <footer className="admin-workspace-footer"><LockKeyhole size={13} aria-hidden="true" />Private marketing workspace · reads from Meta, never changes it · every change here is audited</footer>
        </>}
      </main>
    </div>
  </div>;
}
