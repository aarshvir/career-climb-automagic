import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { mvpSupabase, type ApplicationPack, type TrackedApplication } from '@/lib/cv-database';
import { listFreeChecks, type FreeCvCheck } from '@/lib/free-check-api';
import { callJobLoop } from '@/lib/job-loop-api';
import { registerTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import { loopDateLabel } from '@/lib/loop-calendar';
import { applicationHomeSource, buildApplicationHome, readApplicationHomeSelection, resolveApplicationHomeSelection, type ApplicationHomeRow, type ApplicationHomeSource, type ExistingApplicationLoop } from '@/lib/application-home';
import { createReviewedCvBlob } from '@/lib/document-export';
import { downloadBlob, safeDocumentFilename } from '@/lib/document-download';
import { getEntitlement } from '@/lib/workspace-api';
import type { TailorAccess } from '@/lib/tailor-access';
import TailorPlanLine from '@/components/TailorPlanLine';
import './ApplicationsHome.css';

type Data = { checks: FreeCvCheck[]; packs: ApplicationPack[]; trackers: TrackedApplication[]; loop: ExistingApplicationLoop };
type SourceState<T> = { phase: 'loading' | 'ready' | 'error'; data: T | null };
type Sources = { [K in ApplicationHomeSource]: SourceState<Data[K]> };
type Scope = { ownerId: string; authority: number; key: string };
const sources: ApplicationHomeSource[] = ['checks', 'packs', 'trackers', 'loop'];
const labels: Record<ApplicationHomeSource, string> = { checks: 'Saved CV checks', packs: 'Application packs', trackers: 'Application tracking', loop: 'Automated Job Loop' };
// Query parameters a payment provider adds when it returns from checkout. They are never selections.
const checkoutReturnParams = ['checkout', 'payment_id', 'status', 'email', 'subscription_id', 'license_key'];
/** "Your plan" line. An unavailable summary is simply not shown; it never hides saved work. */
function YourPlan({ ownerId, refresh }: { ownerId: string; refresh: number }) {
  const [loaded, setLoaded] = useState<{ ownerId: string; access: TailorAccess | null } | null>(null);
  useEffect(() => {
    let live = true;
    void getEntitlement().then(entitlement => { if (live) setLoaded({ ownerId, access: entitlement.tailorAccess ?? null }); })
      .catch(() => { if (live) setLoaded({ ownerId, access: null }); });
    return () => { live = false; };
  }, [ownerId, refresh]);
  return loaded?.ownerId === ownerId && loaded.access ? <TailorPlanLine className="ah-plan" access={loaded.access} /> : null;
}
const emptySources = (): Sources => ({ checks: { phase: 'loading', data: null }, packs: { phase: 'loading', data: null }, trackers: { phase: 'loading', data: null }, loop: { phase: 'loading', data: null } });
async function requireOwner(ownerId: string) {
  const { data, error } = await mvpSupabase.auth.getUser();
  if (error || data.user?.id !== ownerId) throw new Error('The signed-in account could not be confirmed.');
}
/** Independent, read-only sources: CV storage and entitlement availability cannot hide these records. */
export async function readApplicationHomePacks(ownerId: string): Promise<ApplicationPack[]> {
  await requireOwner(ownerId);
  const { data, error } = await mvpSupabase.from('application_packs').select('*').eq('user_id', ownerId).order('created_at', { ascending: false });
  await requireOwner(ownerId);
  if (error || !Array.isArray(data) || data.some(row => row.user_id !== ownerId)) throw new Error('Application packs could not be loaded for this account.');
  return data;
}
export async function readApplicationHomeTrackers(ownerId: string): Promise<TrackedApplication[]> {
  await requireOwner(ownerId);
  const { data, error } = await mvpSupabase.from('tracked_applications').select('*').eq('user_id', ownerId).order('created_at', { ascending: false });
  await requireOwner(ownerId);
  if (error || !Array.isArray(data) || data.some(row => row.user_id !== ownerId)) throw new Error('Application tracking could not be loaded for this account.');
  return data;
}
async function readSource<K extends ApplicationHomeSource>(source: K, ownerId: string): Promise<Data[K]> {
  if (source === 'checks') {
    const rows = await listFreeChecks(ownerId);
    if (rows.some(row => row.user_id !== ownerId)) throw new Error('The saved checks did not match this account.');
    return rows as Data[K];
  }
  if (source === 'packs') return await readApplicationHomePacks(ownerId) as Data[K];
  if (source === 'trackers') return await readApplicationHomeTrackers(ownerId) as Data[K];
  const response = await callJobLoop(ownerId, { action: 'get_existing' });
  if (response.existingState === 'absent') return { existingState: 'absent' } as Data[K];
  if (response.existingState === 'erasing' && Number.isSafeInteger(response.erasureGeneration) && response.erasureGeneration >= 0) return { existingState: 'erasing', erasureGeneration: response.erasureGeneration } as Data[K];
  const generation = response.snapshot?.lifecycleGeneration;
  if (response.existingState === 'active' && response.snapshot && typeof generation === 'number' && Number.isSafeInteger(generation) && generation >= 0) return { existingState: 'active', snapshot: response.snapshot } as Data[K];
  throw new Error('The existing Automated Job Loop state could not be confirmed.');
}

export default function ApplicationsHome() {
  const { user, loading: authLoading, authError, retryConnection } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  if (!authLoading && !authError) registerTrackingDraftOwner(user?.id ?? null);
  const authority = user ? trackingDraftAuthority(user.id) : -1;
  const scope: Scope | null = user && !authLoading && !authError && authority >= 0 ? { ownerId: user.id, authority, key: `${user.id}:${authority}` } : null;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const previousScope = useRef<string | null>(null);
  const mounted = useRef(false), requests = useRef<Record<ApplicationHomeSource, number>>({ checks: 0, packs: 0, trackers: 0, loop: 0 });
  const [view, setView] = useState<{ key: string; sources: Sources }>({ key: '', sources: emptySources() });
  const [query, setQuery] = useState('');
  const [deliberateChoice, setDeliberateChoice] = useState<{ id: string; scopeKey: string } | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState(''), [planRefresh, setPlanRefresh] = useState(0), [awaitingPass, setAwaitingPass] = useState(false);
  const checkoutReturn = searchParams.get('checkout');
  // Returning from checkout: drop the provider's parameters (including the buyer's email) from the
  // address bar. The URL is never proof of payment; only the webhook adds the pass.
  useEffect(() => {
    if (!checkoutReturn) return;
    setCheckoutNotice(checkoutReturn === 'success' ? 'Checkout returned. Your pass appears under “Your plan” once Dodo Payments confirms the payment, usually within a minute.' : '');
    setAwaitingPass(checkoutReturn === 'success');
    const next = new URLSearchParams(searchParams);
    for (const name of checkoutReturnParams) next.delete(name);
    setSearchParams(next, { replace: true });
  }, [checkoutReturn]);
  // Re-read the plan a few times while the payment webhook arrives.
  useEffect(() => {
    if (!awaitingPass) return;
    let attempts = 0;
    const timer = setInterval(() => { setPlanRefresh(value => value + 1); if (++attempts >= 6) { clearInterval(timer); setAwaitingPass(false); } }, 5000);
    return () => clearInterval(timer);
  }, [awaitingPass]);
  const detailRegion = useRef<HTMLElement | null>(null);
  const current = useCallback((captured: Scope) => mounted.current && scopeRef.current?.key === captured.key && trackingDraftAuthority(captured.ownerId) === captured.authority, []);
  const load = useCallback((source: ApplicationHomeSource, captured: Scope) => {
    const request = ++requests.current[source];
    if (!current(captured)) return;
    setView(previous => previous.key === captured.key ? { key: previous.key, sources: { ...previous.sources, [source]: { phase: 'loading', data: null } } } : previous);
    void readSource(source, captured.ownerId).then(data => {
      if (!current(captured) || requests.current[source] !== request) return;
      setView(previous => previous.key === captured.key ? { key: previous.key, sources: { ...previous.sources, [source]: { phase: 'ready', data } } } : previous);
    }).catch(() => {
      if (!current(captured) || requests.current[source] !== request) return;
      setView(previous => previous.key === captured.key ? { key: previous.key, sources: { ...previous.sources, [source]: { phase: 'error', data: null } } } : previous);
    });
  }, [current]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; for (const source of sources) requests.current[source]++; }; }, []);
  useEffect(() => {
    for (const source of sources) requests.current[source]++;
    setQuery('');
    setDeliberateChoice(null);
    setView({ key: scope?.key ?? '', sources: emptySources() });
    if (scope) {
      if (previousScope.current && previousScope.current !== scope.key) setSearchParams({}, { replace: true });
      previousScope.current = scope.key;
    }
    if (scope) for (const source of sources) load(source, scope);
  }, [scope?.key, load]);
  const selectionParams = new URLSearchParams(searchParams);
  for (const name of checkoutReturnParams) selectionParams.delete(name);
  const selection = readApplicationHomeSelection(selectionParams.toString() ? `?${selectionParams.toString()}` : '');
  const state = scope && view.key === scope.key ? view.sources : emptySources();
  const rows = scope ? buildApplicationHome(scope.ownerId, { checks: state.checks.data ?? [], packs: state.packs.data ?? [], trackers: state.trackers.data ?? [], loop: state.loop.data }) : [];
  const selected = resolveApplicationHomeSelection(rows, selection.id);
  const selectedSource = selection.id ? applicationHomeSource(selection.id) : null;
  const linkedSelection = selection.id?.startsWith('tracker:') ? rows.find(row => (row.source === 'packs' || row.source === 'checks') && row.progress.some(progress => `tracker:${progress.id}` === selection.id)) : null;
  const visibleRows = rows.filter(row => `${row.title} ${row.company} ${row.relatedSources?.map(source => `${source.title} ${source.company}`).join(' ') ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const allReady = sources.every(source => state[source].phase === 'ready');
  useEffect(() => {
    if (!scope || !current(scope) || deliberateChoice?.scopeKey !== scope.key || deliberateChoice.id !== selected?.id) return;
    detailRegion.current?.focus({ preventScroll: true });
    detailRegion.current?.scrollIntoView?.({ block: 'start' });
    setDeliberateChoice(null);
  }, [deliberateChoice, selected?.id, scope?.key, current]);
  function choose(row: ApplicationHomeRow) {
    if (scope && current(scope)) {
      setDeliberateChoice({ id: row.id, scopeKey: scope.key });
      setSearchParams({ item: row.id });
    }
  }
  return <main className="applications-home"><Helmet><title>Your applications | Jobvance</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header className="ah-heading"><div><p className="ah-eyebrow">YOUR JOB SEARCH</p><h1>Your applications</h1><p>Find the job, see your saved work, and pick up where you left off.</p></div><Link className="ah-button ah-button--primary" to="/check">Check a CV against a job</Link></header>
    {authLoading || !authError && user && authority < 0 ? <p role="status">Confirming your account…</p> : authError ? <section className="ah-notice" role="alert"><h2>Confirm your account to see saved work</h2><p>Your applications stay hidden until your sign-in is confirmed.</p><button className="ah-button" onClick={retryConnection}>Retry account connection</button></section> : !scope ? <section className="ah-notice"><h2>Sign in to see your applications</h2><p>Your private CVs and progress are only shown to your account.</p><Link className="ah-button" to="/auth?next=%2Fapplications">Sign in</Link></section> : <>
      {allReady ? <section className="ah-source-status ah-source-status--ready" aria-label="Saved work sources"><span role="status">All saved work loaded</span><button className="ah-text-button" onClick={() => { for (const source of sources) load(source, scope); }}>Refresh applications</button></section> : <section className="ah-source-status" aria-label="Saved work sources">{sources.filter(source => state[source].phase !== 'ready').map(source => <div key={source}><strong>{labels[source]}</strong>{state[source].phase === 'loading' ? <span role="status">Loading…</span> : state[source].phase === 'error' ? <><span role="alert">Unavailable. Other saved work is still shown.</span><button className="ah-text-button" onClick={() => load(source, scope)}>Retry {labels[source].toLowerCase()}</button></> : <span>Loaded</span>}</div>)}<button className="ah-text-button" onClick={() => { for (const source of sources) load(source, scope); }}>Refresh applications</button></section>}
      <YourPlan ownerId={scope.ownerId} refresh={planRefresh} />
      {checkoutNotice && <p className="ah-notice" role="status">{checkoutNotice}</p>}
      {state.loop.data?.existingState === 'absent' && <p className="ah-subtle">No active Automated Job Loop record. Viewing this page does not create one.</p>}
      {state.loop.data?.existingState === 'erasing' && <p className="ah-notice">Your Automated Job Loop erasure is unfinished. Its previous CVs and vacancies are hidden. <Link to="/loop">Review remaining erasure</Link></p>}
      
      <div className="ah-layout"><section className="ah-list-panel" aria-label="Saved applications"><label htmlFor="application-search">Find a role or company</label><input id="application-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Role or company" />
        <p className="ah-subtle">{rows.length} loaded {rows.length === 1 ? 'item' : 'items'}{!allReady ? ' · some sources are still loading or unavailable' : ''}</p>
        {visibleRows.length ? <ul className="ah-list">{visibleRows.map(row => <li key={row.id}><button className={`ah-row${selected?.id === row.id ? ' ah-row--selected' : ''}`} aria-pressed={selected?.id === row.id} onClick={() => choose(row)}><span className="ah-eyebrow">{row.sourceLabel}</span><strong>{row.title || 'Untitled saved role'}</strong><span>{row.company || 'Company not recorded'}</span><span className="ah-row-state">{row.documents[0]?.state ?? 'Tracking entry'} · {row.progress.length ? [...new Set(row.progress.map(progress => progress.status))].join(', ') : state.trackers.phase !== 'ready' && (row.source === 'packs' || row.source === 'checks') ? 'Tracking not loaded' : 'No progress recorded'}</span><span className="ah-subtle">Last recorded: {loopDateLabel(row.lastRecordedAt)}</span></button></li>)}</ul> : <p>{rows.length ? 'No loaded roles match your search.' : allReady ? <>No applications yet. Start with a job you want: add your CV and the job description, and we will tailor a version for it. <Link to="/check">Tailor my CV for a job</Link></> : 'Your loaded applications will appear here. You can still start a free CV check.'}</p>}
      </section><section ref={detailRegion} tabIndex={-1} className="ah-detail" aria-label="Application details" aria-live="polite">
        {selection.invalid ? <><h2>This selection is not valid</h2><p>Choose an application from your list. No other item has been opened.</p></> : selected ? <ApplicationDetail row={selected} trackersAvailable={state.trackers.phase === 'ready'} /> : selectedSource && state[selectedSource].phase === 'error' ? <><h2>This application's source is unavailable</h2><p>Retry {labels[selectedSource].toLowerCase()} to confirm this exact item. Another application has not been selected.</p><button className="ah-button" onClick={() => load(selectedSource, scope)}>Retry this source</button></> : selectedSource && state[selectedSource].phase === 'loading' ? <p role="status">Checking the selected application…</p> : linkedSelection ? <><h2>This tracking entry is grouped with its {linkedSelection.source === 'checks' ? 'saved check' : 'pack'}</h2><p>Its recorded {linkedSelection.source === 'checks' ? 'saved check' : 'pack'} link is now available.</p><button className="ah-button" onClick={() => choose(linkedSelection)}>View the linked {linkedSelection.source === 'checks' ? 'check' : 'pack'} and progress</button></> : selection.id ? <><h2>This application is no longer available here</h2><p>It may have been deleted, belong to a different Automated Job Loop lifetime, or be outside the current results. Choose another item; no substitute has been opened.</p></> : <><h2>Choose an application</h2><p>Your saved vacancy, CV versions, notes and next action will appear here.</p></>}
      </section></div>
    </>}
  </main>;
}
function CheckActions({ row }: { row: ApplicationHomeRow }) {
  const [busy, setBusy] = useState(''), [message, setMessage] = useState('');
  const final = row.documents.find(document => document.id.endsWith(':final'));
  const checkId = row.id.slice('check:'.length);
  if (row.source !== 'checks' || !final || final.state !== 'Reviewed check saved' || !/^[0-9a-f-]{36}$/i.test(checkId)) return null;
  async function download(format: 'pdf' | 'docx') {
    if (busy) return;
    setBusy(format); setMessage('');
    try { const blob = await createReviewedCvBlob(final!.text, format, row.title || 'CV'); downloadBlob(blob, `${safeDocumentFilename(`CV-${row.title || 'application'}`)}.${format}`); setMessage(`${format === 'pdf' ? 'PDF' : 'Word'} download requested.`); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : 'The download could not be prepared. Reopen the check to download it.'); }
    finally { setBusy(''); }
  }
  return <div className="ah-actions"><button type="button" className="ah-button ah-button--primary" disabled={!!busy} onClick={() => void download('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download CV (PDF)'}</button><button type="button" className="ah-button" disabled={!!busy} onClick={() => void download('docx')}>{busy === 'docx' ? 'Preparing…' : 'Download Word'}</button><Link className="ah-button" to={`/check?reuseCheck=${checkId}`}>Tailor for another job</Link>{message && <p role="status" className="ah-subtle">{message}</p>}</div>;
}
function ApplicationDetail({ row, trackersAvailable }: { row: ApplicationHomeRow; trackersAvailable: boolean }) {
  return <article><p className="ah-eyebrow">{row.sourceLabel}</p><h2>{row.title || 'Untitled saved role'}</h2><p className="ah-company">{row.company || 'Company not recorded'}</p>
    <CheckActions row={row} />
    <div className="ah-actions">{row.href ? <Link className={`ah-button${row.source === 'checks' ? '' : ' ah-button--primary'}`} to={row.href}>{row.source === 'checks' ? 'Open and edit' : row.action}</Link> : <p role="alert">This record's exact continuation link could not be confirmed. Refresh before continuing.</p>}{row.relatedSources?.map(source => source.href ? <Link key={source.id} className="ah-button" to={source.href}>{source.action}</Link> : <p key={source.id} role="alert">The exact vacancy link could not be confirmed.</p>)}</div>
    <p className="ah-subtle">{row.note}</p>
    {(row.source === 'packs' || row.source === 'checks') && !trackersAvailable && <p className="ah-subtle">Linked tracking information is not currently loaded. The saved document is still available.</p>}
    <section><h3>Vacancy</h3>{row.vacancy ? <pre>{row.vacancy}</pre> : <p>No vacancy description is stored with this tracking entry.</p>}{row.employerUrl && <a href={row.employerUrl} target="_blank" rel="noopener noreferrer">Open recorded vacancy link</a>}</section>
    {row.relatedSources?.map(source => <section key={source.id} aria-label="Linked Automated Job Loop vacancy"><h3>Automated Job Loop vacancy</h3><p>{source.title} · {source.company}</p>{source.vacancy === row.vacancy ? <p>The vacancy text matches the saved check.</p> : <><p>This vacancy text differs from the saved check above.</p><pre>{source.vacancy || 'No vacancy text stored.'}</pre></>}{source.employerUrl && <a href={source.employerUrl} target="_blank" rel="noopener noreferrer">Open linked vacancy posting</a>}</section>)}
    <section><h3>Documents</h3>{row.documents.length ? row.documents.map(document => <details className="ah-document" key={document.id}><summary>{document.label} <span>{document.state}</span></summary>{document.reasons.length > 0 && <ul>{document.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}<pre>{document.text || 'No CV text stored for this version.'}</pre>{document.evidence && <details><summary>Evidence notes for this output</summary><pre>{document.evidence}</pre></details>}</details>) : <p>{row.source === 'loop' ? 'No output attempt is included in the recent loaded results. Open this vacancy in your Automated Job Loop to review its current work.' : 'No CV document is linked to this tracking entry.'}</p>}</section>
    <section><h3>Reported progress</h3>{row.progress.length ? row.progress.map(progress => <div className="ah-progress" key={progress.sourceLabel ? progress.sourceLabel + progress.id : progress.id}>{progress.sourceLabel && <h4>{progress.sourceLabel}</h4>}<p><strong>{progress.status}</strong>{row.progress.length > 1 && ` · ${progress.title}${progress.company ? ` · ${progress.company}` : ''}`}</p><p>Applied date: {loopDateLabel(progress.appliedAt)} · Follow-up: {loopDateLabel(progress.followUpAt)}</p><h4>Notes</h4>{progress.notes ? <pre>{progress.notes}</pre> : <p>No notes recorded.</p>}{progress.href && (row.source === 'packs' || row.source === 'checks') && <Link to={progress.href}>{progress.action || 'Update this tracking entry'}</Link>}</div>) : <p>{(row.source === 'packs' || row.source === 'checks') && !trackersAvailable ? 'Tracking is not currently available. Retry its source above.' : 'No application progress is linked to this saved document.'}</p>}</section>
  </article>;
}
