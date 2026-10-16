import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoopSelectedPreparation from '@/pages/LoopSelectedPreparation';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import type { LoopAction, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

const ids = [1, 2, 3].map(n => `${n}1111111-1111-4111-8111-111111111111`);
const labels = [/Role 1 · Employer 1/, /Role 2 · Employer 2/, /Role 3 · Employer 3/];
const permission = /Prepare documents for only my chosen vacancies/;
function fixture(): LoopSnapshot {
  return { lifecycleGeneration: 4, recordVersion: 7, profile: { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: 'Original CV source', revision: 1, updatedAt: '2026-10-16' },
    claims: [{ id: 'claim', revision: 1, status: 'active', createdAt: '2026-10-16', sourceKind: 'user_answer', sourceQuote: 'Maintained operations reports at Example Company.', phrasing: 'Maintained operations reports at Example Company.', context: 'Example Company', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true }],
    opportunities: ids.map((id, i) => ({ id, title: `Role ${i + 1}`, company: `Employer ${i + 1}`, description: 'Maintain operations reporting and document the data quality checks required for weekly reporting.', location: 'Dubai', url: 'https://example.invalid/job', contact: null, source: 'manual', sourceKey: id, verification: 'user_provided', checkedAt: '2026-10-16', status: 'saved', notes: '', followUpAt: null })),
    packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, allowDrafts: false, status: 'Not connected' } };
}
function setup() {
  const props = { snapshot: fixture(), owner: 'owner', authority: 1, ready: true, busy: false, hasEdits: false, draftRevision: 0, hidden: false, captureGuard: () => () => true, perform: vi.fn(async (_action: LoopAction, _success?: string, _reset?: boolean, _guard?: () => boolean) => null as LoopResponse | null) };
  const view = render(<LoopSelectedPreparation {...props} />);
  return { props, view, update: () => view.rerender(<LoopSelectedPreparation {...props} />) };
}
function choose(index = 2) { fireEvent.click(screen.getByLabelText(labels[index])); }
function approve() { fireEvent.click(screen.getByLabelText(permission)); }
function submit() { fireEvent.click(screen.getByRole('button', { name: /^(Prepare chosen vacancies|Retry this chosen preparation)$/ })); }
function receipt(action: LoopAction): LoopResponse {
  if (action.action !== 'start_selected_run') throw new Error('Wrong action');
  return { selectedRun: { requestId: action.requestId, runId: 'run', generation: action.expectedGeneration!, opportunityIds: [...action.opportunityIds] } };
}
afterEach(cleanup);

