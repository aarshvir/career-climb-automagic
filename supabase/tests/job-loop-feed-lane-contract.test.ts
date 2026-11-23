// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser, onAuthStateChange: sdk.onAuthStateChange }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn() }));
import { callJobLoop } from '@/lib/job-loop-api';
import { processLoopPhase } from '../functions/_shared/job-loop-runtime.ts';
import { LoopRepository, publicRun, type RecordRow, type RunRow, type RunState } from '../functions/_shared/job-loop-repository.ts';
import { EMPLOYER_FEED_LIMITS, employerFeeds } from '../functions/_shared/job-loop-providers.ts';
import { ApiError } from '../functions/_shared/core.ts';
import type { LoopLane, LoopOpportunity, LoopPacket } from '../functions/_shared/job-loop-types.ts';

// Cross-layer contract: the lanes the ACTUAL discovery phase writes (one per failed, truncated, nonempty or quiet board, plus the
// inbox, search, shortlist and manual lanes) must parse through the ACTUAL dashboard client for every supported configuration,
// and an unsupported override must be reported explicitly instead of producing lanes the client would refuse.
const owner = '11111111-1111-4111-a111-111111111111', id = '22222222-2222-4222-a222-222222222222', hash = 'a'.repeat(64);
function harness() {
  const record: RecordRow = { user_id: owner, version: 1, input_version: 1, updated_at: '2026-10-11T00:00:00Z', data: { profile: { audience: 'professional', name: 'Fictional Candidate', contactLine: '', targetTitles: ['Software Engineer'], locations: ['US'], experienceYears: 4, languages: [], pageTarget: 1, discreetSearch: false, sourceText: 'Built and reviewed fictional software changes with a team.', excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null }, revision: 1, updatedAt: '2026-10-11T00:00:00Z' }, claims: [], opportunities: [], inbox: [] } };
  const run: RunRow = { id, user_id: owner, request_id: id, request_hash: hash, input_hash: hash, input_version: 1, snapshot: structuredClone(record.data), provider: 'rules', model: 'grounded-rules-v1', consents: { model: false, inbox: false }, data: {}, status: 'queued', phase: 0, lease_token: null, lease_until: null, created_at: '2026-10-11T00:00:00Z', finished_at: null };
  const packets: LoopPacket[] = [];
  const mock = {
    claimRun: vi.fn(async () => { run.lease_token = crypto.randomUUID(); run.status = 'running'; return structuredClone(run); }),
    record: vi.fn(async () => structuredClone(record)),
    collections: vi.fn(async () => ({ runs: [], packets: [], usage: [], connection: null })),
    commit: vi.fn(async (active: RunRow, phase: number, status: RunRow['status'], state: RunState, values: LoopPacket[] = [], opportunities: LoopOpportunity[] = []) => { if (active.lease_token !== run.lease_token) throw new ApiError(409, 'LOOP_LEASE_LOST', 'lost'); run.phase = phase; run.status = status; run.data = structuredClone(state); run.lease_token = null; packets.push(...structuredClone(values)); record.data.opportunities.push(...opportunities); return structuredClone(run); }),
    upload: vi.fn(async () => 'unused'),
    reserve: vi.fn(() => { throw new Error('A disabled paid provider must never be reached.'); }),
  };
  return { repo: mock as unknown as LoopRepository, run };
}
const job = (n: number, title: string) => ({ id: n, title, absolute_url: `https://careers.example.com/jobs/${n}`, content: 'Software development and product collaboration. At least 3 years of experience required. Base salary USD 90,000–120,000 per year.', location: { name: 'San Francisco, California' } });
async function discover(feedsValue: string, fetcher: (url: unknown) => Promise<Response>) {
  const h = harness(), env = (name: string) => name === 'JOB_LOOP_EMPLOYER_FEEDS' ? feedsValue : undefined;
  for (let n = 0; n < 14; n++) if (!await processLoopPhase(h.repo, id, env, fetcher as never)) break;
  return { run: h.run, lanes: (h.run.data.lanes ?? []) as LoopLane[], env };
}
async function dashboardAccepts(run: RunRow, env: (name: string) => string | undefined, lanes?: unknown[]) {
  const publicView = publicRun(run, []);
  const snapshot = { lifecycleGeneration: 0, recordVersion: 0, profile: null, claims: [], opportunities: [], runs: [{ ...publicView, ...(lanes ? { lanes } : {}) }], packets: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false }, employerSources: employerFeeds(env) };
  sdk.invoke.mockResolvedValueOnce({ data: { snapshot, existingState: 'active' }, error: null });
  return callJobLoop('owner-a', { action: 'get_existing' });
}
const feedsJson = (count: number, provider = 'greenhouse') => JSON.stringify(Array.from({ length: count }, (_, i) => ({ provider, board: `board-${i}`, company: `Employer ${i}` })));

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_SUPABASE_URL', 'https://qa.supabase.co');
  sdk.session.mockResolvedValue({ user: { id: 'owner-a' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: sdk.unsubscribe } } });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('employer source lanes and the dashboard client', () => {
  it('accepts every lane of the supported maximum of eight boards when all fail, and keeps one lane per board', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    const { run, lanes, env } = await discover(feedsJson(EMPLOYER_FEED_LIMITS.feeds), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(EMPLOYER_FEED_LIMITS.feeds);
    expect(lanes.filter(lane => /^greenhouse:board-\d$/.test(lane.name) && lane.status === 'blocked')).toHaveLength(EMPLOYER_FEED_LIMITS.feeds);
    expect(lanes.length).toBeGreaterThanOrEqual(EMPLOYER_FEED_LIMITS.feeds + 4); // inbox, search, shortlist, manual
    const loaded = await dashboardAccepts(run, env);
    expect(loaded.snapshot?.runs[0].lanes).toHaveLength(lanes.length);
  });
  it('accepts a mixed maximum: matching, quiet, failed and capped boards each keep their own lane', async () => {
    const lever = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: `lv-${i}`, text: 'Warehouse Operator', hostedUrl: `https://jobs.example.com/${i}`, descriptionPlain: 'Pick and pack orders.', categories: { location: 'Austin, TX' } })));
    const feeds = JSON.stringify([
      ...Array.from({ length: 2 }, (_, i) => ({ provider: 'greenhouse', board: `match-${i}`, company: `Match ${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ provider: 'greenhouse', board: `quiet-${i}`, company: `Quiet ${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ provider: 'greenhouse', board: `dead-${i}`, company: `Dead ${i}` })),
      { provider: 'lever', board: 'capped', company: 'Capped' }, { provider: 'ashby', board: 'asha', company: 'Ashby' },
    ]);
    const fetcher = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.includes('/boards/match-')) return Response.json({ jobs: [job(1, 'Software Engineer')] });
      if (target.includes('/boards/quiet-')) return Response.json({ jobs: [job(2, 'Nurse Manager')] });
      if (target.includes('/boards/dead-')) return new Response('', { status: 503 });
      if (target.includes('api.lever.co')) return Response.json(JSON.parse(lever)); // a full page on every request: three pages, still capped
      return Response.json({ jobs: [] });
    });
    const { run, lanes, env } = await discover(feeds, fetcher);
    const names = lanes.map(lane => lane.name);
    for (const expected of ['greenhouse:match-0', 'greenhouse:match-1', 'greenhouse:quiet-0', 'greenhouse:quiet-1', 'greenhouse:dead-0', 'greenhouse:dead-1', 'lever:capped', 'ashby:asha']) expect(names).toContain(expected);
    expect(lanes.find(lane => lane.name === 'greenhouse:dead-0')).toMatchObject({ status: 'blocked', count: 0 });
    expect(lanes.find(lane => lane.name === 'greenhouse:quiet-0')).toMatchObject({ status: 'completed', count: 0 });
    expect(lanes.find(lane => lane.name === 'lever:capped')).toMatchObject({ status: 'partial' });
    await expect(dashboardAccepts(run, env)).resolves.toBeTruthy();
  });
  it.each([9, 60])('rejects a %i-board override explicitly: no board is read, one clear lane, and the dashboard still loads', async count => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    const { run, lanes, env } = await discover(feedsJson(count), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    const lane = lanes.find(item => item.name === 'Employer API sources');
    expect(lane).toMatchObject({ status: 'blocked', count: 0 });
    expect(lane?.message).toMatch(new RegExp(`more than ${EMPLOYER_FEED_LIMITS.feeds} boards.*rejected.*no board was read.*not treated as an empty market`));
    expect(lanes.length).toBeLessThan(10);
    await expect(dashboardAccepts(run, env)).resolves.toBeTruthy();
  });
  it('keeps an existing supported override (a single board) working', async () => {
    const fetcher = vi.fn(async () => Response.json({ jobs: [job(1, 'Software Engineer')] }));
    const { lanes } = await discover(feedsJson(1), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(lanes.find(lane => lane.name === 'greenhouse:board-0')).toMatchObject({ status: 'completed', count: 1 });
  });
  it('ties the client lane limit to the source capacity: 40 lanes parse, 41 do not, and the supported maximum leaves headroom', async () => {
    const { run, env } = await discover(feedsJson(1), vi.fn(async () => Response.json({ jobs: [] })));
    const make = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `lane-${i}`, status: 'completed', count: 0, message: 'Fictional lane', checkedAt: '2026-11-23T00:00:00Z' }));
    await expect(dashboardAccepts(run, env, make(40))).resolves.toBeTruthy();
    await expect(dashboardAccepts(run, env, make(41))).rejects.toThrow();
    // Worst case per run: one lane for every supported board plus at most six fixed lanes (inbox, rejected-override notice, search, shortlist, manual, selected vacancies).
    expect(EMPLOYER_FEED_LIMITS.feeds + 6).toBeLessThanOrEqual(40);
  });
});
