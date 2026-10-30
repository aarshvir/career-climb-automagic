import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { buildCheckoutEvent, buildPurchaseEvent, buildRegistrationEvent, firstForwardedIp, META_PIXEL_ID, type PurchaseRow } from '../_shared/meta-conversions.ts';

// Sends Meta the server copy of a new account's sign-up, and the checkouts and first payments the
// database proves. Inert until the owner adds the META_CAPI_ACCESS_TOKEN secret; the token travels only
// in the request body, never a URL or log.
// Self-contained (no billing modules); CORS, responses and auth follow _shared/runtime.ts.
const env = (name: string) => Deno.env.get(name);

function cors(req: Request): HeadersInit {
  const origin = req.headers.get('Origin');
  const allowed = (env('ALLOWED_ORIGINS') ?? env('APP_URL') ?? '').split(',').map(value => {
    try { return new URL(value.trim()).origin; } catch { return ''; }
  }).filter(Boolean);
  return { ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

const reply = (req: Request, value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function handle(req: Request): Promise<Response> {
  const token = env('META_CAPI_ACCESS_TOKEN');
  if (!token) return reply(req, { sent: false, reason: 'not_configured' });
  if (req.headers.get('Sec-GPC') === '1') return reply(req, { sent: false, reason: 'privacy_signal' });
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!bearer || !url || !key) return reply(req, { error: 'Sign in to continue.', code: 'UNAUTHORIZED' }, 401);
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(bearer);
  if (error || !data.user) return reply(req, { error: 'Your session has expired. Sign in again.', code: 'UNAUTHORIZED' }, 401);
  if (Number(req.headers.get('Content-Length') ?? 0) > 4000) return reply(req, { error: 'Request is too large.', code: 'INPUT_TOO_LARGE' }, 413);
  let body: Record<string, unknown> = {};
  try { const parsed = JSON.parse((await req.text()).slice(0, 4000) || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed; } catch { /* identifiers are optional */ }
  const kind = body.kind ?? 'registration';
  if (kind !== 'registration' && kind !== 'checkout' && kind !== 'purchase') return reply(req, { error: 'Unknown event.', code: 'INVALID_KIND' }, 400);
  const person = {
    userId: data.user.id, email: data.user.email, pageUrl: body.pageUrl, fbp: body.fbp, fbc: body.fbc,
    ip: firstForwardedIp(req.headers.get('x-forwarded-for')), userAgent: req.headers.get('User-Agent'), now: Date.now(),
  };
  const version = /^v\d{2}\.0$/.test(env('META_GRAPH_VERSION') ?? '') ? env('META_GRAPH_VERSION') : 'v23.0';
  const testCode = env('META_CAPI_TEST_EVENT_CODE');
  // True when Meta accepted the batch. The token travels in the body only.
  const post = async (events: Record<string, unknown>[]): Promise<boolean> => {
    const response = await fetch(`https://graph.facebook.com/${version}/${META_PIXEL_ID}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: events, access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return true;
    const result: { error?: { code?: number; error_subcode?: number } } | null = await response.json().catch(() => null);
    console.error('meta_capi_rejected', { status: response.status, code: result?.error?.code ?? null, subcode: result?.error?.error_subcode ?? null });
    return false;
  };
  const rejected = () => reply(req, { error: 'Meta did not accept the event.', code: 'META_REJECTED' }, 503);

  if (kind === 'registration') {
    const event = await buildRegistrationEvent({ ...person, createdAt: data.user.created_at });
    if (!event) return reply(req, { sent: false, reason: 'not_new' });
    return await post([event]) ? reply(req, { sent: true }) : rejected();
  }

  // Checkout and purchase events come from the payment ledgers, never from the browser's say-so. The
  // database claims each one once (a short lease) and records it as sent only after Meta accepts it.
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const includeTest = Boolean(testCode); // Dodo test-mode payments go to Meta's Test Events only
  if (kind === 'checkout') {
    const requestId = typeof body.requestId === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.requestId) ? body.requestId.toLowerCase() : null;
    if (!requestId) return reply(req, { error: 'Checkout reference is missing.', code: 'INVALID_REQUEST' }, 400);
    const claimed = await admin.rpc('jobvance_meta_claim_checkout', { p_user: data.user.id, p_request: requestId, p_include_test: includeTest });
    if (claimed.error) { console.error('meta_commerce_claim_failed', { kind, code: claimed.error.code ?? null }); return reply(req, { error: 'The service could not complete this request. Try again.', code: 'SERVICE_ERROR' }, 503); }
    const rows = (claimed.data ?? []) as { event_key: string; plan_label: string }[];
    if (!rows.length) return reply(req, { sent: false, reason: 'nothing_new' });
    if (!await post(await Promise.all(rows.map(row => buildCheckoutEvent(person, row))))) return rejected();
    await admin.rpc('jobvance_meta_mark_sent', { p_user: data.user.id, p_kind: 'checkout', p_keys: rows.map(row => row.event_key) });
    return reply(req, { sent: true, count: rows.length });
  }

  const claimed = await admin.rpc('jobvance_meta_claim_purchases', { p_user: data.user.id, p_include_test: includeTest });
  if (claimed.error) { console.error('meta_commerce_claim_failed', { kind, code: claimed.error.code ?? null }); return reply(req, { error: 'The service could not complete this request. Try again.', code: 'SERVICE_ERROR' }, 503); }
  const rows = (claimed.data ?? []) as PurchaseRow[];
  if (!rows.length) return reply(req, { sent: false, reason: 'nothing_new' });
  const events = (await Promise.all(rows.map(row => buildPurchaseEvent(person, row)))).filter((event): event is Record<string, unknown> => event !== null);
  if (events.length && !await post(events)) return rejected();
  // A payment with no usable amount is not a purchase Meta can use; it is marked handled, not retried.
  await admin.rpc('jobvance_meta_mark_sent', { p_user: data.user.id, p_kind: 'purchase', p_keys: rows.map(row => row.event_key) });
  return reply(req, { sent: events.length > 0, count: events.length });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, { error: 'Use POST.', code: 'METHOD_NOT_ALLOWED' }, 405);
  // Network errors can describe the request; never surface them or the token.
  try { return await handle(req); }
  catch { console.error('meta_conversions_failed'); return reply(req, { error: 'The service could not complete this request. Try again.', code: 'SERVICE_ERROR' }, 503); }
});