describe('deliberate selected preparation', () => {
  it('starts with no selection or consent and sends only the third exact vacancy', async () => {
    const { props } = setup(); expect(screen.getByRole('button', { name: 'Prepare chosen vacancies' })).toBeDisabled();
    choose(); expect(props.perform).not.toHaveBeenCalled(); approve(); submit();
    await waitFor(() => expect(props.perform).toHaveBeenCalledOnce());
    expect(props.perform.mock.calls[0][0]).toEqual({ action: 'start_selected_run', expectedGeneration: 4, expectedVersion: 7, requestId: expect.any(String), opportunityIds: [ids[2]], prepareConsent: true, provider: 'rules', model: 'grounded-rules-v1', modelConsent: false });
  });
  it('preserves ordered two-item selection and prevents a third choice', () => {
    const { props } = setup(); choose(2); choose(0); expect(screen.getByLabelText(labels[1])).toBeDisabled(); approve(); submit();
    expect(props.perform.mock.calls[0][0]).toMatchObject({ opportunityIds: [ids[2], ids[0]] });
  });
  it('invalidates consent for a batched A-to-B-to-A selection', () => {
    const { props } = setup(); choose(); approve();
    act(() => { choose(); choose(); submit(); }); expect(props.perform).not.toHaveBeenCalled(); expect(screen.getByLabelText(permission)).not.toBeChecked();
  });
  it('rejects a same-batch submit after selection changes', () => {
    const { props } = setup(); choose(); approve();
    act(() => { choose(0); submit(); }); expect(props.perform).not.toHaveBeenCalled();
  });
  it('deduplicates same-batch double submission and retains the exact action for ambiguous retries', async () => {
    const { props } = setup(); choose(); approve(); act(() => { submit(); submit(); });
    await screen.findByText(/The result is not confirmed/); expect(props.perform).toHaveBeenCalledOnce();
    submit(); await waitFor(() => expect(props.perform).toHaveBeenCalledTimes(2));
    expect(props.perform.mock.calls[1][0]).toEqual(props.perform.mock.calls[0][0]);
  });
  it('retains retry identity across tracking and unrelated vacancy changes', async () => {
    const { props, update } = setup(); choose(); approve(); submit(); await screen.findByText(/The result is not confirmed/);
    props.snapshot = structuredClone(props.snapshot); props.snapshot.recordVersion++;
    props.snapshot.opportunities[2].notes = 'Later progress'; props.snapshot.opportunities[2].status = 'interview'; props.snapshot.opportunities[0].description = 'Unrelated changed vacancy'; update();
    submit(); await waitFor(() => expect(props.perform).toHaveBeenCalledTimes(2));
    expect(props.perform.mock.calls[1][0]).toEqual(props.perform.mock.calls[0][0]);
  });
  it.each(['owner', 'authority', 'generation', 'profile', 'claims', 'source', 'provenance', 'draft', 'auth'] as const)('invalidates confirmation after %s changes', change => {
    const { props, update } = setup(); choose(); approve();
    if (change === 'owner') props.owner = 'other';
    if (change === 'authority') props.authority++;
    if (change === 'generation') props.snapshot.lifecycleGeneration!++;
    if (change === 'profile') props.snapshot.profile!.sourceText += ' corrected';
    if (change === 'claims') props.snapshot.claims[0].shareable = false;
    if (change === 'source') props.snapshot.opportunities[2].description += ' changed';
    if (change === 'provenance') props.snapshot.opportunities[2].sourceCheckId = ids[1];
    if (change === 'draft') props.draftRevision++;
    if (change === 'auth') props.ready = false;
    update(); expect(screen.getByLabelText(permission)).not.toBeChecked(); submit(); expect(props.perform).not.toHaveBeenCalled();
  });
  it('shows a missing selected source without substituting another vacancy', () => {
    const { props, update } = setup(); choose(); approve(); props.snapshot.opportunities.pop(); update();
    expect(screen.getByRole('alert')).toHaveTextContent('No replacement was selected'); submit(); expect(props.perform).not.toHaveBeenCalled();
  });
  it('fails closed on duplicate source identity', () => {
    const { props, update } = setup(); choose(); props.snapshot.opportunities.push({ ...props.snapshot.opportunities[2] }); update(); approve(); submit();
    expect(screen.getByRole('alert')).toHaveTextContent('conflicting records'); expect(props.perform).not.toHaveBeenCalled();
  });
  it('requires explicit available model and route consent, clearing it on method changes', () => {
    const { props, update } = setup(); props.snapshot.models = [{ provider: 'moonshot', model: 'configured-kimi', label: 'Kimi', transport: 'openrouter', ready: true, inputUsdPerMillion: 0, outputUsdPerMillion: 0 }]; update();
    choose(); fireEvent.change(screen.getByLabelText('Method for chosen vacancies'), { target: { value: JSON.stringify(['moonshot', 'configured-kimi', 'openrouter']) } }); approve(); submit(); expect(props.perform).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Allow Kimi via OpenRouter/)); submit();
    expect(props.perform.mock.calls[0][0]).toMatchObject({ provider: 'moonshot', modelConsent: true, processingRoute: 'openrouter' });
  });
  it('does not substitute an unavailable method', () => {
    const { props, update } = setup(); props.snapshot.capabilities.rulesEngine = false; update(); choose(); approve(); submit();
    expect(props.perform).not.toHaveBeenCalled(); expect(screen.getByText(/No provider is substituted automatically/)).toBeVisible();
  });
  it('checks the parent synchronous draft guard before dispatch', () => {
    const { props, update } = setup(); props.captureGuard = () => () => false; update(); choose(); approve(); submit(); expect(props.perform).not.toHaveBeenCalled();
  });
  it('ignores a delayed result after newer choices and leaves those choices intact', async () => {
    const { props } = setup(); let complete!: (value: LoopResponse) => void;
    props.perform.mockImplementation(() => new Promise(resolve => { complete = resolve; })); choose(); approve(); submit();
    const action = props.perform.mock.calls[0][0]; choose(2); choose(0);
    await act(async () => complete(receipt(action))); expect(screen.getByLabelText(labels[0])).toBeChecked(); expect(screen.queryByText(/Your chosen application preparation is recorded/)).not.toBeInTheDocument();
  });
  it('requires fresh consent on return to the tab while preserving an ambiguous retry', async () => {
    const { props, update } = setup(); choose(); approve(); submit(); await screen.findByText(/The result is not confirmed/);
    props.hidden = true; update(); props.hidden = false; update(); expect(screen.getByLabelText(permission)).not.toBeChecked(); approve(); submit();
    expect(props.perform.mock.calls[1][0]).toEqual(props.perform.mock.calls[0][0]);
  });
  it('clears the earlier receipt notice when the selected source changes', async () => {
    const { props, update } = setup(); props.perform.mockImplementation(async action => receipt(action)); choose(); approve(); submit();
    await screen.findByText(/Your chosen application preparation is recorded/);
    props.snapshot.opportunities[2].description += ' changed source'; update();
    expect(screen.queryByText(/Your chosen application preparation is recorded/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare chosen vacancies' })).toBeDisabled();
  });
  it('rejects a mismatched receipt without claiming successful preparation', async () => {
    const { props } = setup(); props.perform.mockImplementation(async action => ({ ...receipt(action), selectedRun: { requestId: 'other', runId: 'run', generation: 4, opportunityIds: [ids[0]] } }));
    choose(); approve(); submit(); await screen.findByText(/returned selection could not be confirmed/);
    expect(screen.queryByText(/Your chosen application preparation is recorded/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(labels[2])).toBeChecked();
  });
  it('shows success only for the exact returned scope and resets approval', async () => {
    const { props } = setup(); props.perform.mockImplementation(async action => receipt(action)); choose(); approve(); submit();
    await screen.findByText(/Your chosen application preparation is recorded/); expect(screen.getByLabelText(permission)).not.toBeChecked();
  });
});
