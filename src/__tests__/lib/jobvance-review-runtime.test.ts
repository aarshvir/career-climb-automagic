// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createReviewWorkerHandler, REVIEW_BASELINE_COMMIT, REVIEW_DIMENSIONS, reviewSha256, validateIndependentResult, validateCommentaryResult } from '../../../supabase/functions/_shared/jobvance-review-runtime';

const owner = '00000000-0000-4000-8000-000000000001';
const ticket = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const batchId = '00000000-0000-4000-8000-000000000004';
const usageId = '00000000-0000-4000-8000-000000000005';
const env = (name: string) => name === 'JOB_LOOP_OPENROUTER_API_KEY' ? 'fictional-key-never-returned' : undefined;
const review = () => ({ scores: REVIEW_DIMENSIONS.map(([category], i) => ({ category, score: 40 + i, reason: 'Source-only fictional reason.' })), strengths: ['A source-supported strength.'], weaknesses: ['A source-supported weakness.'], actions: [{ action: 'Validate a source-only flow.', acceptanceCriterion: 'Observe the specified complete flow with synthetic inputs.' }], evidenceLimitations: ['No authenticated production journey was observed.'] });
async function payload() {
  const excerpt = 'An explicitly fictional public illustration.';
  return { requestId, batchId, baselineCommit: REVIEW_BASELINE_COMMIT, persona: 'student', model: 'moonshotai/kimi-k3', effort: 'max', evidence: { version: 1, sourceCommit: REVIEW_BASELINE_COMMIT, kind: 'pinned_public_source', coverageLimits: ['Source-only; no executed customer journey.'], rubric: REVIEW_DIMENSIONS.map(([key,label]) => ({ key,label })), sources: [{ path: 'src/pages/AudienceLanding.tsx', sourceSha256: 'a'.repeat(64), startLine: 1, endLine: 1, excerptSha256: await reviewSha256(excerpt), excerpt, truncated: false }] } };
}
function request(body: unknown = { action: 'independent_review' }, token = ticket, method = 'POST') { return new Request('https://fictional.supabase.co/functions/v1/jobvance-review-worker', { method, headers: { 'Content-Type': 'application/json', 'x-jobvance-task-ticket': token }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }); }
function setup(bound: unknown, options: { isNew?: boolean; state?: string; result?: unknown; databaseFailure?: string; fetcher?: typeof fetch } = {}) {
  const pending: Promise<unknown>[] = []; const order: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    order.push(name);
    if (options.databaseFailure && name === 'jobvance_admin_reserve') return { data: null, error: { message: options.databaseFailure } };
    if (name === 'jobvance_consume_admin_ticket') return { data: { owner_id: owner, payload: bound }, error: null };
    if (name === 'jobvance_admin_reserve') return { data: { id: usageId, is_new: options.isNew ?? true, status: options.state ?? 'reserved', result: options.result ?? null }, error: null };
    return { data: { id: usageId, status: args.p_uncertain ? 'uncertain' : 'settled', result: args.p_result }, error: null };
  });
  const fetcher = options.fetcher ?? vi.fn(async (_url: unknown, init?: RequestInit) => {
    order.push('provider'); const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'fixture-provider-request', model: body.model + '-2026', usage: { prompt_tokens: 200, completion_tokens: 400, cost: 0.001 }, choices: [{ message: { content: JSON.stringify(review()), reasoning: 'PRIVATE PROVIDER REASONING MUST NEVER PERSIST' } }] }), { headers: { 'X-Private-Provider': 'raw-header-must-never-persist' } });
  }) as unknown as typeof fetch;
  return { rpc, fetcher, order, pending, handler: createReviewWorkerHandler({ db: { rpc }, env, fetcher, waitUntil: work => pending.push(work) }) };
}

describe('ticket-bound provider validation', () => {
  it('consumes the ticket, validates via the no-cost key endpoint and never exposes the key', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { label: 'private label never returned', usage: 0, is_free_tier: false, limit_remaining: 5 } }))) as unknown as typeof fetch;
    const s = setup({}, { fetcher }); const response = await s.handler(request({ action: 'provider_status' })); const body = await response.json();
    expect(response.status).toBe(200); expect(body.providerStatus).toMatchObject({ configured: true, valid: true, status: 'valid' });
    expect(s.rpc).toHaveBeenNthCalledWith(1,'jobvance_consume_admin_ticket', { p_ticket: ticket, p_action: 'provider_status' });
    expect(s.rpc).toHaveBeenNthCalledWith(2,'jobvance_admin_record_event',{p_actor:owner,p_action:'provider_status',p_details:{configured:true,valid:true}});
    expect(fetcher).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', expect.objectContaining({ headers: { Authorization: 'Bearer fictional-key-never-returned' } }));
    expect(JSON.stringify(body)).not.toMatch(/fictional-key|private label|limit_remaining/); expect(s.pending).toHaveLength(0);
  });
  it('returns a sanitized invalid-key result without reserving or calling a model', async () => {
    const s = setup({}, { fetcher: vi.fn(async () => new Response('private rejection', { status: 401 })) as unknown as typeof fetch });
    expect(await (await s.handler(request({ action: 'provider_status' }))).json()).toMatchObject({ providerStatus: { valid: false, status: 'invalid' } });
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not contact any provider after a revoked, expired or consumed ticket', async () => {
    const s = setup({}); s.rpc.mockResolvedValue({ data: null, error: { message: 'ADMIN_TICKET_INVALID SQL internal detail' } });
    const response = await s.handler(request({ action: 'provider_status' })); expect(response.status).toBe(401);
    expect(s.fetcher).not.toHaveBeenCalled(); expect(JSON.stringify(await response.json())).not.toContain('SQL internal');
  });
  it.each(['ownerId','model','payload','evidence'])('rejects caller %s overrides before ticket consumption', async key => {
    const s = setup({}); expect((await s.handler(request({ action: 'provider_status', [key]: 'override' }))).status).toBe(400); expect(s.rpc).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed ticket and non-POST requests before database access', async () => {
    const s = setup({}); expect((await s.handler(request({ action: 'provider_status' }, 'not-a-ticket'))).status).toBe(400); expect((await s.handler(request({}, ticket, 'GET'))).status).toBe(405); expect(s.rpc).not.toHaveBeenCalled();
  });
});

