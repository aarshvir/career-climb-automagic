import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopCvVariants from '@/pages/LoopCvVariants';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import type { LoopAction, LoopCvVariant, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: api.call }));
const owner = '11111111-1111-4111-8111-111111111111', variantId = '22222222-2222-4222-8222-222222222222';
const text = 'Alex Example\nEXPERIENCE\nExample Company\nMaintained operations reports and documented the weekly source checks.';
const permission = /Save this exact CV source and selected facts privately/;
const retryPermission = /Retry this original private-save request/;
function snapshot(): LoopSnapshot {
  return { lifecycleGeneration: 4, recordVersion: 7, profile: { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: text, revision: 1, updatedAt: '2026-10-17' }, claims: [{ id: 'fact', revision: 1, status: 'active', createdAt: '2026-10-17', sourceKind: 'cv_passage', sourceQuote: 'Maintained operations reports and documented the weekly source checks.', phrasing: 'Maintained operations reports and documented the weekly source checks.', context: 'Example Company', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true }], opportunities: [], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, allowDrafts: false, status: '' } };
}
function savedVariant(): LoopCvVariant { const { revision: _, updatedAt: __, ...profile } = snapshot().profile!; return { id: variantId, generation: 4, revision: 1, label: 'Saved operations', profile, claims: snapshot().claims, sourceHash: 'a'.repeat(64), createdAt: '2026-10-17', updatedAt: '2026-10-17' }; }
function success(action: LoopAction, changes: Partial<LoopCvVariant> = {}): LoopResponse {
  if (action.action !== 'save_cv_variant') throw new Error('Expected save');
  const variant = { ...savedVariant(), id: action.variantId ?? variantId, revision: action.expectedVariantRevision + 1, label: action.label, profile: action.profile, claims: action.claimRefs.length ? snapshot().claims : [], ...changes };
  return { variantSave: { generation: 4, recordVersion: action.expectedVersion + 1, requestId: action.requestId, requestHash: 'b'.repeat(64), sourceHash: 'a'.repeat(64), savedRevision: action.expectedVariantRevision + 1, reused: false, variant } };
}
function setup(variants: LoopCvVariant[] = []) {
  api.call.mockImplementation(async (_owner, action) => action.action === 'read_cv_variants' ? { cvVariants: { generation: 4, recordVersion: 7, variants } } : success(action));
  const props = { snapshot: snapshot(), owner, authority: trackingDraftAuthority(owner), ready: true, busy: false, hidden: false, captureGuard: () => () => true };
  const view = render(<LoopCvVariants {...props} />);
  return { props, view, update: () => view.rerender(<LoopCvVariants {...props} />) };
}
async function start() { fireEvent.click(screen.getByRole('button', { name: 'Load saved CV variants' })); await screen.findByRole('button', { name: 'Create a CV variant' }); fireEvent.click(screen.getByRole('button', { name: 'Create a CV variant' })); fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'Operations' } }); }
function approve() { fireEvent.click(screen.getByLabelText(permission)); }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Save CV variant' })); }
beforeEach(() => { api.call.mockReset(); setTrackingDraftOwner(null); setTrackingDraftOwner(owner); setTrackingLoopGeneration(owner, 4); sessionStorage.clear(); });
afterEach(cleanup);
describe('private CV variants', () => {
  it('loads deliberately, starts with no selected facts or consent, and saves an exact draft without preparation', async () => {
    setup(); expect(api.call).not.toHaveBeenCalled(); await start(); expect(screen.getByLabelText(permission)).not.toBeChecked();
    expect(screen.getByText(/This will save a CV draft without confirmed facts/)).toBeInTheDocument();
    approve(); save(); await screen.findByText(/Your CV variant is saved privately/);
    expect(api.call.mock.calls[1][1]).toMatchObject({ action: 'save_cv_variant', expectedGeneration: 4, expectedVersion: 7, label: 'Operations', variantId: null, expectedVariantRevision: 0, claimRefs: [], saveConsent: true });
    expect(api.call.mock.calls.map(c => c[1].action)).toEqual(['read_cv_variants', 'save_cv_variant']);
  });
  it('selects an exact current fact and clears passage selection when source changes', async () => {
    setup(); await start(); const fact = screen.getByLabelText(/Maintained operations reports/); fireEvent.click(fact); approve();
    fireEvent.change(screen.getByLabelText('CV variant source text'), { target: { value: text + '\nA second draft line.' } });
    expect(screen.queryByLabelText(/Maintained operations reports/)).not.toBeInTheDocument(); expect(screen.getByLabelText(permission)).not.toBeChecked();
    approve(); save(); await screen.findByText(/Your CV variant is saved privately/); expect(api.call.mock.calls[1][1].claimRefs).toEqual([]);
  });
  it('rejects same-batch edits and A-to-B-to-A consent reuse', async () => {
    setup(); await start(); approve(); const input = screen.getByLabelText('CV variant name');
    act(() => { fireEvent.change(input, { target: { value: 'Other' } }); fireEvent.change(input, { target: { value: 'Operations' } }); save(); });
    expect(api.call).toHaveBeenCalledTimes(1); expect(screen.getByLabelText(permission)).not.toBeChecked();
  });
  it('keeps newer edits after delayed save and explicitly continues them on the saved variant', async () => {
    setup(); await start(); let finish!: (value: LoopResponse) => void;
    api.call.mockImplementationOnce((_id, action) => new Promise(resolve => { finish = () => resolve(success(action)); }));
    approve(); save(); fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'Newer wording' } });
    await act(async () => finish({})); expect(screen.getByLabelText('CV variant name')).toHaveValue('Newer wording'); expect(screen.getByRole('button', { name: 'Save CV variant' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue edits to Operations' })); approve(); save(); await screen.findByText(/Your CV variant is saved privately/);
    expect(api.call.mock.calls[2][1]).toMatchObject({ variantId, expectedVariantRevision: 1, expectedVersion: 8, label: 'Newer wording' });
  });
  it('recovers an ambiguous original request through full unmount and requires fresh retry consent', async () => {
    const { props, view } = setup(); await start(); api.call.mockRejectedValueOnce(new Error('Connection interrupted')); approve(); save(); await screen.findByText(/Your original request is retained/);
    const original = structuredClone(api.call.mock.calls[1][1]); fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'Newer local edit' } }); view.unmount();
    render(<LoopCvVariants {...props} />); expect(screen.getByLabelText('CV variant name')).toHaveValue('Newer local edit'); expect(screen.getByLabelText(retryPermission)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(retryPermission)); fireEvent.click(screen.getByRole('button', { name: 'Retry original CV save' })); await screen.findByText(/The earlier CV variant was saved/);
    expect(screen.getByLabelText('CV variant name')).toHaveValue('Newer local edit');
    expect(api.call.mock.calls[2][1]).toEqual(original);
  });
  it('shows a newer saved revision returned by retry without replacing it with the original source', async () => {
    setup(); await start(); api.call.mockRejectedValueOnce(new Error('Connection interrupted')); approve(); save(); await screen.findByText(/Your original request is retained/);
    api.call.mockImplementationOnce(async (_id, action) => { const body = success(action, { revision: 3, label: 'Later server version' }); body.variantSave!.reused = true; body.variantSave!.recordVersion = 10; return body; });
    fireEvent.click(screen.getByLabelText(retryPermission)); fireEvent.click(screen.getByRole('button', { name: 'Retry original CV save' }));
    await screen.findByText(/Request saved revision 1. Current saved revision: 3/); expect(screen.getByRole('heading', { name: 'Later server version' })).toBeInTheDocument();
  });
  it.each(['owner', 'authority', 'generation', 'ready'] as const)('ignores a delayed save after %s changes', async field => {
    const { props, update } = setup(); await start(); let finish!: () => void;
    api.call.mockImplementationOnce((_id, action) => new Promise(resolve => { finish = () => resolve(success(action)); })); approve(); save();
    if (field === 'owner') props.owner = 'other'; if (field === 'authority') props.authority++; if (field === 'generation') props.snapshot = { ...props.snapshot, lifecycleGeneration: 5 }; if (field === 'ready') props.ready = false; update();
    await act(async () => finish()); expect(screen.queryByText(/Your CV variant is saved privately/)).not.toBeInTheDocument();
  });
  it('allows updating one of three existing variants while preventing a fourth create', async () => {
    setup([savedVariant(), { ...savedVariant(), id: '33333333-3333-4333-8333-333333333333', label: 'Second' }, { ...savedVariant(), id: '44444444-4444-4444-8444-444444444444', label: 'Third' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Load saved CV variants' })); await screen.findByText('3 of 3 CV variants saved.'); expect(screen.getByRole('button', { name: 'Create a CV variant' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Saved operations' })); approve(); save(); await screen.findByText(/Your CV variant is saved privately/); expect(api.call.mock.calls[1][1]).toMatchObject({ variantId, expectedVariantRevision: 1 });
  });
  it('keeps the last confirmed list when refresh fails and does not invent empty work', async () => {
    setup([savedVariant()]); fireEvent.click(screen.getByRole('button', { name: 'Load saved CV variants' })); await screen.findByText('1 of 3 CV variants saved.'); api.call.mockRejectedValueOnce(new Error('Service unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved CV variants' })); await screen.findByRole('alert'); expect(screen.getByRole('heading', { name: 'Saved operations' })).toBeInTheDocument();
  });
  it('does not promise refresh recovery without a verified session even after device opt-in', async () => {
    setup(); await start(); fireEvent.click(screen.getByLabelText(/Keep this CV draft on this device/)); expect(screen.getByText(/Draft recovery is currently page memory only/)).toBeInTheDocument(); expect(sessionStorage.length).toBe(0);
  });
  it('clears consent and blocks a selected fact whose current revision changes', async () => {
    const { props, update } = setup(); await start(); fireEvent.click(screen.getByLabelText(/Maintained operations reports/)); approve(); props.snapshot = structuredClone(props.snapshot); props.snapshot.claims[0].revision++; update();
    expect(screen.getByLabelText(permission)).not.toBeChecked(); expect(screen.getByRole('alert')).toHaveTextContent('Some selected facts changed'); fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable facts' })); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('requires a refreshed list and current acknowledgement before abandoning an uncertain request', async () => {
    setup(); await start(); api.call.mockRejectedValueOnce(new Error('Connection interrupted')); approve(); save(); await screen.findByText(/Your original request is retained/);
    const acknowledge = screen.getByLabelText(/I inspected the refreshed saved list/); expect(acknowledge).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved CV variants' })); await waitFor(() => expect(acknowledge).toBeEnabled()); fireEvent.click(acknowledge);
    act(() => { fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'A new idea' } }); fireEvent.click(screen.getByRole('button', { name: 'Keep edits and stop retrying' })); });
    expect(screen.getByRole('region', { name: 'Unconfirmed CV save' })).toBeInTheDocument(); expect(acknowledge).not.toBeChecked();
    fireEvent.click(acknowledge); fireEvent.click(screen.getByRole('button', { name: 'Keep edits and stop retrying' })); expect(screen.queryByRole('region', { name: 'Unconfirmed CV save' })).not.toBeInTheDocument(); expect(screen.getByLabelText('CV variant name')).toHaveValue('A new idea');
  });
  it('warns when incomplete pasted input cannot be retained for route recovery', async () => {
    setup(); await start(); fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'Name\u202eunsafe' } }); expect(screen.getByText(/This draft could not be retained for recovery/)).toBeInTheDocument();
  });
});
