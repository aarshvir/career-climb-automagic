// @vitest-environment node
// Hermetic handler tests for one-time passes: Deno, the Supabase admin client and fetch are all replaced,
// so no real account, database, Dodo or model API, socket or key is used. Every value is invented.
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_PASS_PRODUCT, PASS_PLANS, type PassPlanKey } from '../functions/_shared/core';
import { dodoCheckoutUrl, dodoEnvelope, dodoOwner, dodoPassEnvironment, dodoPassPayment, dodoPayment, dodoPaymentId, dodoPlanProduct, dodoPlanProducts, dodoProduct, dodoProductId,
  dodoRefund, dodoRefundId, dodoRequestId, dodoSessionId, dodoSign, dodoEnvironment } from './dodo-fixtures';

type Handler = (request: Request) => Promise<Response>;
const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpc: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>,
  orderPlan: null as string | null,
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
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => table === 'jobvance_admin_config'
          ? { data: { monthly_cap_micros: 50000000, router_enabled: true, default_model: 'openai/gpt-6.1-sol' }, error: null }
          : { data: state.boundOrder ? { id: 'order-fixture', plan: state.orderPlan } : null, error: null },
      };
      return builder;
    },
  }),
}));

const handlers: Handler[] = [];
let env: Record<string, string | undefined> = {};
const fetches: { url: string; method: string; body: unknown }[] = [];
let products: Record<string, Record<string, unknown>> = {};
let payment: Record<string, unknown> = dodoPassPayment('search_30d');

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (handler: Handler) => { handlers.push(handler); } });
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    fetches.push({ url: url.href, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    if (url.origin === 'https://test.dodopayments.com') {
      const product = /^\/products\/(.+)$/.exec(url.pathname)?.[1];
      if (method === 'GET' && product && products[product]) return Response.json(products[product]);
      if (method === 'POST' && url.pathname === '/checkouts') return Response.json({ session_id: dodoSessionId, checkout_url: dodoCheckoutUrl });
      if (method === 'GET' && url.pathname === `/payments/${dodoPaymentId}`) return Response.json(payment);
    }
    throw new Error('Unexpected network request blocked by hermetic test.');
  });
  await import('../functions/create-checkout/index.ts');
  await import('../functions/dodo-webhook/index.ts');
  await import('../functions/get-entitlement/index.ts');
  await import('../functions/tailor-for-job/index.ts');
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  env = { ...dodoPassEnvironment(), SUPABASE_URL: 'https://supabase.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-real-key', ALLOWED_ORIGINS: 'https://staging.fixture.invalid',
    JOB_LOOP_OPENROUTER_API_KEY: 'fixture-router-key-not-a-credential' };
  fetches.length = 0; state.rpcCalls.length = 0; state.orderPlan = null; state.boundOrder = true;
  state.rpc = {
    jobvance_begin_checkout: () => ({ data: { status: 'created', creationClaimAcquired: true, checkout_url: null, checkout_session_id: null, created_at: new Date().toISOString() }, error: null }),
    jobvance_finish_checkout: () => ({ data: null, error: null }),
    jobvance_apply_payment_event: () => ({ data: { duplicate: false }, error: null }),
  };
  products = { [dodoProductId]: dodoProduct(), ...Object.fromEntries((Object.keys(dodoPlanProducts) as PassPlanKey[]).map(plan => [dodoPlanProducts[plan], dodoPlanProduct(plan)])) };
  payment = dodoPassPayment('search_30d');
});

const checkout = () => handlers[0], webhook = () => handlers[1], entitlement = () => handlers[2], tailor = () => handlers[3];
const rpc = (name: string) => state.rpcCalls.filter(call => call.name === name);
function request(value: unknown, authorization: string | null = 'Bearer fixture-owner-token', origin?: string) {
  return new Request('https://edge.fixture.invalid', { method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json',
    ...(authorization ? { Authorization: authorization } : {}), ...(origin ? { Origin: origin } : {}) } });
}
let webhookCounter = 0;
function signed(raw: string) {
  const id = `msg_FixturePassWebhook${++webhookCounter}`, timestamp = Math.floor(Date.now() / 1000);
  return new Request('https://edge.fixture.invalid', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'webhook-id': id,
    'webhook-timestamp': String(timestamp), 'webhook-signature': dodoSign(raw, id, timestamp) } });
}

