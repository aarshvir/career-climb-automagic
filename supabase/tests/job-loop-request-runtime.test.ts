// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { controlLoop } from '../functions/_shared/job-loop-runtime';
import { LoopRepository, type RecordRow } from '../functions/_shared/job-loop-repository';
import type { LoopAction } from '../functions/_shared/job-loop-types';

const schedule = {
  cadence: 'weekdays', timezone: 'Asia/Dubai', localTime: '08:00', weeklyDay: null,
  provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false,
};
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const backendOwner = '11111111-1111-4111-a111-111111111111';
const sourceQuote = 'Built a reporting dashboard for a university operations project.';
const environment = (name: string): string | undefined => ({
  JOB_LOOP_MONTHLY_CAP_USD: '50', JOB_LOOP_EMPLOYER_FEEDS: '[]',
  JOB_LOOP_GMAIL_ENABLED: 'true', JOB_LOOP_GMAIL_CLIENT_ID: 'local-test-client',
  JOB_LOOP_GMAIL_CLIENT_SECRET: 'local-test-client-secret',
  JOB_LOOP_TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  SUPABASE_URL: 'https://local-fixture.supabase.co', APP_URL: 'https://jobvance.example.test',
}[name]);

function backendFixture() {
  let generation = 7;
  let state: 'active' | 'erasing' | 'erased' = 'active';
  const effects: { name: string; args: Record<string, unknown> }[] = [];
  const blockers = new Map<string, Promise<void>>();
  const row: RecordRow = {
    user_id: backendOwner, version: 1, input_version: 1, updated_at: '2026-10-14T00:00:00Z',
    data: {
      profile: {
        audience: 'student', name: 'Local generation fixture', contactLine: '', targetTitles: ['Graduate analyst'], locations: ['Dubai'],
        experienceYears: null, languages: [], pageTarget: 1, discreetSearch: false,
        sourceText: 'Academic projects\nUniversity operations project\n' + sourceQuote, excludedTerms: [],
        compensation: { currency: '', period: 'monthly', minimum: null }, revision: 1, updatedAt: '2026-10-14T00:00:00Z',
      },
      claims: [{ id: 'local-claim', revision: 1, status: 'active', createdAt: '2026-10-14T00:00:00Z', sourceKind: 'cv_passage',
        sourceQuote, phrasing: sourceQuote, context: 'University operations project', kind: 'academic_project',
        resultStatus: 'not_measured', confirmed: true, shareable: true }],
      opportunities: [], inbox: [],
    },
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const blocker = blockers.get(name);
    if (blocker) await blocker;
    if (name === 'job_loop_erasure_status') return { data: { state, generation }, error: null };
    if (name === 'job_loop_open_record') return { data: { ...structuredClone(row), lifecycle_generation: generation }, error: null };
    if (name === 'job_loop_read_record') {
      if (args.p_generation !== generation) return { data: null, error: { message: 'LOOP_REQUEST_STALE' } };
      if (state !== 'active') return { data: null, error: { message: 'LOOP_ERASURE_IN_PROGRESS' } };
      return { data: { ...structuredClone(row), lifecycle_generation: generation }, error: null };
    }
    if (name === 'job_loop_scheduler_state') return { data: { ready: true }, error: null };
    if (['job_loop_assert_generation', 'job_loop_save_schedule_bound', 'job_loop_schedule_action_bound', 'job_loop_create_oauth_state', 'job_loop_disconnect_gmail'].includes(name)) {
      if (args.p_generation !== generation) return { data: null, error: { message: 'LOOP_REQUEST_STALE' } };
      if (state !== 'active') return { data: null, error: { message: 'LOOP_ERASURE_IN_PROGRESS' } };
      if (name !== 'job_loop_assert_generation') effects.push({ name, args });
      return { data: null, error: null };
    }
    throw new Error(`Unexpected fixture RPC: ${name}`);
  });
  const from = vi.fn(() => { throw new Error('User-only direct writes must not bypass the generation-bound RPC.'); });
  const repo = new LoopRepository({ rpc, from } as never);
  const collections = vi.spyOn(repo, 'collections').mockResolvedValue({ runs: [], packets: [], usage: [], connection: null });
  const operational = vi.spyOn(repo, 'operationalSnapshot').mockResolvedValue({
    schedule: null, activity: [], support: [], scheduler: { ready: true },
    budget: { month: '2026-10', capUsd: 50, committedUsd: 0, remainingUsd: 50, enrolled: true, activeUsers: 1 },
  });
  return {
    repo, rpc, from, effects, collections, operational,
    lifecycleStatus: () => ({ state, generation }),
    setGeneration: (value: number) => { generation = value; },
    setState: (value: typeof state) => { state = value; },
    block: (name: string) => {
      let release!: () => void;
      blockers.set(name, new Promise<void>(resolve => { release = resolve; }));
      return release;
    },
  };
}

