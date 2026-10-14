import { useState } from 'react';
import { ExternalLink, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import type { AdminAction, AdminConfigInput, AdminProviderStatus, AdminResponse, AdminSnapshot } from '@/lib/admin-types';
import { Badge, Empty, Metrics, Panel } from './AdminShared';
import { usd, utc } from './admin-format';

type RunAction = (action: AdminAction) => Promise<AdminResponse | void>;
function OwnerControls({ snapshot, busy, stale, onAction }: { snapshot: AdminSnapshot; busy: boolean; stale: boolean; onAction: RunAction }) {
  const [draft, setDraft] = useState<AdminConfigInput>({ schedulerEnabled: snapshot.config.schedulerEnabled, routerEnabled: snapshot.config.routerEnabled, monthlyCapUsd: snapshot.config.monthlyCapUsd, defaultModel: snapshot.config.defaultModel, reasoning: 'medium' });
  const [capText, setCapText] = useState(String(snapshot.config.monthlyCapUsd));
  const cap = Number(capText);
  const capValid = capText.trim() !== '' && Number.isFinite(cap) && cap > 0 && cap <= snapshot.config.monthlyCapUsd;
  const dirty = draft.schedulerEnabled !== snapshot.config.schedulerEnabled || draft.routerEnabled !== snapshot.config.routerEnabled || draft.defaultModel !== snapshot.config.defaultModel || cap !== snapshot.config.monthlyCapUsd;
  return <Panel id="controls" title="Owner controls" subtitle="Changes take effect only after an explicit save. Every save checks the current version and adds an audit record." aside={<Badge>Version {snapshot.config.version}</Badge>}>
    {snapshot.actor.role !== 'owner' ? <Empty title="Owner access required">Your operational access does not include configuration changes. The server verifies privileges on every request.</Empty> : <form onSubmit={event => { event.preventDefault(); if (capValid && dirty && !busy && !stale) void onAction({ action: 'update_config', expectedVersion: snapshot.config.version, config: { ...draft, monthlyCapUsd: cap } }); }}>
      <div className="admin-control-grid">
        <label className="admin-check-control"><input type="checkbox" checked={draft.schedulerEnabled} disabled={busy || stale} onChange={event => setDraft({ ...draft, schedulerEnabled: event.target.checked })} /><span><strong>Allow existing schedules to run</strong><small>Pause or resume the dispatcher. Candidate consent and individual schedule settings still apply.</small></span></label>
        <label className="admin-check-control"><input type="checkbox" checked={draft.routerEnabled} disabled={busy || stale} onChange={event => setDraft({ ...draft, routerEnabled: event.target.checked })} /><span><strong>Allow OpenRouter processing</strong><small>Requires a valid server connection and explicit candidate consent. Existing schedules keep their chosen route.</small></span></label>
        <label className="admin-field">Shared monthly ceiling (USD)<input aria-label="Shared monthly ceiling (USD)" type="number" min="0.000001" max={snapshot.config.monthlyCapUsd} step="0.000001" value={capText} disabled={busy || stale} onChange={event => setCapText(event.target.value)} aria-describedby="admin-cap-help" aria-invalid={!capValid} /><small id="admin-cap-help">Greater than $0; can only be lowered from {usd(snapshot.config.monthlyCapUsd)}, within the $50 limit. AI, search, reviews and administrative calls share this UTC monthly ceiling.</small></label>
        <label className="admin-field">Default OpenRouter model<select aria-label="Default OpenRouter model" value={draft.defaultModel} disabled={busy || stale} onChange={event => setDraft({ ...draft, defaultModel: event.target.value as AdminConfigInput['defaultModel'] })}><option value="openai/gpt-6.1-sol">GPT 6.1 Sol · medium reasoning</option><option value="anthropic/claude-sonnet-5.5">Sonnet 5.5 · medium reasoning</option></select><small>The server validates supported models. Numeric calculations remain deterministic.</small></label>
      </div>
      <div className="admin-control-footer"><p><LockKeyhole size={15} aria-hidden="true" /> Saving does not purchase credits, enable checkout or consent candidates.</p><button className="admin-button admin-button--primary" type="submit" disabled={busy || stale || !capValid || !dirty}><Save size={15} aria-hidden="true" />{busy ? 'Saving…' : stale ? 'Refresh before saving' : 'Save controls'}</button></div>
      <p className="admin-source">Source: jobvance_admin_config. Last saved {utc(snapshot.config.updatedAt)}. Current version {snapshot.config.version}; no optimistic success is shown.</p>
    </form>}
  </Panel>;
}

function ProviderReadiness({ snapshot, busy, onAction }: { snapshot: AdminSnapshot; busy: boolean; onAction: RunAction }) {
  const [provider, setProvider] = useState<AdminProviderStatus | null>(snapshot.providerStatus);
  async function check() { const result = await onAction({ action: 'provider_status' }); if (result && result.providerStatus) setProvider(result.providerStatus); }
  return <Panel id="providers" title="Model connection" subtitle="OpenRouter · server-managed credentials" aside={<ShieldCheck size={21} aria-hidden="true" />}>
    <div className="admin-provider-state"><span className="admin-provider-mark">OR</span><div><strong>{provider ? provider.configured ? 'Secret configured · ••••••••' : 'Secret not configured' : 'Connection status not checked'}</strong><p>{provider?.message || 'Check the sanitized connection status to see whether the server connection is available.'}</p></div><Badge tone={provider?.valid === true ? 'good' : provider?.valid === false ? 'bad' : 'neutral'}>{provider?.valid === true ? 'Valid' : provider?.valid === false ? 'Invalid' : 'Unverified'}</Badge></div>
    <div className="admin-provider-actions"><button type="button" className="admin-button" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check connection status'}</button><a href="https://supabase.com/docs/guides/functions/secrets" target="_blank" rel="noopener noreferrer">Supabase secrets setup <ExternalLink size={14} aria-hidden="true" /></a></div>
    <p className="admin-body-note">Credentials are managed in Supabase Edge Function secrets. Status checks return only presence, validity and a sanitized message. A valid connection does not certify a model’s availability.</p>
    <p className="admin-source">Source: server provider status. Checked {utc(provider?.checkedAt ?? null)}. This check does not generate commentary or purchase API credits.</p>
  </Panel>;
}

export default function AdminFounder({ snapshot, busy, stale = false, onAction }: { snapshot: AdminSnapshot; busy: boolean; stale?: boolean; onAction: RunAction }) {
  const { analytics } = snapshot;
  const budget = analytics.budget;
  return <>
    <div className="admin-founder-intro"><div><span className="admin-eyebrow">Evidence before growth</span><h2>What the pilot can tell us.</h2><p>Read observed milestones alongside the number of accounts measured. Historical guest visits and checks have no complete telemetry.</p></div><div className="admin-payment-lock"><LockKeyhole size={19} aria-hidden="true" /><strong>Payments disabled</strong><span>Free pilot · no checkout activation</span></div></div>
    <Panel id="milestones" title="Observed milestones" subtitle="Events across retained customer accounts within the selected UTC window. Synthetic QA accounts are excluded.">
      <Metrics metrics={analytics.milestones} snapshot={snapshot} />
    </Panel>
    <Panel id="funnel" title="Signup cohort funnel" subtitle="Current signup cohort, with each percentage relative to the previous stage. Missing visit telemetry prevents visitor-to-account conversion.">
      <Metrics metrics={analytics.funnel} snapshot={snapshot} />
    </Panel>
    <Panel id="retention" title="Retention evidence" subtitle="A returned record or repeated preparation run is a limited proxy for engagement; it does not prove successful hiring.">
      <Metrics metrics={analytics.retention} snapshot={snapshot} />
    </Panel>
    <div className="admin-two-columns">
      <Panel id="budget" title="Shared AI + search allowance" subtitle={`UTC month ${budget.month} · every external processing route shares one ceiling.`} aside={<Badge>{usd(budget.capUsd)} ceiling</Badge>}>
        <div className="admin-budget-head"><div><span>Recorded settled usage</span><strong>{usd(budget.actualUsd)}</strong></div><div><span>Remaining allowance</span><strong>{usd(budget.remainingUsd)}</strong></div></div>
        <meter className="admin-meter" min={0} max={budget.capUsd} value={Math.min(budget.committedUsd, budget.capUsd)} aria-label={`${usd(budget.committedUsd)} committed of ${usd(budget.capUsd)} monthly ceiling`} />
        <dl className="admin-budget-breakdown"><div><dt>Committed</dt><dd>{usd(budget.committedUsd)}</dd></div><div><dt>Reserved for pending calls</dt><dd>{usd(budget.reservedUsd)}</dd></div><div><dt>Uncertain usage retained</dt><dd>{usd(budget.uncertainUsd)}</dd></div><div><dt>Candidate actual spend</dt><dd>{usd(budget.candidateActualUsd)}</dd></div><div><dt>Admin + review actual spend</dt><dd>{usd(budget.adminActualUsd)}</dd></div></dl>
        <p className="admin-body-note">Reservations are held before calls. Uncertain usage stays committed until reconciled. The independent review batch has an additional {usd(budget.reviewBatchCapUsd)} limit within the shared ceiling.</p>
        <p className="admin-source">Source: {budget.source}. UTC calendar month {budget.month}, as of {utc(snapshot.generatedAt)}. Detailed usage may have been erased by a candidate; the shared committed ledger stays authoritative. Includes QA costs. Settled usage is not a provider invoice. Remaining = ceiling minus committed, with a floor of zero.</p>
      </Panel>
      <Panel id="revenue" title="Revenue & payment state" subtitle="Revenue is recognized only with an authoritative completed-payment source.">
        <div className="admin-revenue-state"><Badge>Checkout disabled</Badge><strong>{usd(analytics.revenue.recognizedUsd)}</strong><span>Recognized revenue</span></div><p className="admin-body-note">{analytics.revenue.message}</p><p className="admin-body-note">No-charge controls are explicit: this workspace has no payment activation, credit purchase, outreach send or application submission action.</p>
        <p className="admin-source">Source: server checkout configuration; revenue unavailable without verified completed-payment records. Selected UTC window {utc(snapshot.window.start)} to {utc(snapshot.window.end)}. An unknown amount is not zero revenue.</p>
      </Panel>
    </div>
    <ProviderReadiness snapshot={snapshot} busy={busy} onAction={onAction} />
    <OwnerControls key={snapshot.config.version} snapshot={snapshot} busy={busy} stale={stale} onAction={onAction} />
  </>;
}