describe('create-checkout with a pass plan', () => {
  it.each(['sprint_7d', 'search_30d', 'move_90d'] as const)('maps %s to its own Dodo product, price and order', async plan => {
    const response = await checkout()(request({ requestId: dodoRequestId, plan, productId: 'pdt_Forged', amount: 1, quantity: 9 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ provider: 'dodo', url: dodoCheckoutUrl, sessionId: dodoSessionId, billingMode: 'test' });
    expect(fetches.map(call => `${call.method} ${call.url}`)).toEqual([`GET https://test.dodopayments.com/products/${dodoPlanProducts[plan]}`, 'POST https://test.dodopayments.com/checkouts']);
    const body = fetches[1].body as Record<string, unknown>;
    expect(body.product_cart).toEqual([{ product_id: dodoPlanProducts[plan], quantity: 1 }]);
    expect(body.billing_currency).toBe('USD');
    expect(body.metadata).toEqual({ user_id: dodoOwner, request_id: dodoRequestId, product: JOB_PASS_PRODUCT, plan });
    expect(body.return_url).toBe('https://staging.fixture.invalid/applications?checkout=success');
    expect(rpc('jobvance_begin_checkout')[0].args).toEqual({ p_user_id: dodoOwner, p_request_id: dodoRequestId, p_provider: 'dodo', p_billing_mode: 'test', p_plan: plan });
    expect(rpc('jobvance_finish_checkout')[0].args).toMatchObject({ p_session_id: dodoSessionId, p_provider: 'dodo', p_plan: plan });
  });
  it('fails closed when a plan product is not priced at exactly that plan price', async () => {
    products[dodoPlanProducts.sprint_7d] = dodoPlanProduct('sprint_7d', {}, { price: PASS_PLANS.search_30d.amount });
    products[dodoPlanProducts.move_90d] = dodoPlanProduct('move_90d', {}, { currency: 'EUR' });
    for (const plan of ['sprint_7d', 'move_90d']) {
      const response = await checkout()(request({ requestId: dodoRequestId, plan }));
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe('INVALID_PASS_PRICE');
    }
    expect(rpc('jobvance_begin_checkout')).toHaveLength(0);
    expect(fetches.some(call => call.url.endsWith('/checkouts'))).toBe(false);
  });
  it('keeps the legacy path unchanged when no plan is sent', async () => {
    const response = await checkout()(request({ requestId: dodoRequestId }));
    expect(response.status).toBe(200);
    expect(fetches.map(call => `${call.method} ${call.url}`)).toEqual([`GET https://test.dodopayments.com/products/${dodoProductId}`, 'POST https://test.dodopayments.com/checkouts']);
    expect((fetches[1].body as Record<string, unknown>).metadata).toEqual({ user_id: dodoOwner, request_id: dodoRequestId, product: 'jobvance_ten_pack_v1' });
    expect((fetches[1].body as Record<string, unknown>).return_url).toBe('https://staging.fixture.invalid/dashboard?checkout=success');
    expect(rpc('jobvance_begin_checkout')[0].args).toEqual({ p_user_id: dodoOwner, p_request_id: dodoRequestId, p_provider: 'dodo', p_billing_mode: 'test' });
    expect(rpc('jobvance_finish_checkout')[0].args).not.toHaveProperty('p_plan');
  });
  it('refuses unknown plans, other providers and unconfigured passes before any provider call', async () => {
    let response = await checkout()(request({ requestId: dodoRequestId, plan: 'lifetime_free' }));
    expect(response.status).toBe(400);
    response = await checkout()(request({ requestId: dodoRequestId, plan: 'toString' }));
    expect(response.status).toBe(400);
    env = { ...env, JOBVANCE_PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
    response = await checkout()(request({ requestId: dodoRequestId, plan: 'sprint_7d' }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('BILLING_UNAVAILABLE');
    env = { ...env, ...dodoEnvironment(), DODO_PRODUCT_SPRINT: undefined, DODO_PRODUCT_SEARCH: undefined, DODO_PRODUCT_MOVE: undefined };
    response = await checkout()(request({ requestId: dodoRequestId, plan: 'sprint_7d' }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('BILLING_UNAVAILABLE');
    expect(fetches).toHaveLength(0);
    expect(rpc('jobvance_begin_checkout')).toHaveLength(0);
  });
  it('reports BILLING_UNAVAILABLE while billing is switched off', async () => {
    env.JOBVANCE_BILLING_ENABLED = 'false';
    const response = await checkout()(request({ requestId: dodoRequestId, plan: 'search_30d' }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('BILLING_UNAVAILABLE');
    expect(fetches).toHaveLength(0);
  });
});

describe('dodo-webhook for passes', () => {
  it('grants a pass from its bound plan order, passing the paid amount to the ledger', async () => {
    state.orderPlan = 'search_30d';
    const response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPassPayment('search_30d'))));
    expect(response.status).toBe(200);
    expect(rpc('jobvance_apply_payment_event')[0].args).toMatchObject({ p_action: 'paid', p_user_id: dodoOwner, p_request_id: dodoRequestId, p_payment_intent: `dodo_${dodoPaymentId}`,
      p_session_id: dodoSessionId, p_refund_amount: 0, p_provider: 'dodo', p_paid_amount: 1995, p_paid_tax: 95 });
  });
  it('revokes a pass on refund.succeeded, in plan-price units', async () => {
    state.orderPlan = 'search_30d';
    const response = await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund({ amount: 1995 }))));
    expect(response.status).toBe(200);
    expect(fetches.map(call => call.url)).toEqual([`https://test.dodopayments.com/payments/${dodoPaymentId}`]);
    expect(rpc('jobvance_apply_payment_event')[0].args).toMatchObject({ p_action: 'refund', p_refund_amount: 1900, p_refund_id: `dodo_${dodoRefundId}`, p_paid_amount: 1995 });
    state.rpcCalls.length = 0;
    await webhook()(signed(dodoEnvelope('refund.succeeded', dodoRefund({ amount: 500, is_partial: true }))));
    expect(rpc('jobvance_apply_payment_event')[0].args.p_refund_amount).toBe(476);
  });
  it('lets the bound order, not the metadata, decide the plan', async () => {
    state.orderPlan = 'sprint_7d';
    let response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPassPayment('move_90d'))));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('UNBOUND_PAYMENT');
    response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPayment())));
    expect(response.status).toBe(409);
    state.orderPlan = null;
    response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPassPayment('search_30d'))));
    expect(response.status).toBe(409);
    state.boundOrder = false; state.orderPlan = 'search_30d';
    response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPassPayment('search_30d'))));
    expect(response.status).toBe(409);
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
  it('rejects a mismatched amount, product or forged plan before any database work', async () => {
    state.orderPlan = 'move_90d';
    for (const raw of [dodoEnvelope('payment.succeeded', dodoPassPayment('move_90d', { total_amount: 900, tax: 0 })),
      dodoEnvelope('payment.succeeded', dodoPassPayment('move_90d', { product_cart: [{ product_id: dodoPlanProducts.sprint_7d, quantity: 1 }] })),
      dodoEnvelope('payment.succeeded', dodoPassPayment('move_90d', { metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: JOB_PASS_PRODUCT, plan: 'lifetime' } }))]) {
      expect((await webhook()(signed(raw))).status).toBe(400);
    }
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
  it('does not grant a pass whose product is no longer configured', async () => {
    env.DODO_PRODUCT_MOVE = undefined;
    state.orderPlan = 'move_90d';
    const response = await webhook()(signed(dodoEnvelope('payment.succeeded', dodoPassPayment('move_90d'))));
    expect(response.status).toBe(503);
    expect(rpc('jobvance_apply_payment_event')).toHaveLength(0);
  });
});