describe('runtime preserves the originating lifetime across delayed control work', () => {
  it('keeps the original generation when scheduler readiness completes after erasure and fresh setup', async () => {
    const fixture = backendFixture(), release = fixture.block('job_loop_scheduler_state');
    const action = { action: 'save_schedule', expectedGeneration: 7, expectedScheduleVersion: 0, schedule, recurringConsent: true } as LoopAction;
    const pending = controlLoop(fixture.repo, backendOwner, action, environment);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE', status: 409 });
    await vi.waitFor(() => expect(fixture.rpc.mock.calls.some(([name]) => name === 'job_loop_scheduler_state')).toBe(true));
    fixture.setGeneration(9);
    release();
    await rejected;

    expect(fixture.rpc).toHaveBeenCalledWith('job_loop_save_schedule_bound', expect.objectContaining({ p_user: backendOwner, p_generation: 7 }));
    expect(fixture.effects).toEqual([]);
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it.each(['pause_schedule', 'cancel_schedule', 'gmail_disconnect'] as const)('does not adopt a fresh record generation for delayed %s', async name => {
    const method = name === 'gmail_disconnect' ? 'job_loop_disconnect_gmail' : 'job_loop_schedule_action_bound';
    const fixture = backendFixture(), release = fixture.block(method);
    const action = { action: name, expectedGeneration: 7, ...(name === 'gmail_disconnect' ? {} : { expectedScheduleVersion: 1 }) } as LoopAction;
    const pending = controlLoop(fixture.repo, backendOwner, action, environment);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE', status: 409 });
    await vi.waitFor(() => expect(fixture.rpc.mock.calls.some(([called]) => called === method)).toBe(true));
    fixture.setGeneration(9);
    release();
    await rejected;

    expect(fixture.rpc).toHaveBeenCalledWith(method, expect.objectContaining({ p_generation: 7 }));
    expect(fixture.effects).toEqual([]);
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it('keeps an OAuth initiation bound to its original generation through delayed local encryption', async () => {
    const fixture = backendFixture();
    let finishEncryption!: () => Promise<void>;
    const encrypt = webcrypto.subtle.encrypt.bind(webcrypto.subtle);
    vi.spyOn(webcrypto.subtle, 'encrypt').mockImplementationOnce((...args) => new Promise(resolve => {
      finishEncryption = async () => { resolve(await encrypt(...args)); };
    }));
    const pending = controlLoop(fixture.repo, backendOwner, { action: 'gmail_connect', allowDrafts: false, expectedGeneration: 7 }, environment);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE', status: 409 });
    await vi.waitFor(() => expect(finishEncryption).toBeDefined());
    fixture.setGeneration(9);
    await finishEncryption();
    await rejected;

    expect(fixture.rpc).toHaveBeenCalledWith('job_loop_create_oauth_state', expect.objectContaining({ p_user: backendOwner, p_generation: 7, p_drafts: false }));
    expect(fixture.effects).toEqual([]);
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it('uses the bound disconnect RPC for a current request rather than user-only table deletion', async () => {
    const fixture = backendFixture();
    await controlLoop(fixture.repo, backendOwner, { action: 'gmail_disconnect', expectedGeneration: 7 }, environment);
    expect(fixture.effects).toEqual([{ name: 'job_loop_disconnect_gmail', args: { p_user: backendOwner, p_generation: 7 } }]);
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it('does not reopen an erased lifetime when a completed mutation waits for its response snapshot', async () => {
    const fixture = backendFixture();
    const implementation = fixture.rpc.getMockImplementation()!;
    let reads = 0, release!: () => void;
    const responseRead = new Promise<void>(resolve => { release = resolve; });
    fixture.rpc.mockImplementation(async (name, args) => {
      if (name === 'job_loop_read_record' && ++reads === 2) await responseRead;
      return implementation(name, args);
    });
    const pending = controlLoop(fixture.repo, backendOwner, { action: 'gmail_disconnect', expectedGeneration: 7 }, environment);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE', status: 409 });
    await vi.waitFor(() => expect(reads).toBe(2));
    expect(fixture.effects).toEqual([{ name: 'job_loop_disconnect_gmail', args: { p_user: backendOwner, p_generation: 7 } }]);
    fixture.setGeneration(8);
    fixture.setState('erased');
    release();
    await rejected;

    expect(fixture.rpc.mock.calls.some(([name]) => name === 'job_loop_open_record')).toBe(false);
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.lifecycleStatus()).toEqual({ state: 'erased', generation: 8 });
  });

  it('returns only the current erasure generation without reopening records or automatically continuing erasure', async () => {
    const fixture = backendFixture();
    fixture.setGeneration(8);
    fixture.setState('erasing');
    expect(await controlLoop(fixture.repo, backendOwner, { action: 'get' }, environment)).toEqual({ erasureGeneration: 8 });
    expect(fixture.rpc.mock.calls.map(([name]) => name)).toEqual(['job_loop_erasure_status']);
    expect(fixture.collections).not.toHaveBeenCalled();
    expect(fixture.operational).not.toHaveBeenCalled();
    expect(fixture.effects).toEqual([]);
  });

  it('opens the intended snapshot lifetime before collecting its documents and operational history', async () => {
    const fixture = backendFixture(), release = fixture.block('job_loop_open_record');
    const pending = controlLoop(fixture.repo, backendOwner, { action: 'get' }, environment);
    await vi.waitFor(() => expect(fixture.rpc.mock.calls.some(([name]) => name === 'job_loop_open_record')).toBe(true));
    expect(fixture.collections).not.toHaveBeenCalled();
    expect(fixture.operational).not.toHaveBeenCalled();

    fixture.setGeneration(9);
    release();
    expect(await pending).toMatchObject({ snapshot: { lifecycleGeneration: 9 } });
    expect(fixture.collections).toHaveBeenCalledOnce();
    expect(fixture.operational).toHaveBeenCalledOnce();
    expect(fixture.rpc).toHaveBeenLastCalledWith('job_loop_assert_generation', { p_user: backendOwner, p_generation: 9 });
  });
});
