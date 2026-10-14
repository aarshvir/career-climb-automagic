import { useEffect, useId, useRef, useState } from 'react';
import { listFreeChecks, type FreeCvCheck } from '@/lib/free-check-api';
import { savedCheckContinuationPath } from '@/lib/saved-check-continuation';
import './LoopSavedCheckImport.css';

export type SavedCheckScope = { ownerId: string; generation: number; authority: number };
export type SavedCheckVersion = 'final' | 'source';

export function usableSavedCheck(check: FreeCvCheck, ownerId: string): boolean {
  return check.user_id === ownerId && check.status === 'approved' && !!savedCheckContinuationPath(check.id)
    && typeof check.job_title === 'string' && check.job_title.trim().length >= 2 && check.job_title.length <= 200
    && typeof check.company === 'string' && check.company.length <= 200
    && typeof check.job_description === 'string' && check.job_description.trim().length >= 80 && check.job_description.length <= 20000
    && [check.reviewed_text, check.original_text].every(text => typeof text === 'string' && text.trim().length >= 80 && text.length <= 60000);
}

export default function LoopSavedCheckImport({ scope, intentId, busy, blockedReason, draftKey, needsReplacement, copyHeader, isCurrent, onUse, onClose }: {
  scope: SavedCheckScope; intentId: string | null; busy: boolean; blockedReason: string; draftKey: string; needsReplacement: boolean; copyHeader: boolean;
  isCurrent: (scope: SavedCheckScope) => boolean;
  onUse: (check: FreeCvCheck, version: SavedCheckVersion, scope: SavedCheckScope, replacementKey: string | null) => boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(!!intentId), [records, setRecords] = useState<FreeCvCheck[]>([]);
  const [selectedId, setSelectedId] = useState(''), [version, setVersion] = useState<SavedCheckVersion>('final');
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [sourceConfirmed, setSourceConfirmed] = useState(false), [replacementKey, setReplacementKey] = useState<string | null>(null);
  const callbacks = useRef({ isCurrent, onUse, onClose }); callbacks.current = { isCurrent, onUse, onClose };
  const choiceId = useId(), versionName = useId();
  const scopeKey = `${scope.ownerId}:${scope.authority}:${scope.generation}`;
  useEffect(() => { if (intentId) setOpen(true); }, [intentId]);
  useEffect(() => {
    setVersion('final'); setSourceConfirmed(false); setReplacementKey(null);
  }, [selectedId, intentId]);
  useEffect(() => {
    if (!open || !callbacks.current.isCurrent(scope)) return;
    let active = true;
    setLoading(true); setError(''); setRecords([]); setSelectedId(''); setReplacementKey(null); setSourceConfirmed(false); setVersion('final');
    void listFreeChecks(scope.ownerId).then(rows => {
      if (!active || !callbacks.current.isCurrent(scope)) return;
      if (rows.some(row => row.user_id !== scope.ownerId)) throw new Error('Your account changed. Reopen your saved checks from your own account.');
      const owned = rows.filter(row => usableSavedCheck(row, scope.ownerId));
      const requested = intentId ? owned.find(row => row.id.toLowerCase() === intentId.toLowerCase()) : undefined;
      const available = owned.slice(0, 50);
      if (requested && !available.some(row => row.id === requested.id)) available.push(requested);
      setRecords(available);
      if (intentId) {
        const found = available.find(row => row.id.toLowerCase() === intentId.toLowerCase());
        if (found) setSelectedId(found.id);
        else setError('That saved check is not available in this account. Choose another check or return to your CV check.');
      }
    }).catch(() => {
      if (active && callbacks.current.isCurrent(scope)) setError('Your saved checks could not be loaded. Retry, or keep working with your current draft.');
    }).finally(() => { if (active && callbacks.current.isCurrent(scope)) setLoading(false); });
    return () => { active = false; };
  }, [open, scopeKey, intentId, retry]);
  const selected = records.find(row => row.id === selectedId);
  const source = selected ? version === 'final' ? selected.reviewed_text : selected.original_text : '';
  const replacementConfirmed = replacementKey === draftKey;
  function close() { setOpen(false); setRecords([]); setSelectedId(''); setReplacementKey(null); setSourceConfirmed(false); callbacks.current.onClose(); }
  function useCheck() {
    if (!selected || busy || loading || blockedReason || !callbacks.current.isCurrent(scope)
      || (version === 'source' && !sourceConfirmed) || (needsReplacement && !replacementConfirmed)) return;
    if (callbacks.current.onUse(selected, version, scope, replacementKey)) close();
  }
  return <section className="jl-panel jl-saved-check" aria-label="Continue a saved CV check">
    <h2>Continue from a saved CV check</h2>
    <p>Copy your reviewed CV and vacancy into editable drafts here. Review and save them separately.</p>
    <p className="jl-help">Existing target roles stay unchanged. If they are blank, the saved role is a starting point to review.</p>
    {copyHeader && <p className="jl-help">For this new, untouched record, your name and contact line may be copied from the selected CV. Review them before saving.</p>}
    {!open ? <button type="button" className="jl-button" disabled={busy} onClick={() => setOpen(true)}>Choose a saved CV check</button> : <>
      {loading && <p role="status">Loading your saved checks…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && <><div className="jl-field"><label htmlFor={choiceId}>Saved CV check</label><select id={choiceId} value={selectedId} disabled={busy} onChange={event => setSelectedId(event.target.value)}><option value="">Choose a saved check</option>{records.map(row => <option key={row.id} value={row.id}>{row.job_title}{row.company ? ` · ${row.company}` : ''}</option>)}</select></div>{!error && records.length === 0 && <p>No approved saved checks are available yet. Save a reviewed check in your account, or use your current CV here.</p>}</>}
      {selected && <div>
        <h3>{selected.job_title}{selected.company ? ` · ${selected.company}` : ''}</h3>
        <fieldset className="jl-profile-form" disabled={busy}><legend>CV version to copy</legend>
          <label><input type="radio" name={versionName} checked={version === 'final'} onChange={() => { setVersion('final'); setSourceConfirmed(false); setReplacementKey(null); }} /> Reviewed final CV (recommended)</label>
          <label><input type="radio" name={versionName} checked={version === 'source'} onChange={() => { setVersion('source'); setSourceConfirmed(false); setReplacementKey(null); }} /> Original source CV instead</label>
        </fieldset>
        {version === 'source' && <><p className="jl-warning">The original source may contain details you removed from the final CV. Review it before copying.</p><label className="jl-consent"><input type="checkbox" checked={sourceConfirmed} disabled={busy} onChange={event => setSourceConfirmed(event.target.checked)} /><span>I reviewed the original source and want to copy it instead of the final CV.</span></label></>}
        <details><summary>Read the exact CV text to copy</summary><pre>{source}</pre></details>
        <p><strong>Vacancy:</strong> {selected.job_description.slice(0, 280)}{selected.job_description.length > 280 ? '…' : ''}</p>
        <details><summary>Read the full saved vacancy</summary><pre>{selected.job_description}</pre></details>
        {needsReplacement && <><p className="jl-warning">This replaces the current CV source and vacancy title, company and description. The old vacancy link, location and recruiter details will be cleared. {copyHeader ? 'This new record may copy a name and contact line from the selected CV.' : 'Your profile name and contact line stay as entered, including blank fields.'} Existing target roles and other preferences stay in place.</p><label className="jl-consent"><input type="checkbox" checked={replacementConfirmed} disabled={busy} onChange={event => setReplacementKey(event.target.checked ? draftKey : null)} /><span>Replace these local drafts. I can restore the previous draft on this page until I save, leave or saved records change.</span></label></>}
        {blockedReason && <p className="jl-warning">{blockedReason}</p>}
        <button type="button" className="jl-button jl-button--primary" disabled={busy || loading || !!blockedReason || (version === 'source' && !sourceConfirmed) || (needsReplacement && !replacementConfirmed) || !isCurrent(scope)} onClick={useCheck}>Use this saved check</button>
      </div>}
      <div className="jl-actions"><button type="button" className="jl-button" disabled={loading || busy} onClick={() => setRetry(value => value + 1)}>Refresh saved checks</button><button type="button" className="jl-button jl-button--quiet" onClick={close}>Close saved checks</button></div>
    </>}
  </section>;
}