describe('get-entitlement', () => {
  const summary = { freeMonthlyLimit: 3, freeUsedThisMonth: 1, freeRemainingThisMonth: 2, passes: [{ plan: 'search_30d', name: 'Job Search', expiresAt: '2026-11-16T10:00:00+00:00', quota: 100, used: 18, remaining: 82 }],
    paidRemaining: 82, dailyLimit: 40, usedToday: 1 };
  it('adds the AI-tailoring summary and keeps every existing field', async () => {
    state.rpc.jobvance_get_entitlement = () => ({ data: { creditsRemaining: 1, expiresAt: null }, error: null });
    state.rpc.jobvance_get_tailor_access = () => ({ data: summary, error: null });
    const response = await entitlement()(request({}));
    expect(await response.json()).toEqual({ creditsRemaining: 1, expiresAt: null, tailorAccess: summary, billingConfigured: true, billingMode: 'test', paymentProvider: 'dodo' });
    expect(rpc('jobvance_get_tailor_access')[0].args).toEqual({ p_user_id: dodoOwner, p_billing_mode: 'test', p_free_monthly: 3, p_pass_daily: 40 });
  });
  it('still answers when the summary cannot be read', async () => {
    state.rpc.jobvance_get_entitlement = () => ({ data: { creditsRemaining: 0, expiresAt: null }, error: null });
    state.rpc.jobvance_get_tailor_access = () => ({ data: null, error: { message: 'function does not exist' } });
    env.JOBVANCE_BILLING_ENABLED = 'false';
    const response = await entitlement()(request({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ creditsRemaining: 0, expiresAt: null, tailorAccess: null, billingConfigured: false, billingMode: null, paymentProvider: null });
  });
});

describe('tailor-for-job allowance', () => {
  const origin = 'https://staging.fixture.invalid';
  const body = () => ({ requestId: '44444444-4444-4444-8444-444444444444', cvText: 'Alex Example\nAnalyst at Example Co, preparing monthly stakeholder reports in Excel and Power BI for five units.',
    jobDescription: 'Transformation Analyst - Example Bank. Prepare monthly stakeholder reporting and support transformation programmes using Excel and Power BI.',
    jobTitle: 'Transformation Analyst', company: 'Example Bank', consent: true });
  const reserveFails = (code: string) => { state.rpc.jobvance_tailor_reserve = () => ({ data: null, error: { message: code } }); };
  it('reserves with the signed-in allowance, the configured billing mode and the fair-use cap', async () => {
    reserveFails('TAILOR_FREE_LIMIT');
    const response = await tailor()(request(body(), 'Bearer fixture-owner-token', origin));
    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload.code).toBe('TAILOR_FREE_LIMIT');
    expect(payload.error).toMatch(/3 free AI-tailored CVs this month/);
    expect(payload.error).toMatch(/Passes start at \$9 on the Pricing page/);
    expect(rpc('jobvance_tailor_reserve')[0].args).toMatchObject({ p_user: dodoOwner, p_rate_hash: null, p_provider: 'openrouter', p_billing_mode: 'test',
      p_free_monthly: 3, p_pass_daily: 40, p_guest_daily: 1, p_guest_global_daily: 200 });
    expect(rpc('jobvance_tailor_reserve')[0].args).not.toHaveProperty('p_user_daily');
  });
  it.each([null, 'Bearer invalid-token', 'Bearer fixture-anon-key'])('requires an account before reservation or provider work (%s)', async authorization => {
    reserveFails('TAILOR_GUEST_LIMIT');
    const response = await tailor()(request(body(), authorization, origin));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'TAILOR_AUTH_REQUIRED' });
    expect(rpc('jobvance_tailor_reserve')).toHaveLength(0);
    expect(fetches).toHaveLength(0);
  });
  it.each([
    ['TAILOR_PASS_DAILY_LIMIT', 429, /fair-use limit of 40/],
    ['TAILOR_GUEST_CAPACITY', 429, /busy today/],
    ['TAILOR_BUDGET_LIMIT', 429, /paused until next month/],
    ['TAILOR_REQUEST_CONFLICT', 409, /already used/],
    ['TAILOR_INVALID', 400, /could not be read/],
  ])('maps %s to a plain message', async (code, status, message) => {
    reserveFails(code);
    const response = await tailor()(request(body(), 'Bearer fixture-owner-token', origin));
    expect(response.status).toBe(status);
    const payload = await response.json();
    expect(payload.code).toBe(code);
    expect(payload.error).toMatch(message);
    expect(payload.error).not.toMatch(/beta/i);
  });
  it('uses live-mode passes only when billing is configured for live mode', async () => {
    reserveFails('TAILOR_FREE_LIMIT');
    env.JOBVANCE_BILLING_MODE = 'live';
    await tailor()(request(body(), 'Bearer fixture-owner-token', origin));
    expect(rpc('jobvance_tailor_reserve')[0].args.p_billing_mode).toBe('live');
  });
});
