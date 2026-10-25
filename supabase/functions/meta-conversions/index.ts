import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { buildRegistrationEvent, firstForwardedIp, META_PIXEL_ID } from '../_shared/meta-conversions.ts';

// Sends Meta the server copy of a new account's sign-up. Inert until the owner adds the
// META_CAPI_ACCESS_TOKEN secret; the token travels only in the request body, never a URL or log.
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
  const event = await buildRegistrationEvent({
    userId: data.user.id, email: data.user.email, createdAt: data.user.created_at, pageUrl: body.pageUrl, fbp: body.fbp, fbc: body.fbc,
    ip: firstForwardedIp(req.headers.get('x-forwarded-for')), userAgent: req.headers.get('User-Agent'), now: Date.now(),
  });
  if (!event) return reply(req, { sent: false, reason: 'not_new' });
  const version = /^v\d{2}\.0$/.test(env('META_GRAPH_VERSION') ?? '') ? env('META_GRAPH_VERSION') : 'v23.0';
  const testCode = env('META_CAPI_TEST_EVENT_CODE');
  const response = await fetch(`https://graph.facebook.com/${version}/${META_PIXEL_ID}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event], access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
    signal: AbortSignal.timeout(10000),
  });
  const result: { error?: { code?: number; error_subcode?: number } } | null = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('meta_capi_rejected', { status: response.status, code: result?.error?.code ?? null, subcode: result?.error?.error_subcode ?? null });
    return reply(req, { error: 'Meta did not accept the event.', code: 'META_REJECTED' }, 503);
  }
  return reply(req, { sent: true });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, { error: 'Use POST.', code: 'METHOD_NOT_ALLOWED' }, 405);
  // Network errors can describe the request; never surface them or the token.
  try { return await handle(req); }
  catch { console.error('meta_conversions_failed'); return reply(req, { error: 'The service could not complete this request. Try again.', code: 'SERVICE_ERROR' }, 503); }
});
