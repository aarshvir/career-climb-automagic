// @vitest-environment node
// Actual HTTP entrypoint; SDK and Meta are intercepted, never production services.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
type Handler = (request: Request) => Promise<Response>;
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], calls: [] as { name: string; args: Record<string, unknown> }[], authError: false, claimError: false, markError: false }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.57.4', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: state.authError ? null : { id: '11111111-1111-4111-8111-111111111111', email: 'fictional@example.com', created_at: new Date().toISOString() } }, error: state.authError }) },
  rpc: async (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args }); return name === 'jobvance_meta_mark_sent' ? { data: 1, error: state.markError } : { data: state.rows, error: state.claimError }; },
}) }));
let handler: Handler;
let env: Record<string, string>;
let meta: ReturnType<typeof vi.fn>;
const request = (kind = 'purchase', headers: Record<string, string> = {}) => new Request('https://fixture.invalid/meta-conversions', { method: 'POST', headers: { Authorization: 'Bearer fictional-token', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ kind, requestId: '11111111-1111-4111-8111-111111111111', pageUrl: 'https://jobvance.io/loop/private-receipt?payment_id=secret' }) });
const purchase = (mode: 'live' | 'test' = 'live') => ({ event_key: 'pay_fictional', occurred_at: new Date().toISOString(), plan_label: 'Job Loop Starter', amount_minor: 2900, currency: 'USD', usd: 29, mode });
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (value: Handler) => { handler = value; } });
  await import('../functions/meta-conversions/index.ts');
});
beforeEach(() => {
  env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fictional-service', META_CAPI_ACCESS_TOKEN: 'fictional-meta' };
  state.rows = [purchase()]; state.calls = []; state.authError = false; state.claimError = false; state.markError = false;
  meta = vi.fn(async (_url: string, init: RequestInit) => Response.json({ events_received: JSON.parse(String(init.body)).data.length }));
  vi.stubGlobal('fetch', meta);
});
afterAll(() => vi.unstubAllGlobals());
describe('actual commerce HTTP composition', () => {
  it('uses database facts, a generic public source, and marks a successfully accepted live receipt', async () => {
    const response = await handler(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ sent: true, count: 1 });
    const payload = JSON.parse(String(meta.mock.calls[0][1].body));
    expect(payload.data[0].event_source_url).toBe('https://jobvance.io/pricing'); expect(payload).not.toHaveProperty('test_event_code');
    expect(JSON.stringify(payload)).not.toMatch(/private-receipt|payment_id|fictional@example/);
    expect(state.calls[1]).toMatchObject({ name: 'jobvance_meta_mark_sent', args: { p_mode: 'live', p_kind: 'purchase', p_keys: ['pay_fictional'] } });
  });
  it('keeps live commerce live and excludes sandbox intake even when a Test Events tag exists', async () => {
    env.META_CAPI_TEST_EVENT_CODE = 'fictional-test-code';
    expect((await handler(request())).status).toBe(200); expect(meta).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(meta.mock.calls[0][1].body))).not.toHaveProperty('test_event_code');
    expect(state.calls[0].args.p_include_test).toBe(false);
    state.rows = [purchase('test')]; meta.mockClear();
    expect((await handler(request())).status).toBe(503); expect(meta).not.toHaveBeenCalled();
  });
  it('does not transmit a test payment without a test code, even if a malformed claim offers one', async () => {
    state.rows = [purchase('test')]; expect((await handler(request())).status).toBe(503); expect(meta).not.toHaveBeenCalled();
    expect(state.calls.map(call => call.name)).not.toContain('jobvance_meta_mark_sent');
  });
  it.each([0, 'missing'])('does not mark receipts when Meta has no exact accepted count: %s', async count => {
    meta.mockResolvedValue(Response.json(count === 'missing' ? {} : { events_received: count }));
    expect((await handler(request())).status).toBe(503); expect(state.calls.map(call => call.name)).not.toContain('jobvance_meta_mark_sent');
  });
  it('retains retryability after a claim, provider or marking failure', async () => {
    state.claimError = true; expect((await handler(request())).status).toBe(503); expect(meta).not.toHaveBeenCalled();
    state.claimError = false; meta.mockResolvedValueOnce(Response.json({ error: { code: 2 } }, { status: 503 }));
    expect((await handler(request())).status).toBe(503); expect(state.calls.map(call => call.name)).not.toContain('jobvance_meta_mark_sent');
    state.markError = true; expect((await handler(request())).status).toBe(503);
  });
  it('honors GPC before any database or Meta call and requires a verified account', async () => {
    expect((await (await handler(request('purchase', { 'Sec-GPC': '1' }))).json()).reason).toBe('privacy_signal'); expect(state.calls).toHaveLength(0); expect(meta).not.toHaveBeenCalled();
    state.authError = true; expect((await handler(request())).status).toBe(401); expect(state.calls).toHaveLength(0);
  });
  it('retains registration event identity and accepts empty commerce claims without sends', async () => {
    expect((await handler(request('registration'))).status).toBe(200); expect(state.calls).toHaveLength(0);
    expect(JSON.parse(String(meta.mock.calls[0][1].body)).data[0].event_name).toBe('CompleteRegistration');
    state.rows = []; expect(await (await handler(request())).json()).toEqual({ sent: false, reason: 'nothing_new' }); expect(meta).toHaveBeenCalledTimes(1);
  });
});
