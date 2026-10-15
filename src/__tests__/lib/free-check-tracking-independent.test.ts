import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/cv-database', () => ({ mvpSupabase: { auth: { getUser: mocks.getUser }, rpc: mocks.rpc } }));
import { trackFreeCheck } from '@/lib/free-check-tracking';

const checkId = '11111111-1111-4111-8111-111111111111';
const trackerId = '22222222-2222-4222-8222-222222222222';
const linked = () => ({ id: trackerId, user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cv_check_id: checkId, pack_id: null, job_title: 'Reviewed role', company: 'Employer', job_url: null, status: 'interview', notes: 'Keep my existing progress', applied_at: '2026-10-14T12:00:00Z', follow_up_at: '2026-10-20', created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-15T12:00:00Z' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.resetAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: [linked()], error: null });
});

describe('independent saved-check tracking boundary', () => {
  it('asks the server to link only the exact check and returns existing progress without a progress write', async () => {
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId)).resolves.toEqual(linked());
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('track_cv_check', { p_cv_check_id: checkId });
    expect(mocks.getUser.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it('retries the same durable check identity after an ambiguous response without client-generated replacement identity', async () => {
    mocks.rpc.mockRejectedValueOnce(new TypeError('response lost'));
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId)).rejects.toThrow();
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId)).resolves.toEqual(linked());
    expect(mocks.rpc.mock.calls).toEqual([
      ['track_cv_check', { p_cv_check_id: checkId }], ['track_cv_check', { p_cv_check_id: checkId }],
    ]);
  });
  it('does not send a malformed check selector to the server', async () => {
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wrong')).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    [], [linked(), linked()], [{ ...linked(), user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
    [{ ...linked(), cv_check_id: trackerId }], [{ ...linked(), pack_id: trackerId }],
    [{ ...linked(), id: '' }], [{ ...linked(), status: 'fabricated' }],
  ])('rejects unavailable, contradictory or foreign response %#', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId)).rejects.toThrow();
  });
  it('does not write after SDK authority changed while getUser was in flight', async () => {
    const pending = deferred<{ data: { user: { id: string } }; error: null }>();
    mocks.getUser.mockReturnValueOnce(pending.promise);
    const operation = trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId);
    setTrackingDraftOwner('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); setTrackingDraftOwner('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    pending.resolve({ data: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }, error: null });
    await expect(operation).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not expose a result from the previous A lifetime after A→B→A during the write', async () => {
    const pending = deferred<{ data: ReturnType<typeof linked>[]; error: null }>();
    mocks.rpc.mockReturnValueOnce(pending.promise);
    const operation = trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId);
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    setTrackingDraftOwner('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); setTrackingDraftOwner('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    pending.resolve({ data: [linked()], error: null });
    await expect(operation).rejects.toThrow();
  });
  it('rejects a server-confirmed different owner without writing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }, error: null });
    await expect(trackFreeCheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', checkId)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

