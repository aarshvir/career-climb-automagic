// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadDiscoveryMatcher, verifyCandidateOpenRouter } from '../../../scripts/verify-candidate-openrouter-hosted.mjs';
import type { LoopOpportunity, LoopProfileInput } from '../../../supabase/functions/_shared/job-loop-types';

const actorId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const publicSource = 'VITE_SUPABASE_URL=https://gvftdfriujrkpptdueyb.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_FICTIONAL_PUBLIC_QA_VALUE\n';
const session = 'fictional-session-token-held-only-in-memory';
function mockedHost(mode = 'passed') {
  let tag = '', started: Record<string, unknown> | null = null;
  const snapshot = { recordVersion: 0, profile: null as { sourceText: string } | null, claims: [] as unknown[], opportunities: [] as unknown[], runs: [] as unknown[], packets: [] as unknown[],
    models: [{ provider: 'openai', model: 'gpt-6.1-sol', ready: mode !== 'disabled', transport: 'openrouter' }], capabilities: { cloudWorker: true, webSearch: mode === 'paid-search' }, employerSources: mode.startsWith('feed') ? [{ provider: 'greenhouse', board: 'production-board', company: 'Production Board Employer' }] : [], gmail: { connected: false }, schedule: null, budget: { scope: 'shared_ai_search', capUsd: 50, remainingUsd: 20 } };
  const requests: { pathname: string; body: Record<string, unknown> | null }[] = [];
  const fetcher = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input), body = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ pathname: url.pathname, body });
    const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.origin === 'https://boards-api.greenhouse.io') { expect(init.headers).toBeUndefined(); return answer({ jobs: [{ company: mode === 'feed-collision' ? 'Generated QA Employer' : 'Public Subsidiary', title: 'Graduate Operations Analyst', location: { name: 'Dubai' }, content: 'Public feed role.' }] }); }
    if (url.pathname === '/auth/v1/signup') { tag = body.data.qa_run_id; return answer({ user: { id: actorId }, access_token: session }); }
    if (url.pathname === '/auth/v1/user') return answer({ id: actorId, user_metadata: { qa_fixture: true, qa_run_id: tag } });
    if (url.pathname === '/functions/v1/jobvance-admin') return answer({ code: 'ADMIN_FORBIDDEN', error: 'Forbidden', ...(mode === 'admin-leak' ? { snapshot: { private: session } } : {}) }, 403);
    if (url.pathname === '/rest/v1/job_loop_runs') return answer([{ id: runId, provider: 'openai', model: 'gpt-6.1-sol', status: 'running', consents: { model: true, inbox: false, processingRoute: started?.processingRoute } }]);
    if (url.pathname !== '/functions/v1/job-loop-control') throw new Error('Unexpected endpoint');
    if (body.action === 'save_profile') { snapshot.profile = body.profile; snapshot.recordVersion++; }
    if (body.action === 'save_claim') { snapshot.claims.push(body.claim); snapshot.recordVersion++; }
    if (body.action === 'add_opportunity') { snapshot.opportunities.push({ ...body.opportunity, source: 'manual', verification: 'user_provided' }); snapshot.recordVersion++; }
    if (body.action === 'start_run') {
      started = body;
      if (mode === 'network-error') { const error = new Error(session); error.name = session; throw error; }
      return answer({ runId, snapshot });
    }
    if (body.action === 'get' && started) {
      snapshot.runs = [{ id: runId, provider: 'openai', model: 'gpt-6.1-sol', status: mode === 'uncertain' ? 'blocked' : 'partial', usageUsd: mode === 'uncertain' ? 0 : 0.001, reservedUsd: mode === 'uncertain' ? 0.05 : 0 }];
      if (mode !== 'uncertain') snapshot.packets = [{ runId, status: 'review_required', cvText: snapshot.profile?.sourceText, messageText: '', emailBody: '' }];
    }
    return answer({ snapshot });
  });
  return { fetcher, requests, snapshot };
}
describe('one-run hosted candidate harness scope', () => {
  it('defaults to preparation without reading configuration or contacting any service', async () => {
    const sourceReader = vi.fn(), fetcher = vi.fn();
    expect(await verifyCandidateOpenRouter({ sourceReader, fetcher })).toMatchObject({ status: 'prepared', accountsCreated: 0, runStartRequests: 0 });
    expect(sourceReader).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('starts exactly one explicit OpenRouter run and outputs no credentials or source records', async () => {
    const host = mockedHost();
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result).toMatchObject({ status: 'passed', accountsCreated: 1, runStartRequests: 1, adminDeniedHttpStatus: 403, recordedCostUsd: 0.001, retainedReservationUsd: 0, packetCount: 1, fixtureProvenanceProof: { claimCount: 2 } });
    const starts = host.requests.filter(item => item.body?.action === 'start_run');
    expect(starts).toHaveLength(1); expect(starts[0].body).toMatchObject({ provider: 'openai', model: 'gpt-6.1-sol', modelConsent: true, inboxConsent: false, processingRoute: 'openrouter' });
    expect(host.requests.every(item => ['signup', 'user', 'jobvance-admin', 'job-loop-control', 'job_loop_runs'].includes(item.pathname.split('/').at(-1)!))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/fictional-session|FICTIONAL_PUBLIC_QA_VALUE|weekly operations tracker|access_token/);
  });
  it.each(['disabled', 'admin-leak', 'paid-search'])('stops before any run when preflight fails: %s', async mode => {
    const host = mockedHost(mode);
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result.status).toBe('stopped'); expect(result.runStartRequests).toBe(0);
    expect(JSON.stringify(result)).not.toContain(session);
  });
  it('keeps free production feeds active while excluding their declared and overridden companies with the actual matcher', async () => {
    const host = mockedHost('feed');
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result).toMatchObject({ status: 'passed', runStartRequests: 1, feedExclusionProof: { feedCount: 1, observedRows: 1, exclusionCount: 3 } });
    const profile = host.requests.find(item => item.body?.action === 'save_profile')!.body!.profile as LoopProfileInput;
    const loaded = await loadDiscoveryMatcher();
    expect(profile.excludedTerms).toEqual(['production board employer', 'production-board', 'public subsidiary']);
    for (const company of ['Production Board Employer', 'production-board', 'Public Subsidiary']) expect(loaded.matches(profile, { title: profile.targetTitles[0], location: profile.locations[0], company, description: 'Worst-case matching role.' })).toBe(false);
    expect(host.requests.filter(item => item.body?.action === 'start_run')).toHaveLength(1);
    expect(host.snapshot.employerSources).toHaveLength(1);
  });
  it('stops before a paid start if a feed exclusion would also restrict the fictional manual employer', async () => {
    const host = mockedHost('feed-collision');
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result).toMatchObject({ status: 'stopped', runStartRequests: 0, failure: { check: 'feed-exclusions-do-not-restrict-fictional-manual-facts-or-company' } });
    expect(host.requests.some(item => item.body?.action === 'start_run')).toBe(false);
  });
  it('loads the source matcher rather than a harness copy of the exclusion logic', async () => {
    const loaded = await loadDiscoveryMatcher();
    const profile = { excludedTerms: ['Public Subsidiary'], targetTitles: ['Operations Analyst'], locations: ['Dubai'] } as LoopProfileInput;
    for (const company of ['Public Subsidiary', 'Generated QA Employer']) {
      const opportunity = { title: 'Operations Analyst', location: 'Dubai', company, description: 'Reporting role.' } as LoopOpportunity;
      expect(loaded.matches(profile, opportunity)).toBe(company === 'Generated QA Employer');
    }
    expect(loaded.sourceSha256).toMatch(/^[a-f\d]{64}$/);
  });
  it('proves both actual fixture claims and reproduces the missing education-heading failure without hosting', async () => {
    const host = mockedHost();
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result.status).toBe('passed');
    const profile = host.requests.find(item => item.body?.action === 'save_profile')!.body!.profile as LoopProfileInput;
    const claims = host.requests.filter(item => item.body?.action === 'save_claim').map(item => item.body!.claim);
    const loaded = await loadDiscoveryMatcher();
    expect(() => loaded.validateFixtures(profile, claims)).not.toThrow();
    expect(() => loaded.validateFixtures({ ...profile, sourceText: profile.sourceText.replace('Generated QA University | 2026\n', '') }, claims)).toThrow(/nearby literal course, project or employer label/);
    const proofIndex = result.checks.findIndex(check => check.name === 'both-fictional-claims-pass-actual-source-context-validation-before-saving');
    expect(proofIndex).toBeGreaterThan(-1);
  });
  it('retains uncertain usage and never starts or resumes another run', async () => {
    const host = mockedHost('uncertain');
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result).toMatchObject({ status: 'stopped', runStartRequests: 1, retainedReservationUsd: 0.05, recordsRetainedForReconciliation: true });
    expect(host.requests.filter(item => item.body?.action === 'start_run')).toHaveLength(1);
    expect(host.requests.some(item => ['resume_run', 'erase_loop', 'save_schedule'].includes(String(item.body?.action)))).toBe(false);
  });
  it('sanitizes thrown exceptions and does not retry an uncertain start', async () => {
    const host = mockedHost('network-error');
    const result = await verifyCandidateOpenRouter({ execute: true, sourceReader: async () => publicSource, fetcher: host.fetcher, sleep: async () => {} });
    expect(result).toMatchObject({ status: 'stopped', runStartRequests: 1, failure: { type: 'Error' } });
    expect(JSON.stringify(result)).not.toContain(session);
    expect(host.requests.filter(item => item.body?.action === 'start_run')).toHaveLength(1);
  });
});