describe('bounded independent review lifecycle', () => {
  it('reserves before a maximum-effort model call, returns202 and persists only validated results and usage', async () => {
    const s = setup(await payload()); const response = await s.handler(request()); expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ accepted: true, usageId });
    await Promise.all(s.pending);
    expect(s.order).toEqual(['jobvance_consume_admin_ticket','jobvance_admin_reserve','provider','jobvance_admin_settle']);
    const sent = JSON.parse(String(vi.mocked(s.fetcher).mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ model: 'moonshotai/kimi-k3', max_tokens: 16384, reasoning: { effort: 'max', exclude: true }, provider: { allow_fallbacks: false } });
    const reserve = s.rpc.mock.calls.find(([name]) => name === 'jobvance_admin_reserve')![1]; expect(reserve).toMatchObject({ p_actor: owner, p_request: requestId, p_batch: batchId, p_provider: 'openrouter', p_model: 'moonshotai/kimi-k3', p_cap_micros: 50000000 });
    const settled = s.rpc.mock.calls.find(([name]) => name === 'jobvance_admin_settle')![1]; expect(settled).toMatchObject({ p_actual: 1000, p_uncertain: false, p_result: { returnedModel: 'moonshotai/kimi-k3-2026', effort: 'max', baselineCommit: REVIEW_BASELINE_COMMIT, persona: 'student', review: { overall: 44.5 } } });
    expect(JSON.stringify(settled)).not.toMatch(/PROVIDER REASONING|raw-header|fictional-key-never/);
  });
  it.each(['reserved','uncertain','settled'])('replays a %s reservation without another external call', async state => {
    const s = setup(await payload(), { isNew: false, state, result: { kind: 'failure', code: 'ROUTER_USAGE_UNCERTAIN' } }); const response = await s.handler(request());
    expect(await response.json()).toMatchObject({ accepted: false, state }); expect(s.fetcher).not.toHaveBeenCalled(); expect(s.pending).toHaveLength(0); expect(s.rpc).toHaveBeenCalledTimes(2);
  });
  it('replays only sanitized saved reviews, recalculates the mean and rejects nested reasoning additions',async()=>{
    const initial=setup(await payload());await initial.handler(request());await Promise.all(initial.pending);
    const saved=initial.rpc.mock.calls.at(-1)![1].p_result as Record<string,unknown>;
    const replay=setup(await payload(),{isNew:false,state:'settled',result:{...saved,review:{...(saved.review as Record<string,unknown>),overall:99}}});
    expect(await(await replay.handler(request())).json()).toMatchObject({result:{review:{overall:44.5}}});expect(replay.fetcher).not.toHaveBeenCalled();
    const contaminated=setup(await payload(),{isNew:false,state:'settled',result:{...saved,usage:{inputTokens:200,outputTokens:400,actualMicros:1000,reasoning:'private'}}});
    expect(await(await contaminated.handler(request())).json()).toMatchObject({result:null});
  });
  it('keeps malformed output uncertain without persisting the rejected content',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:'moonshotai/kimi-k3',usage:{prompt_tokens:200,completion_tokens:400,cost:.001},choices:[{message:{content:JSON.stringify({...review(),reasoning:'private rejected content'})}}]})))as unknown as typeof fetch;
    const s=setup(await payload(),{fetcher});await s.handler(request());await Promise.all(s.pending);
    expect(s.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_actual:null,p_uncertain:true,p_result:{kind:'failure',code:'REVIEW_OUTPUT_INVALID'}});
    expect(JSON.stringify(s.rpc.mock.calls)).not.toContain('private rejected content');
  });
  it.each(['ADMIN_BUDGET_LIMIT','ADMIN_REVIEW_BATCH_LIMIT','ADMIN_REQUEST_CONFLICT'])('never calls a provider if reserve rejects %s', async databaseFailure => {
    const s = setup(await payload(), { databaseFailure }); const response = await s.handler(request()); expect(response.status).toBe(databaseFailure === 'ADMIN_REQUEST_CONFLICT' ? 409 : 429); expect(s.fetcher).not.toHaveBeenCalled(); expect(s.pending).toHaveLength(0);
  });
  it('settles a known pre-provider rejection at zero and retains other errors as uncertain', async () => {
    const rejected = setup(await payload(), { fetcher: vi.fn(async () => new Response(JSON.stringify({ error: { message: 'sensitive raw provider response' } }), { status: 402 })) as unknown as typeof fetch });
    await rejected.handler(request()); await Promise.all(rejected.pending); expect(rejected.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_actual: 0, p_uncertain: false, p_result: { code: 'ROUTER_REQUEST_REJECTED' } });
    const uncertain = setup(await payload(), { fetcher: vi.fn(async () => { throw new Error('private timeout context'); }) as unknown as typeof fetch });
    await uncertain.handler(request()); await Promise.all(uncertain.pending); expect(uncertain.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_actual: null, p_uncertain: true, p_result: { code: 'ROUTER_USAGE_UNCERTAIN' } });
    expect(JSON.stringify(uncertain.rpc.mock.calls)).not.toContain('private timeout');
  });
  it.each([{ model: 'openai/gpt-6.1-sol' }, { effort: 'medium' }, { baselineCommit: 'new-source' }, { persona: 'owner' }])('rejects an incompatible ticket payload %j before reservation', async patch => {
    const s = setup({ ...await payload(), ...patch }); expect((await s.handler(request())).status).toBe(400); expect(s.rpc).toHaveBeenCalledTimes(1); expect(s.fetcher).not.toHaveBeenCalled();
  });
  it('rejects private paths, oversize evidence and excerpt tampering', async () => {
    for (const mode of ['private','oversize','tamper']) {
      const bound = await payload(); if (mode === 'private') bound.evidence.sources[0].path = '.env.production'; else if (mode === 'oversize') bound.evidence.sources[0].excerpt = 'x'.repeat(120001); else bound.evidence.sources[0].excerpt = 'tampered';
      const s = setup(bound); expect((await s.handler(request())).status).toBe(400); expect(s.fetcher).not.toHaveBeenCalled(); expect(s.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it('refuses a model-supplied overall, noninteger/duplicate scores and hidden reasoning fields', () => {
    expect(validateIndependentResult(review()).overall).toBe(44.5);
    expect(() => validateIndependentResult({ ...review(), overall: 99 })).toThrow();
    const fractional = review(); fractional.scores[0].score = 99.5; expect(() => validateIndependentResult(fractional)).toThrow();
    const duplicate = review(); duplicate.scores[1] = duplicate.scores[0]; expect(() => validateIndependentResult(duplicate)).toThrow();
    expect(() => validateIndependentResult({ ...review(), reasoning: 'private' })).toThrow();
  });
});

describe('aggregate admin commentary', () => {
  it('uses only aggregate allowlisted input, medium effort and a4096token bound', async () => {
    const input = { period: { days: 7, start: '2026-10-05T00:00:00Z', end: '2026-10-12T00:00:00Z' }, metrics: [{ key: 'completed_runs', count: 3, denominator: 5, availability: 'measured' }], budget: { capUsd: 50, committedUsd: 1, actualUsd: .5, uncertainUsd: .5 }, scheduler: { ready: false, activeSchedules: 2, staleLeases: 0 } };
    const commentary = { observations: [{ metricKeys: ['completed_runs'], text: 'The available completion count needs a longer observation window.' }], actions: [], limitations: ['Small sample.'] };
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { const body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ model: body.model, usage: { prompt_tokens: 200, completion_tokens: 100, cost: .001 }, choices: [{ message: { content: JSON.stringify(commentary) } }] })); }) as unknown as typeof fetch;
    const s = setup({ requestId, model: 'openai/gpt-6.1-sol', input }, { fetcher }); expect((await s.handler(request({ action: 'admin_commentary' }))).status).toBe(202); await Promise.all(s.pending);
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]?.body))).toMatchObject({ max_tokens: 4096, reasoning: { effort: 'medium' } });
    expect(s.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_result: { kind: 'admin_commentary', metricKeys: ['completed_runs'], review: commentary } });
    const contaminated = setup({ requestId, model: 'openai/gpt-6.1-sol', input: { ...input, users: [{ email: 'private@example.test' }] } }); expect((await contaminated.handler(request({ action: 'admin_commentary' }))).status).toBe(400); expect(contaminated.fetcher).not.toHaveBeenCalled();
  });
  it('rejects invented metric references and oversized commentary', () => {
    expect(() => validateCommentaryResult({ observations: [{ metricKeys: ['invented'], text: 'Unknown.' }], actions: [], limitations: ['Unknown.'] }, ['completed_runs'])).toThrow();
    expect(() => validateCommentaryResult({ observations: [{ metricKeys: ['completed_runs'], text: 'x'.repeat(501) }], actions: [], limitations: ['Unknown.'] }, ['completed_runs'])).toThrow();
  });
});
