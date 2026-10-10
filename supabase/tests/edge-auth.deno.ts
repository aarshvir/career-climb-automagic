// Hermetic handler tests: all fetches are intercepted; no real account, CV, payment,
// database, socket or external API is used. Run with `deno test --allow-env`.
type Handler = (request: Request) => Promise<Response>;
const handlers: Handler[] = [];
const originalServe = Deno.serve;
Deno.serve = ((handler: Handler) => { handlers.push(handler); return undefined; }) as unknown as typeof Deno.serve;
if (Deno.env.get('JOBVANCE_TEST_UI_BUNDLES') === 'true') {
  await import('../../docs/supabase-ui/tailor-cv.js');
  await import('../../docs/supabase-ui/get-entitlement.js');
  await import('../../docs/supabase-ui/create-checkout.js');
  await import('../../docs/supabase-ui/stripe-webhook.js');
  await import('../../docs/supabase-ui/paddle-webhook.js');
} else {
  await import('../functions/tailor-cv/index.ts');
  await import('../functions/get-entitlement/index.ts');
  await import('../functions/create-checkout/index.ts');
  await import('../functions/stripe-webhook/index.ts');
  await import('../functions/paddle-webhook/index.ts');
}
Deno.serve = originalServe;

const owner = '11111111-1111-1111-1111-111111111111';
const resume = '22222222-2222-2222-2222-222222222222';
const requestId = '33333333-3333-3333-3333-333333333333';
const original = 'A truthful original CV with Python SQL delivery and documented analytics projects. '.repeat(3);
const jobDescription = 'A data engineering role needing Python SQL pipelines, analytics, clear documentation and delivery experience.';
const body = { resumeId: resume, requestId, jobTitle: 'Engineer', company: 'Example', jobDescription, jobUrl: null };
const calls: { url: string; body: Record<string, unknown> | string | null }[] = [];
let hasDocument = true;
let existingPack: Record<string, unknown> | null = null;
const paddlePriceId = `pri_${'a'.repeat(26)}`;
const paddleTransactionId = `txn_${'b'.repeat(26)}`;
const paddleEventId = `evt_${'c'.repeat(26)}`;
let paddlePriceChange: Record<string, unknown> = {};
let hasBoundPaddleOrder = true;
function paddlePrice() { return { id: paddlePriceId, status: 'active', billing_cycle: null, trial_period: null, tax_mode: 'external', unit_price: { amount: '2900', currency_code: 'USD' }, unit_price_overrides: [], ...paddlePriceChange }; }
function paddleTransaction(status = 'completed') { return { id: paddleTransactionId, status, currency_code: 'USD', collection_mode: 'automatic', subscription_id: null,
  custom_data: { user_id: owner, request_id: requestId, product: 'jobvance_ten_pack_v1' }, items: [{ price: paddlePrice(), quantity: 1 }],
  details: { totals: { subtotal: '2900', discount: '0', currency_code: 'USD' }, line_items: [{ price_id: paddlePriceId, quantity: 1, totals: { subtotal: '2900', discount: '0' } }] } }; }

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function setup() {
  Deno.env.set('SUPABASE_URL', 'https://supabase.fixture.invalid');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-not-a-real-key');
  Deno.env.set('APP_URL', 'https://staging.fixture.invalid');
  Deno.env.set('ALLOWED_ORIGINS', 'https://staging.fixture.invalid');
  Deno.env.set('JOBVANCE_BILLING_ENABLED', 'false');
  Deno.env.set('JOBVANCE_PAYMENT_PROVIDER', 'stripe');
  Deno.env.set('JOBVANCE_BILLING_MODE', 'test');
  calls.length = 0; hasDocument = true; existingPack = null; paddlePriceChange = {}; hasBoundPaddleOrder = true;
}
function enablePaddle() {
  Deno.env.set('JOBVANCE_BILLING_ENABLED', 'true'); Deno.env.set('JOBVANCE_PAYMENT_PROVIDER', 'paddle');
  Deno.env.set('PADDLE_API_KEY', 'pdl_sdbx_apikey_fixture'); Deno.env.set('PADDLE_PRICE_ID', paddlePriceId); Deno.env.set('PADDLE_WEBHOOK_SECRET', 'paddle-fixture-signing-secret');
}
function enableBilling() {
  Deno.env.set('JOBVANCE_BILLING_ENABLED', 'true');
  Deno.env.set('JOBVANCE_BILLING_MODE', 'test');
  Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_fixture_not_a_credential');
  Deno.env.set('STRIPE_WEBHOOK_SECRET', 'whsec_fixture_not_a_credential');
}
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const raw = typeof init?.body === 'string' ? init.body : null;
  calls.push({ url: url.href, body: raw && init?.headers && new Headers(init.headers).get('Content-Type')?.includes('json') ? JSON.parse(raw) : raw });
  if (url.hostname === 'supabase.fixture.invalid') {
    if (url.pathname === '/auth/v1/user') {
      if (new Headers(init?.headers).get('Authorization') !== 'Bearer fixture-owner-token') return Response.json({ message: 'Invalid token' }, { status: 401 });
      return Response.json({ id: owner, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    if (url.pathname === '/rest/v1/application_packs') return Response.json(existingPack ? [existingPack] : []);
    if (url.pathname === '/rest/v1/billing_orders') {
      assert(url.searchParams.get('provider') === 'eq.paddle' && url.searchParams.get('billing_mode') === 'eq.test' && url.searchParams.get('payment_intent') === `eq.paddle_${paddleTransactionId}`, 'Payment order must be bound to provider, environment and transaction.');
      return Response.json(hasBoundPaddleOrder ? [{ id: resume }] : []);
    }
    if (url.pathname === '/rest/v1/cv_documents') {
      assert(url.searchParams.get('user_id') === `eq.${owner}`, 'CV query must constrain the authenticated owner.');
      return Response.json(hasDocument ? [{ id: resume, text_content: original }] : []);
    }
    if (url.pathname === '/rest/v1/rpc/jobvance_get_entitlement') return Response.json({ creditsRemaining: 1, expiresAt: null });
    if (url.pathname === '/rest/v1/rpc/jobvance_create_pack') return Response.json({ id: resume, user_id: owner, original_text: original });
    if (url.pathname === '/rest/v1/rpc/jobvance_begin_checkout') return Response.json({ status: 'created', creationClaimAcquired: true });
    if (url.pathname === '/rest/v1/rpc/jobvance_finish_checkout') return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/rpc/jobvance_apply_payment_event') return Response.json({ duplicate: false });
  }
  if (url.href === 'https://api.stripe.com/v1/checkout/sessions') return Response.json({ id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/fixture', expires_at: Math.floor(Date.now() / 1000) + 1800, livemode: false });
  if (url.hostname === 'sandbox-api.paddle.com') {
    if (url.pathname === `/prices/${paddlePriceId}`) return Response.json({ data: paddlePrice() });
    if (url.pathname === '/transactions') return Response.json({ data: paddleTransaction('draft') });
    if (url.pathname === `/transactions/${paddleTransactionId}`) return Response.json({ data: paddleTransaction() });
  }
  throw new Error('Unexpected network request blocked by hermetic test.');
};

function req(value: unknown = {}, authorization: string | null = 'Bearer fixture-owner-token') {
  return new Request('https://edge.fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(value) });
}
async function signedEvent(value: unknown) {
  const raw = JSON.stringify(value); const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_fixture_not_a_credential'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const signature = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://edge.fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw });
}

Deno.test('user functions reject missing and invalid tokens before persistence', async () => {
  for (const handler of handlers.slice(0, 3)) {
    setup(); assert((await handler(req(body, null))).status === 401, 'Missing token must fail.');
    assert(calls.length === 0, 'Missing auth must not reach storage or billing.');
    assert((await handler(req(body, 'Bearer invalid-token'))).status === 401, 'Invalid user token must fail.');
    assert(calls.every(call => call.url.includes('/auth/v1/user')), 'Invalid auth must not reach persistence.');
  }
});

async function signedPaddleEvent(value: unknown) {
  const raw = JSON.stringify(value); const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('paddle-fixture-signing-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}:${raw}`));
  const signature = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://edge.fixture.invalid', { method: 'POST', headers: { 'Paddle-Signature': `ts=${timestamp};h1=${signature}`, 'Content-Type': 'application/json' }, body: raw });
}
Deno.test('Paddle checkout fixes price, quantity and owned custom data on the server', async () => {
  setup(); enablePaddle();
  const response = await handlers[2](req({ requestId, priceId: 'forged-price', quantity: 100, userId: resume }));
  assert(response.status === 200, 'Paddle test checkout should succeed.');
  const result = await response.json(); assert(result.provider === 'paddle' && result.transactionId === paddleTransactionId, 'Return overlay transaction ID, not an invented hosted URL.');
  const created = calls.find(call => call.url === 'https://sandbox-api.paddle.com/transactions');
  assert(created && typeof created.body === 'object' && created.body, 'Transaction creation expected.');
  const items = created.body.items as { price_id: string; quantity: number }[];
  const metadata = created.body.custom_data as Record<string, unknown>;
  assert(items.length === 1 && items[0].price_id === paddlePriceId && items[0].quantity === 1 && metadata.user_id === owner, 'Server price and identity must override client fields.');
});
Deno.test('Paddle checkout rejects recurring prices before reserving or creating an order', async () => {
  setup(); enablePaddle(); paddlePriceChange = { billing_cycle: { interval: 'month', frequency: 1 } };
  assert((await handlers[2](req({ requestId }))).status === 503, 'Recurring price must be rejected.');
  assert(!calls.some(call => call.url.includes('/rpc/jobvance_begin_checkout') || call.url.endsWith('/transactions')), 'No checkout may be created for a bad price.');
});
Deno.test('Paddle webhook rejects unsigned and unbound paid checkouts', async () => {
  setup(); enablePaddle();
  assert((await handlers[4](req({}, null))).status === 400, 'Unsigned Paddle event must fail.');
  const event = { event_id: paddleEventId, event_type: 'transaction.completed', occurred_at: new Date().toISOString(), data: paddleTransaction() };
  hasBoundPaddleOrder = false;
  assert((await handlers[4](await signedPaddleEvent(event))).status === 409, 'Client-created unbound transaction must fail.');
  assert(!calls.some(call => call.url.includes('/rpc/jobvance_apply_payment_event')), 'No unbound payment grant may be written.');
});
Deno.test('Paddle paid event reaches only the provider-bound ledger', async () => {
  setup(); enablePaddle();
  const event = { event_id: paddleEventId, event_type: 'transaction.completed', occurred_at: new Date().toISOString(), data: paddleTransaction() };
  assert((await handlers[4](await signedPaddleEvent(event))).status === 200, 'Verified Paddle payment should succeed.');
  const saved = calls.find(call => call.url.includes('/rpc/jobvance_apply_payment_event'));
  assert(saved && typeof saved.body === 'object' && saved.body?.p_provider === 'paddle' && saved.body.p_payment_intent === `paddle_${paddleTransactionId}`, 'Paddle payment IDs must be namespaced and bound.');
});
Deno.test('Paddle refund grants no credit on pending approval and verifies transaction context on approval', async () => {
  setup(); enablePaddle();
  const data = { id: `adj_${'d'.repeat(26)}`, transaction_id: paddleTransactionId, action: 'refund', status: 'pending_approval', currency_code: 'USD', totals: { subtotal: '500', currency_code: 'USD' } };
  const event = { event_id: paddleEventId, event_type: 'adjustment.updated', occurred_at: new Date().toISOString(), data };
  assert((await handlers[4](await signedPaddleEvent(event))).status === 200, 'Pending request should be acknowledged without capacity change.');
  assert(calls.length === 0, 'Pending adjustment must not reach the ledger.');
  assert((await handlers[4](await signedPaddleEvent({ ...event, data: { ...data, status: 'approved' } }))).status === 200, 'Approved verified refund should succeed.');
  assert(calls.some(call => call.url === `https://sandbox-api.paddle.com/transactions/${paddleTransactionId}`), 'Refund must fetch the associated transaction from the selected API environment.');
  const saved = calls.find(call => call.url.includes('/rpc/jobvance_apply_payment_event'));
  assert(saved && typeof saved.body === 'object' && saved.body?.p_action === 'refund' && saved.body.p_refund_id === `paddle_adj_${'d'.repeat(26)}`, 'Refund must write a durable adjustment-specific tombstone.');
});
Deno.test('tailoring binds database operations to the authenticated user', async () => {
  setup(); assert((await handlers[0](req(body))).status === 200, 'Owned tailoring should succeed.');
  const rpc = calls.find(call => call.url.includes('/rpc/jobvance_create_pack'));
  assert(rpc && typeof rpc.body === 'object' && rpc.body?.p_user_id === owner, 'Credit RPC must use getUser identity.');
});
Deno.test('tailoring rejects another or unavailable CV without consuming capacity', async () => {
  setup(); hasDocument = false;
  assert((await handlers[0](req(body))).status === 404, 'Unknown owned CV must fail.');
  assert(!calls.some(call => call.url.includes('/rpc/jobvance_create_pack')), 'No capacity may be consumed.');
});
Deno.test('request conflict is rejected before a second credit can be consumed', async () => {
  setup(); existingPack = { original_text: original, request_fingerprint: 'b'.repeat(64) };
  assert((await handlers[0](req(body))).status === 409, 'Conflicting retry must fail.');
  assert(!calls.some(call => call.url.includes('/rpc/jobvance_create_pack')), 'Conflict must not consume capacity.');
});
Deno.test('unconfigured billing returns an explicit failure', async () => {
  setup(); assert((await handlers[2](req({ requestId }))).status === 503, 'Disabled billing must be unavailable.');
  assert(!calls.some(call => call.url.includes('stripe.com')), 'Disabled checkout must not call Stripe.');
});
Deno.test('checkout ignores client price/user fields and fixes the pass on the server', async () => {
  setup(); enableBilling();
  assert((await handlers[2](req({ requestId, userId: resume, amount: 1, credits: 10000 }))).status === 200, 'Configured test checkout should succeed.');
  const call = calls.find(item => item.url.includes('api.stripe.com'));
  assert(call && typeof call.body === 'string', 'Stripe request expected.');
  const form = new URLSearchParams(call.body);
  assert(form.get('line_items[0][price_data][unit_amount]') === '2900', 'Client amount must be ignored.');
  assert(form.get('metadata[user_id]') === owner, 'Client identity must be ignored.');
  assert(form.get('metadata[product]') === 'jobvance_ten_pack_v1', 'Server product must be fixed.');
  assert(form.get('success_url') === 'https://staging.fixture.invalid/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}', 'Successful checkout must return to the registered dashboard route.');
  assert(form.get('cancel_url') === 'https://staging.fixture.invalid/dashboard?checkout=cancelled', 'Cancelled checkout must return to the registered dashboard route.');
});
Deno.test('webhook rejects unsigned bodies without a grant write', async () => {
  setup(); enableBilling(); assert((await handlers[3](req({ type: 'checkout.session.completed' }, null))).status === 400, 'Unsigned event must fail.');
  assert(calls.length === 0, 'Unsigned event must not reach the ledger.');
});
Deno.test('only signed paid events with the configured mode reach the ledger', async () => {
  setup(); enableBilling();
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: 'cs_test_fixture', payment_intent: 'pi_fixture', mode: 'payment', payment_status: 'paid', amount_total: 2900, currency: 'usd', metadata: { product: 'jobvance_ten_pack_v1', user_id: owner, request_id: requestId } } } };
  assert((await handlers[3](await signedEvent(event))).status === 200, 'Verified event should succeed.');
  assert(calls.some(call => call.url.includes('/rpc/jobvance_apply_payment_event')), 'Verified event must reach ledger.');
  calls.length = 0;
  assert((await handlers[3](await signedEvent({ ...event, livemode: true }))).status === 400, 'Mode mismatch must fail.');
  assert(calls.length === 0, 'Mode mismatch must not reach the ledger.');
});
