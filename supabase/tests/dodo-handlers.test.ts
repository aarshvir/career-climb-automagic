// @vitest-environment node
// Hermetic handler tests: Deno, the Supabase admin client and fetch are all replaced, so no real
// account, database, Dodo API, socket or key is used.
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dodoApiKey, dodoCheckoutUrl, dodoEnvelope, dodoEnvironment, dodoOwner, dodoPayment, dodoPaymentId, dodoProduct, dodoProductId, dodoRefund, dodoRefundId,
  dodoRequestId, dodoSessionId, dodoSign } from './dodo-fixtures';

type Handler = (request: Request) => Promise<Response>;
const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  orderQueries: [] as Record<string, unknown>[],
  rpc: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>,
  boundOrder: true,
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.57.4', () => ({
  createClient: () => ({
    auth: { getUser: async (token: string) => token === 'fixture-owner-token'
      ? { data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null }
      : { data: { user: null }, error: { message: 'invalid token' } } },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpc[name]?.(args) ?? { data: null, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = { table };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
        maybeSingle: async () => { state.orderQueries.push(filters); return { data: state.boundOrder ? { id: 'order-fixture' } : null, error: null }; },
      };
      return builder;
    },
  }),
}));

const handlers: Handler[] = [];
let env: Record<string, string | undefined> = {};
const fetches: { url: string; method: string; headers: Headers; body: unknown }[] = [];
let provider: (url: URL, method: string) => Response | null = () => null;
let product: Record<string, unknown> = dodoProduct();
let session: Record<string, unknown> = { session_id: dodoSessionId, checkout_url: dodoCheckoutUrl };
let payment: Record<string, unknown> = dodoPayment();

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (handler: Handler) => { handlers.push(handler); } });
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const raw = typeof init?.body === 'string' ? init.body : null;
    fetches.push({ url: url.href, method, headers: new Headers(init?.headers), body: raw ? JSON.parse(raw) : null });
    const custom = provider(url, method);
    if (custom) return custom;
    if (url.origin === 'https://test.dodopayments.com') {
      if (method === 'GET' && url.pathname === `/products/${dodoProductId}`) return Response.json(product);
      if (method === 'POST' && url.pathname === '/checkouts') return Response.json(session);
      if (method === 'GET' && url.pathname === `/payments/${dodoPaymentId}`) return Response.json(payment);
    }
    throw new Error('Unexpected network request blocked by hermetic test.');
  });
  await import('../functions/create-checkout/index.ts');
  await import('../functions/dodo-webhook/index.ts');
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  env = { ...dodoEnvironment(), SUPABASE_URL: 'https://supabase.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-real-key', ALLOWED_ORIGINS: 'https://staging.fixture.invalid' };
  fetches.length = 0; state.rpcCalls.length = 0; state.orderQueries.length = 0; state.boundOrder = true;
  state.rpc = {
    jobvance_begin_checkout: () => ({ data: { status: 'created', creationClaimAcquired: true, checkout_url: null, checkout_session_id: null, created_at: new Date().toISOString() }, error: null }),
    jobvance_finish_checkout: () => ({ data: null, error: null }),
    jobvance_apply_payment_event: () => ({ data: { duplicate: false }, error: null }),
  };
  provider = () => null; product = dodoProduct(); session = { session_id: dodoSessionId, checkout_url: dodoCheckoutUrl }; payment = dodoPayment();
});

const checkout = () => handlers[0];
const webhook = () => handlers[1];
const rpc = (name: string) => state.rpcCalls.filter(call => call.name === name);
function request(value: unknown, authorization: string | null = 'Bearer fixture-owner-token') {
  return new Request('https://edge.fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(value) });
}
let webhookCounter = 0;
function signed(raw: string, options: { id?: string; timestamp?: number; signature?: string } = {}) {
  const id = options.id ?? `msg_FixtureWebhook${++webhookCounter}`;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  return new Request('https://edge.fixture.invalid', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'webhook-id': id,
    'webhook-timestamp': String(timestamp), 'webhook-signature': options.signature ?? dodoSign(raw, id, timestamp) } });
}

