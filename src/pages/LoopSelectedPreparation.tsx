import { useEffect, useRef, useState } from 'react';
import type { LoopAction, LoopOpportunity, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

type SelectedAction = Extract<LoopAction, { action: 'start_selected_run' }>;
type Props = {
  snapshot: LoopSnapshot; owner: string; authority: number; ready: boolean; busy: boolean; hasEdits: boolean;
  draftRevision: number; hidden: boolean; requested?: { id: string; sequence: number };
  captureGuard: () => () => boolean;
  perform: (action: LoopAction, success?: string, resetProfile?: boolean, guard?: () => boolean) => Promise<LoopResponse | null>;
};
const methodKey = (provider: string, model: string, route = 'direct') => JSON.stringify([provider, model, route]);
const rulesKey = methodKey('rules', 'grounded-rules-v1');
const source = (o: LoopOpportunity) => ({ id: o.id, title: o.title, company: o.company, description: o.description, location: o.location, url: o.url, contact: o.contact, source: o.source, sourceKey: o.sourceKey, sourceCheckId: o.sourceCheckId ?? null, verification: o.verification });
const available = (o: LoopOpportunity) => !['applied', 'interview', 'offer', 'rejected', 'withdrawn'].includes(o.status) && o.verification !== 'closed_confirmed';

/** Page-memory request identity only. No consent is restored from storage or a URL. */
export default function LoopSelectedPreparation(props: Props) {
  const { snapshot, owner, authority, ready, busy, hasEdits, draftRevision, hidden, requested, captureGuard, perform } = props;
  const [ids, setIds] = useState<string[]>([]), [method, setMethod] = useState(rulesKey);
  const [consent, setConsent] = useState(false), [processing, setProcessing] = useState(false), [message, setMessage] = useState('');
  const revision = useRef(0), consentAt = useRef<number | null>(null), processingAt = useRef<number | null>(null);
  const request = useRef<{ scope: string; action: SelectedAction; confirmed?: boolean } | null>(null), inFlight = useRef(false), mounted = useRef(true);
  const lastRequested = useRef<number>(), lastContext = useRef('');
  const methods = [
    ...(snapshot.capabilities.rulesEngine ? [{ key: rulesKey, provider: 'rules' as const, model: 'grounded-rules-v1', label: 'Source-based preparation · no external AI', transport: undefined }] : []),
    ...snapshot.models.filter(m => m.ready).map(m => ({ ...m, key: methodKey(m.provider, m.model, m.transport), label: `${m.label}${m.transport === 'openrouter' ? ' via OpenRouter' : ''}` })),
  ];
  const chosen = methods.find(m => m.key === method);
  const selected = ids.map(id => snapshot.opportunities.filter(o => o.id === id));
  const scope = JSON.stringify([owner, authority, ready, snapshot.lifecycleGeneration, snapshot.profile, snapshot.claims, ids.map((id, i) => [id, selected[i].map(source)]), method, draftRevision, hasEdits]);
  // Invalidate in render as well as event handlers: an old handler cannot submit
  // between a source/lifetime change and a later effect.
  if (lastContext.current !== scope) {
    lastContext.current = scope; revision.current++; consentAt.current = null; processingAt.current = null;
    request.current = null;
    if (message) setMessage('');
    if (consent) setConsent(false); if (processing) setProcessing(false);
  }
  const previousHidden = useRef(hidden);
  if (previousHidden.current !== hidden) {
    previousHidden.current = hidden; revision.current++; consentAt.current = null; processingAt.current = null;
    if (consent) setConsent(false); if (processing) setProcessing(false);
  }
  function invalidate() { revision.current++; consentAt.current = null; processingAt.current = null; request.current = null; setConsent(false); setProcessing(false); setMessage(''); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!requested || requested.sequence === lastRequested.current) return;
    lastRequested.current = requested.sequence; invalidate(); setIds([requested.id]);
  }, [requested]);
  const confirmed = consent && consentAt.current === revision.current;
  const modelConfirmed = processing && processingAt.current === revision.current;
  const missing = selected.some(matches => matches.length !== 1);
  const unavailable = selected.some(matches => matches.length === 1 && !available(matches[0]));
  const retry = request.current?.scope === scope;
  const active = snapshot.runs.some(r => ['queued', 'running'].includes(r.status));
  const blocked = hidden || !ready || authority < 0 || hasEdits || !snapshot.profile || !Number.isSafeInteger(snapshot.lifecycleGeneration) || !snapshot.capabilities.cloudWorker || !chosen || ids.length < 1 || ids.length > 2 || missing || (!retry && (unavailable || active)) || snapshot.capabilities.dailyRunLimit < 1 || !snapshot.claims.some(c => c.status === 'active' && c.confirmed && c.shareable);
  async function submit() {
    if (blocked || busy || inFlight.current || !confirmed || consentAt.current !== revision.current || (chosen!.provider !== 'rules' && (!modelConfirmed || processingAt.current !== revision.current))) return;
    const parentCurrent = captureGuard(), atRevision = revision.current;
    const current = () => mounted.current && revision.current === atRevision && parentCurrent();
    if (!current()) return;
    if (!request.current || request.current.scope !== scope) request.current = { scope, action: {
      action: 'start_selected_run', expectedGeneration: snapshot.lifecycleGeneration, expectedVersion: snapshot.recordVersion,
      requestId: crypto.randomUUID(), opportunityIds: [...ids], prepareConsent: true,
      provider: chosen!.provider, model: chosen!.model, modelConsent: chosen!.provider !== 'rules',
      ...(chosen!.provider !== 'rules' ? { processingRoute: chosen!.transport ?? 'direct' as const } : {}),
    } };
    const action = structuredClone(request.current.action);
    inFlight.current = true; setMessage('');
    try {
      const result = await perform(action, undefined, false, current);
      if (!current()) return;
      if (!result) { setMessage('The result is not confirmed. Retry this same request, or refresh records to inspect its progress.'); return; }
      const receipt = result.selectedRun;
      if (!receipt || receipt.requestId !== action.requestId || receipt.generation !== action.expectedGeneration || JSON.stringify(receipt.opportunityIds) !== JSON.stringify(action.opportunityIds)) {
        setMessage('The returned selection could not be confirmed. Refresh records before continuing.'); return;
      }
      if (request.current) request.current.confirmed = true;
      consentAt.current = null; processingAt.current = null; setConsent(false); setProcessing(false);
      setMessage('Your chosen application preparation is recorded. Review its progress and exact outputs below; approval remains separate.');
    } finally { inFlight.current = false; }
  }
  return <section className="jl-panel" hidden={hidden} aria-label="Prepare chosen vacancies">
    <h2 id="jl-selected-prepare-heading" tabIndex={-1}>Prepare for a saved vacancy</h2>
    <p>Choose one or two saved vacancies. This preparation uses your saved, confirmed and shareable facts for only these choices. It does not check your inbox or discover other jobs.</p>
    {snapshot.opportunities.length === 0 && <p>Save a real vacancy in Opportunities first.</p>}
    <fieldset className="jl-form-fields" disabled={busy}>
      <legend>Choose vacancies in preparation order</legend>
      {snapshot.opportunities.map(o => <div key={o.id} className="jl-signal"><label className="jl-consent"><input type="checkbox" checked={ids.includes(o.id)} disabled={!ids.includes(o.id) && (ids.length >= 2 || !available(o))} onChange={e => { const checked = e.target.checked; invalidate(); setIds(old => checked ? [...old, o.id] : old.filter(id => id !== o.id)); }} /><span>{o.title} · {o.company || 'Company not supplied'}{ids.includes(o.id) ? ` · choice ${ids.indexOf(o.id) + 1}` : ''}</span></label>
        {!available(o) && <p className="jl-help">Not available for a new preparation: {o.verification === 'closed_confirmed' ? 'source closed' : o.verification === 'unverified' ? 'source unverified' : o.status}.</p>}
        <details><summary>Read saved vacancy · {o.title}</summary><p>{o.location}</p><pre>{o.description}</pre><p className="jl-help">{o.verification === 'user_provided' ? 'Supplied by you; current availability has not been independently verified.' : o.verification.replace(/_/g, ' ')}{o.sourceCheckId ? ' Linked to a saved CV check.' : ''}</p></details></div>)}
      {missing && <p role="alert">A chosen vacancy is missing or has conflicting records. No replacement was selected. Refresh or clear your choices.</p>}
      {ids.length > 0 && <button className="jl-button" type="button" onClick={() => { invalidate(); setIds([]); }}>Clear choices</button>}
      <label className="jl-field"><span>Method for chosen vacancies</span><select value={method} onChange={e => { invalidate(); setMethod(e.target.value); }}><option value="" disabled>Choose a configured method</option>{!chosen && method === rulesKey && <option value={rulesKey} disabled>Source-based preparation unavailable</option>}{methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
      {chosen && chosen.provider !== 'rules' && <label className="jl-consent"><input type="checkbox" checked={modelConfirmed} onChange={e => { processingAt.current = e.target.checked ? revision.current : null; setProcessing(e.target.checked); }} /><span>Allow {chosen.label} to process the selected vacancy text and my cleared claim wording and context for this request. My raw CV, name and contact line are not included.</span></label>}
      <label className="jl-consent"><input type="checkbox" checked={confirmed} onChange={e => { consentAt.current = e.target.checked ? revision.current : null; setConsent(e.target.checked); }} /><span>Prepare documents for only my chosen vacancies using this saved career record and method. I will review the outputs before approving them.</span></label>
      <button className="jl-button jl-button--primary" type="button" disabled={busy || blocked || !!request.current?.confirmed || !confirmed || chosen?.provider !== 'rules' && !modelConfirmed} onClick={() => void submit()}>{request.current?.confirmed ? 'Preparation recorded' : retry ? 'Retry this chosen preparation' : 'Prepare chosen vacancies'}</button>
    </fieldset>
    {hasEdits && <p className="jl-warning">Save or discard your career record and claim edits before preparing.</p>}
    {!snapshot.capabilities.cloudWorker && <p className="jl-warning">Preparation is currently unavailable. Your saved vacancies remain available.</p>}
    {!chosen && <p className="jl-warning">Choose an available method. No provider is substituted automatically.</p>}
    {active && !retry && <p className="jl-help">A preparation is already active. Review its progress before starting another.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
