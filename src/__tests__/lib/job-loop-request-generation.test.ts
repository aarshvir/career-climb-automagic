import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';

const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } },
}));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn(async () => []) }));
import { boundLoopAction, callJobLoop } from '@/lib/job-loop-api';
import { validateAction } from '../../../supabase/functions/_shared/job-loop-engine';

// Every operation is an SDK fixture. No provider, mailbox or production API is
// contacted, and no stale action is upgraded to a newly fetched generation.
const session = { user: { id: 'generation-fixture-owner' } };
const schedule = {
  cadence: 'weekdays', timezone: 'Asia/Dubai', localTime: '08:00', weeklyDay: null,
  provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false,
};
const operations: Record<string, unknown>[] = [
  { action: 'start_run', requestId: '11111111-1111-4111-a111-111111111111', provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false },
  { action: 'request_support', category: 'help', message: 'Local support request fixture.' },
  { action: 'save_schedule', expectedScheduleVersion: 0, schedule, recurringConsent: true },
  { action: 'pause_schedule', expectedScheduleVersion: 1 },
  { action: 'cancel_schedule', expectedScheduleVersion: 1 },
  { action: 'gmail_connect', allowDrafts: false },
  { action: 'gmail_disconnect' },
  { action: 'gmail_preview', ticket: 'local-sealed-ticket-fixture' },
  { action: 'gmail_finalize', ticket: 'local-sealed-ticket-fixture', confirmMailbox: true },
  { action: 'gmail_create_draft', packetId: 'local-packet', requestId: '11111111-1111-4111-a111-111111111111', confirmRecipientAndAttachment: true },
  { action: 'erase_loop', confirmErase: true },
  { action: 'erase_self', confirmErase: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  sdk.session.mockResolvedValue(session);
  sdk.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  sdk.invoke.mockResolvedValue({ data: { message: 'Local generation-bound operation confirmed.' }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('browser request generation contract', () => {
  it('binds an explicit displayed lifetime without mutating the original action or adopting a later one', () => {
    const original = { action: 'gmail_disconnect' } as LoopAction;
    const bound = boundLoopAction(original, 7);
    expect(bound).toEqual({ action: 'gmail_disconnect', expectedGeneration: 7 });
    expect(original).toEqual({ action: 'gmail_disconnect' });
    expect(boundLoopAction(bound, 9)).toEqual(bound);
    expect(boundLoopAction(bound, 9)).not.toBe(bound);
  });

  it('does not manufacture a missing displayed generation and keeps explicit generation zero', () => {
    expect(() => boundLoopAction({ action: 'gmail_disconnect' }, undefined)).toThrow('Refresh Jobvance');
    expect(boundLoopAction({ action: 'gmail_disconnect' }, 0)).toEqual({ action: 'gmail_disconnect', expectedGeneration: 0 });
  });

  it.each(operations)('captures the displayed generation before delayed authentication for $action', async operation => {
    let finishAuth!: (value: typeof session) => void;
    sdk.session.mockImplementationOnce(() => new Promise(resolve => { finishAuth = resolve; }));
    const action = { ...operation, expectedGeneration: 7 } as unknown as LoopAction & { expectedGeneration: number };
    const pending = callJobLoop(session.user.id, action);
    await vi.waitFor(() => expect(finishAuth).toBeDefined());
    expect(sdk.invoke).not.toHaveBeenCalled();

    // Represents another tab finishing erasure and publishing a new snapshot
    // while this operation is paused in asynchronous owner validation.
    action.expectedGeneration = 9;
    finishAuth(session);
    await pending;

    expect(sdk.invoke).toHaveBeenCalledOnce();
    expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control', {
      body: { ...operation, expectedGeneration: 7 },
    });
    expect(sdk.invoke.mock.calls.some(([, options]) => options.body.action === 'get')).toBe(false);
  });

  it.each(operations)('rejects a generationless legacy $action before starting authentication or control requests', async operation => {
    await expect(callJobLoop(session.user.id, operation as unknown as LoopAction)).rejects.toThrow();
    expect(sdk.session).not.toHaveBeenCalled();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(() => validateAction(operation)).toThrow();
  });

  it.each([null, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1, Infinity])('rejects malformed expectedGeneration=%j on both boundaries', async expectedGeneration => {
    const action = { action: 'gmail_disconnect', expectedGeneration };
    await expect(callJobLoop(session.user.id, action as unknown as LoopAction)).rejects.toThrow();
    expect(sdk.session).not.toHaveBeenCalled();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(() => validateAction(action)).toThrow();
  });

  it('retains generation zero as an explicit valid first lifetime rather than treating it as missing', async () => {
    const action = { action: 'gmail_disconnect', expectedGeneration: 0 } as unknown as LoopAction;
    await callJobLoop(session.user.id, action);
    expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control', { body: action });
    expect(validateAction(action)).toEqual(action);
  });

  it('preserves lifecycleGeneration in snapshots and erasureGeneration in recovery-only responses', async () => {
    const snapshot = {
      lifecycleGeneration: 7, recordVersion: 4, profile: null, claims: [], opportunities: [], runs: [], packets: [], inbox: [], models: [],
      capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 },
      gmail: { connected: false, email: null, allowDrafts: false, status: 'Not connected' },
    };
    sdk.invoke.mockResolvedValueOnce({ data: { snapshot }, error: null });
    expect(await callJobLoop(session.user.id, { action: 'get' })).toMatchObject({ snapshot: { lifecycleGeneration: 7 } });
    sdk.invoke.mockResolvedValueOnce({ data: { erasureGeneration: 8 }, error: null });
    expect(await callJobLoop(session.user.id, { action: 'get' })).toEqual({ erasureGeneration: 8 });
  });

  it('does not retry an explicitly stale generation under a fresh one', async () => {
    const action = { action: 'gmail_disconnect', expectedGeneration: 7 } as unknown as LoopAction;
    sdk.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'This request belongs to a previous Automated Job Loop lifetime.', code: 'LOOP_GENERATION_STALE' }), { status: 409 }) },
    });
    await expect(callJobLoop(session.user.id, action)).rejects.toThrow('previous Automated Job Loop lifetime');
    expect(sdk.invoke).toHaveBeenCalledOnce();
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(action);
  });
});