describe('create-checkout Dodo branch', () => {
  it('stays unavailable while billing is disabled and never calls Dodo', async () => {
    env.JOBVANCE_BILLING_ENABLED = undefined;
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('BILLING_UNAVAILABLE');
    expect(fetches).toHaveLength(0);
    expect(rpc('jobvance_begin_checkout')).toHaveLength(0);
  });
  it('rejects missing authentication before reaching billing', async () => {
    expect((await checkout()(request({ requestId: dodoRequestId }, null))).status).toBe(401);
    expect(fetches).toHaveLength(0);
  });
  it('verifies the product, claims the order, creates one server-fixed session and stores it', async () => {
    const response = await checkout()(request({ requestId: dodoRequestId, productId: 'pdt_Forged', quantity: 100, userId: '22222222-2222-4222-8222-222222222222', amount: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ provider: 'dodo', url: dodoCheckoutUrl, sessionId: dodoSessionId, billingMode: 'test' });
    expect(fetches.map(call => `${call.method} ${call.url}`)).toEqual([`GET https://test.dodopayments.com/products/${dodoProductId}`, 'POST https://test.dodopayments.com/checkouts']);
    for (const call of fetches) expect(call.headers.get('Authorization')).toBe(`Bearer ${dodoApiKey}`);
    const body = fetches[1].body as Record<string, unknown>;
    expect(body.product_cart).toEqual([{ product_id: dodoProductId, quantity: 1 }]);
    expect(body.metadata).toEqual({ user_id: dodoOwner, request_id: dodoRequestId, product: 'jobvance_ten_pack_v1' });
    expect(body.return_url).toBe('https://staging.fixture.invalid/dashboard?checkout=success');
    expect(body).not.toHaveProperty('customer');
    expect(rpc('jobvance_begin_checkout')[0].args).toEqual({ p_user_id: dodoOwner, p_request_id: dodoRequestId, p_provider: 'dodo', p_billing_mode: 'test' });
    expect(rpc('jobvance_finish_checkout')[0].args).toEqual({ p_user_id: dodoOwner, p_request_id: dodoRequestId, p_session_id: dodoSessionId, p_url: dodoCheckoutUrl,
      p_expires_at: null, p_provider: 'dodo', p_billing_mode: 'test' });
  });
  it('returns the stored session on a retry without creating another one', async () => {
    state.rpc.jobvance_begin_checkout = () => ({ data: { status: 'created', creationClaimAcquired: false, checkout_url: dodoCheckoutUrl, checkout_session_id: dodoSessionId,
      checkout_expires_at: null, created_at: new Date(Date.now() - 60000).toISOString() }, error: null });
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(await response.json()).toEqual({ provider: 'dodo', url: dodoCheckoutUrl, sessionId: dodoSessionId, billingMode: 'test' });
    expect(fetches.some(call => call.url.endsWith('/checkouts'))).toBe(false);
    expect(rpc('jobvance_finish_checkout')).toHaveLength(0);
  });
  it('refuses a stored session older than the documented 24-hour lifetime', async () => {
    state.rpc.jobvance_begin_checkout = () => ({ data: { status: 'created', creationClaimAcquired: false, checkout_url: dodoCheckoutUrl, checkout_session_id: dodoSessionId,
      checkout_expires_at: null, created_at: new Date(Date.now() - 24 * 3600000 - 1000).toISOString() }, error: null });
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CHECKOUT_EXPIRED');
  });
  it('never re-creates a session after an ambiguous earlier attempt', async () => {
    state.rpc.jobvance_begin_checkout = () => ({ data: { status: 'created', creationClaimAcquired: false, checkout_url: null, checkout_session_id: null, created_at: new Date().toISOString() }, error: null });
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CHECKOUT_RECOVERY_REQUIRED');
    expect(fetches.some(call => call.url.endsWith('/checkouts'))).toBe(false);
  });
  it('refuses a mispriced product before claiming an order or opening checkout', async () => {
    product = dodoProduct({}, { price: 2500 });
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(503);
    expect(rpc('jobvance_begin_checkout')).toHaveLength(0);
    expect(fetches.some(call => call.url.endsWith('/checkouts'))).toBe(false);
  });
  it('fails closed without leaking the key when Dodo errors or times out', async () => {
    provider = (url, method) => method === 'POST' && url.pathname === '/checkouts' ? new Response(JSON.stringify({ message: `bad key ${dodoApiKey}` }), { status: 401 }) : null;
    let response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(503);
    let text = await response.text();
    expect(JSON.parse(text).code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(text).not.toContain(dodoApiKey);
    expect(rpc('jobvance_finish_checkout')).toHaveLength(0);
    provider = (url, method) => { if (method === 'POST' && url.pathname === '/checkouts') throw new TypeError(`network failure for Bearer ${dodoApiKey}`); return null; };
    response = await checkout()(request({ requestId: dodoRequestId }));
    text = await response.text();
    expect(response.status).toBe(503);
    expect(text).not.toContain(dodoApiKey);
  });
  it('refuses a session URL outside the test checkout host', async () => {
    session = { session_id: dodoSessionId, checkout_url: `https://checkout.dodopayments.com/session/${dodoSessionId}` };
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('INVALID_PAYMENT_SESSION');
    expect(rpc('jobvance_finish_checkout')).toHaveLength(0);
  });
});

describe('dodo-webhook handler', () => {
  const paid = () => dodoEnvelope('payment.succeeded', dodoPayment());
  it('is unavailable unless Dodo is the configured provider', async () => {
    env.JOBVANCE_PAYMENT_PROVIDER = 'stripe';
    expect((await webhook()(signed(paid()))).status).toBe(503);
    env = { ...env, ...dodoEnvironment({ JOBVANCE_BILLING_ENABLED: 'false' }) };
    expect((await webhook()(signed(paid()))).status).toBe(503);
    expect(state.rpcCalls).toHaveLength(0);
  });
  it('rejects unsigned, tampered and stale deliveries before any database work', async () => {
    const raw = paid();
    expect((await webhook()(new Request('https://edge.fixture.invalid', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json' } }))).status).toBe(400);
    const good = signed(raw);
    expect((await webhook()(new Request(good.url, { method: 'POST', headers: good.headers, body: raw.replace('3045', '1') }))).status).toBe(400);
    const stale = Math.floor(Date.now() / 1000) - 600;
    expect((await webhook()(signed(raw, { timestamp: stale }))).status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.orderQueries).toHaveLength(0);
  });
  it('grants a bound payment through the provider-scoped ledger', async () => {
    const response = await webhook()(signed(paid(), { id: 'msg_FixturePaidEvent' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: false });
    expect(state.orderQueries[0]).toEqual({ table: 'billing_orders', user_id: dodoOwner, request_id: dodoRequestId, provider: 'dodo', billing_mode: 'test', checkout_session_id: dodoSessionId });
    expect(rpc('jobvance_apply_payment_event')[0].args).toEqual({ p_event_id: 'dodo_msg_FixturePaidEvent', p_event_type: 'payment.succeeded',
      p_event_created: Math.floor(Date.parse('2026-10-17T10:00:00Z') / 1000), p_action: 'paid', p_user_id: dodoOwner, p_request_id: dodoRequestId,
      p_payment_intent: `dodo_${dodoPaymentId}`, p_session_id: dodoSessionId, p_refund_amount: 0, p_provider: 'dodo', p_billing_mode: 'test', p_refund_id: null,
      p_paid_amount: 3045, p_paid_tax: 145 });
    expect(fetches).toHaveLength(0);
  });
  it('rejects a payment that our backend did not create and bind', async () => {
    state.boundOrder = false;
    const response = await webhook()(signed(paid()));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('UNBOUND_PAYMENT');
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
  it('rejects a mismatched paid amount without writing the ledger', async () => {
    const response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPayment({ total_amount: 1000, tax: 0 }))));
    expect(response.status).toBe(400);
    expect(state.orderQueries).toHaveLength(0);
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
  it('acknowledges unrelated events and products without touching the ledger', async () => {
    for (const raw of [dodoEnvelope('payment.failed', dodoPayment({ status: 'failed' })), dodoEnvelope('dispute.opened', { payload_type: 'Dispute' }),
      dodoEnvelope('payment.succeeded', dodoPayment({ metadata: { order: 'another product' } }))]) {
      const response = await webhook()(signed(raw));
      expect(await response.json()).toEqual({ received: true, ignored: true });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });
  it('revokes credits on a succeeded refund after loading the server-side payment', async () => {
    const response = await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund()), { id: 'msg_FixtureRefundEvent' }));
    expect(response.status).toBe(200);
    expect(fetches.map(call => `${call.method} ${call.url}`)).toEqual([`GET https://test.dodopayments.com/payments/${dodoPaymentId}`]);
    expect(rpc('jobvance_apply_payment_event')[0].args).toMatchObject({ p_event_id: 'dodo_msg_FixtureRefundEvent', p_event_type: 'refund.succeeded', p_action: 'refund',
      p_payment_intent: `dodo_${dodoPaymentId}`, p_session_id: dodoSessionId, p_refund_amount: 2900, p_refund_id: `dodo_${dodoRefundId}`, p_provider: 'dodo' });
  });
  it('records a partial refund proportionally and rejects refunds that are not final', async () => {
    await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund({ amount: 1000, is_partial: true }))));
    expect(rpc('jobvance_apply_payment_event')[0].args.p_refund_amount).toBe(952);
    state.rpcCalls.length = 0;
    expect((await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund({ status: 'pending' }))))).status).toBe(400);
    expect((await webhook()(signed(dodoEnvelope('refund.failed', dodoRefund({ status: 'failed' }))))).status).toBe(200);
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
  it('ignores refunds for other products and rejects unbound refunds', async () => {
    payment = dodoPayment({ metadata: {} });
    expect(await (await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund())))).json()).toEqual({ received: true, ignored: true });
    payment = dodoPayment();
    state.boundOrder = false;
    expect((await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund())))).status).toBe(409);
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
});
