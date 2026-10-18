import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '@/pages/JobLoop';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import type { CvVariantFactsRead, CvVariantFactSnapshot } from '../../supabase/functions/_shared/job-loop-cv-variant-facts';
import type { LoopAction, LoopClaim, LoopCvVariant, LoopPacket, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const owner = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const factId = '33333333-3333-4333-8333-333333333333';
const sourceHash = 'a'.repeat(64);
const source = 'Alex Example\nEXAMPLE PROJECT\nMaintained weekly reporting dashboards and documented assumptions for the project team.';
const quote = 'Maintained weekly reporting dashboards and documented assumptions for the project team.';
const mocks = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null, call: vi.fn(), preview: vi.fn(), download: vi.fn(), save: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false, authError: null }) }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: vi.fn(async () => []), getLoopDownload: mocks.download, getLoopPreview: mocks.preview, isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));
vi.mock('@/lib/document-download', () => ({ downloadBlob: mocks.save }));

let current: LoopSnapshot, variant: LoopCvVariant, fact: CvVariantFactSnapshot;
const OriginalURL = URL;
const tree = () => <HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>;
const factsRead = (): CvVariantFactsRead => ({ generation: 4, recordVersion: current.recordVersion, variant: { id: variant.id, revision: variant.revision, sourceHash: variant.sourceHash }, facts: [structuredClone(fact)] });
const variantsRead = () => ({ cvVariants: { generation: 4, recordVersion: current.recordVersion, variants: [structuredClone(variant)] } });
function defer<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function selectPacket() { fireEvent.click(await screen.findByRole('button', { name: 'Prepared CVs' })); fireEvent.click(screen.getByRole('button', { name: /Reporting analyst.*Example employer/ })); }
function previewButton() { return screen.getByRole('button', { name: 'Open exact PDF preview' }); }
async function settledStaleSource() {
  // This warning is withheld while source metadata is pending. Its appearance
  // proves that the authority decision settled, rather than merely started.
  await screen.findByText(/This output does not match the current cleared record/);
  expect(screen.queryByText('Checking this saved CV and its current facts…')).not.toBeInTheDocument();
  expect(screen.queryByText(/The saved CV source could not be checked/)).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.clearAllMocks(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); mocks.user = { id: owner };
  const profile = { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: source, targetTitles: ['Reporting analyst'], locations: ['New York'] };
  variant = { id: variantId, generation: 4, revision: 1, label: 'Analyst CV', profile: structuredClone(profile), claims: [], sourceHash, createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z' };
  fact = { id: factId, variantId, generation: 4, variantRevision: 1, sourceHash, revision: 1, status: 'active', createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', sourceKind: 'cv_passage', sourceQuote: quote, phrasing: quote, context: 'EXAMPLE PROJECT', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true };
  const packet: LoopPacket = { id: 'packet-a', runId: 'run-a', opportunityId: 'opportunity-a', title: 'Reporting analyst', company: 'Example employer', inputHash: 'exact-packet-hash', profileRevision: 1, claimVersions: { [`vf_${factId}`]: 1 }, cvSelection: { variantId, variantRevision: 1, sourceHash, factRefs: [{ id: factId, revision: 1 }] }, cvText: quote, evidenceText: 'The exact reviewed project passage.', coverLetterText: '', connectionNote: '', messageText: '', emailSubject: '', emailBody: '', contact: null, assessment: { score: 60, method: 'Source relevance', components: { role: 20, evidence: 20, constraints: 20 }, gaps: [], flags: [], claimIds: [`vf_${factId}`] }, status: 'review_required', holdReasons: [], pageCount: 1, createdAt: '2026-10-18T00:00:00Z', approvedAt: null, model: { provider: 'rules', model: 'grounded-rules-v1', method: 'Source-based composition' }, artifacts: { pdf: { path: 'exact/private/path', sha256: 'b'.repeat(64), byteSize: 20 } } };
  current = { lifecycleGeneration: 4, recordVersion: 7, profile: { ...profile, revision: 2, updatedAt: '2026-10-18T00:00:00Z' }, claims: [], opportunities: [], packets: [packet], runs: [], inbox: [], models: [], capabilities: { cvVariants: true, cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
  mocks.call.mockImplementation(async (_user: string, action: LoopAction) => {
    if (action.action === 'read_cv_variants') return variantsRead();
    if (action.action === 'read_cv_variant_facts') return { cvVariantFacts: factsRead() };
    if (action.action === 'approve_packet') current = { ...current, packets: [{ ...current.packets[0], status: 'approved', approvedAt: '2026-10-18T01:00:00Z' }] };
    return { snapshot: structuredClone(current) };
  });
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF-example'], { type: 'application/pdf' }), filename: 'review.pdf' });
  mocks.download.mockResolvedValue({ blob: new Blob(['%PDF-example']), filename: 'analyst.pdf' });
  vi.stubGlobal('URL', class extends OriginalURL { static createObjectURL = vi.fn(() => 'blob:exact-variant-preview'); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); });

describe('variant packets use their own current source authority', () => {
  it('reviews, previews, approves and downloads variant revision one after global profile revision two', async () => {
    render(tree()); await selectPacket(); await waitFor(() => expect(previewButton()).toBeEnabled());
    expect(screen.queryByText(/Source claim vf_.*no longer available/)).not.toBeInTheDocument();
    expect(screen.getByText(/academic project · EXAMPLE PROJECT · revision 1:/)).toHaveTextContent(quote);
    fireEvent.click(previewButton()); expect(await screen.findByTitle('Exact saved CV PDF preview')).toHaveAttribute('src', 'blob:exact-variant-preview');
    fireEvent.click(screen.getByLabelText(/I reviewed the complete CV and evidence/)); fireEvent.click(screen.getByLabelText(/The final document and its figures/));
    fireEvent.click(screen.getByRole('button', { name: 'Approve exact packet' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' })); await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.any(Blob), 'analyst.pdf'));
    expect(mocks.call).toHaveBeenCalledWith(owner, expect.objectContaining({ action: 'approve_packet', packetId: 'packet-a', inputHash: 'exact-packet-hash', reviewedText: quote, confirmFacts: true, confirmDisclosure: true }));
  });
  it('uses the selected variant page preference instead of the unrelated global preference', async () => {
    variant.profile.pageTarget = 2; current.profile!.pageTarget = 1; current.packets[0].pageCount = 2;
    render(tree()); await selectPacket(); await waitFor(() => expect(previewButton()).toBeEnabled());
    fireEvent.click(screen.getByLabelText(/I reviewed the complete CV and evidence/)); fireEvent.click(screen.getByLabelText(/The final document and its figures/));
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeEnabled();
  });
  it.each(['revision', 'sourceHash', 'withdrawn', 'not confirmed', 'not shareable', 'fact revision'] as const)('blocks the packet when its current variant authority changes: %s', async change => {
    if (change === 'revision') { variant.revision = 2; fact.variantRevision = 2; }
    if (change === 'sourceHash') { variant.sourceHash = 'c'.repeat(64); fact.sourceHash = variant.sourceHash; }
    if (change === 'withdrawn') fact.status = 'withdrawn';
    if (change === 'not confirmed') fact.confirmed = false;
    if (change === 'not shareable') fact.shareable = false;
    if (change === 'fact revision') fact.revision = 2;
    render(tree()); await selectPacket(); await waitFor(() => expect(mocks.call.mock.calls.some(([, action]) => action.action === 'read_cv_variant_facts')).toBe(true));
    await settledStaleSource();
    expect(previewButton()).toBeDisabled(); expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  });
  it('rechecks inherited global claims as well as independent variant facts', async () => {
    const inherited: LoopClaim = { ...fact, id: '44444444-4444-4444-8444-444444444444' };
    variant.claims = [inherited]; current.claims = [{ ...inherited, status: 'withdrawn' }]; current.packets[0].claimVersions[inherited.id] = 1;
    render(tree()); await selectPacket(); await waitFor(() => expect(mocks.call.mock.calls.some(([, action]) => action.action === 'read_cv_variant_facts')).toBe(true));
    await settledStaleSource();
    expect(previewButton()).toBeDisabled();
  });
  it('does not use stale source reads after an owner leaves and returns', async () => {
    const first = defer<ReturnType<typeof variantsRead>>(), second = defer<ReturnType<typeof variantsRead>>(); let reads = 0;
    const original = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((id, action) => action.action === 'read_cv_variants' ? (++reads === 1 ? first.promise : second.promise) : original(id, action));
    const view = render(tree()); await selectPacket(); await waitFor(() => expect(reads).toBe(1));
    mocks.user = null; view.rerender(tree()); await act(async () => {});
    mocks.user = { id: owner }; view.rerender(tree()); await selectPacket(); await waitFor(() => expect(reads).toBe(2));
    await act(async () => first.resolve(variantsRead())); expect(previewButton()).toBeDisabled();
    await act(async () => second.resolve(variantsRead())); await waitFor(() => expect(previewButton()).toBeEnabled());
  });
  it('clears cached previews and approved download access when refreshed facts withdraw authority', async () => {
    current.packets[0].status = 'approved';
    render(tree()); await selectPacket(); await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled());
    fireEvent.click(previewButton()); await screen.findByTitle('Exact saved CV PDF preview');
    fact.status = 'withdrawn'; current = { ...current, recordVersion: 8 };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled());
    await waitFor(() => expect(screen.queryByTitle('Exact saved CV PDF preview')).not.toBeInTheDocument()); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-variant-preview');
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'read_cv_variant_facts')).toHaveLength(2));
    expect(previewButton()).toBeDisabled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('fails closed on unavailable source metadata and can recover through a current workspace refresh', async () => {
    const original = mocks.call.getMockImplementation()!; let unavailable = true;
    mocks.call.mockImplementation((id, action) => action.action === 'read_cv_variant_facts' && unavailable ? Promise.reject(new Error('Source unavailable')) : original(id, action));
    render(tree()); await selectPacket(); await screen.findByText(/The saved CV source could not be checked/); expect(previewButton()).toBeDisabled();
    unavailable = false; fireEvent.click(screen.getByRole('button', { name: 'Refresh records' })); await waitFor(() => expect(previewButton()).toBeEnabled());
  });
  it('rejects a source/fact read from a newer record version until that complete workspace is refreshed', async () => {
    const original = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((id, action) => action.action === 'read_cv_variant_facts' ? Promise.resolve({ cvVariantFacts: { ...factsRead(), recordVersion: 8 } }) : original(id, action));
    render(tree()); await selectPacket(); await screen.findByText(/The saved CV source could not be checked/); expect(previewButton()).toBeDisabled();
    current = { ...current, recordVersion: 8 }; fireEvent.click(screen.getByRole('button', { name: 'Refresh records' })); await waitFor(() => expect(previewButton()).toBeEnabled());
  });
  it('keeps legacy packets bound to global profile and claim revisions without variant reads', async () => {
    const inherited: LoopClaim = { ...fact, id: 'legacy-claim' }; current.claims = [inherited]; delete current.packets[0].cvSelection; current.packets[0].claimVersions = { 'legacy-claim': 1 };
    render(tree()); await selectPacket(); expect(previewButton()).toBeDisabled();
    current = { ...current, profile: { ...current.profile!, revision: 1 } }; fireEvent.click(screen.getByRole('button', { name: 'Refresh records' })); await waitFor(() => expect(previewButton()).toBeEnabled());
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'read_cv_variants' || action.action === 'read_cv_variant_facts')).toBe(false);
  });
});
