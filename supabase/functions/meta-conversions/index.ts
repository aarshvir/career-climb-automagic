import { ApiError } from '../_shared/core.ts';
import { authenticatedClient, json, readJson, serve } from '../_shared/runtime.ts';
import { buildRegistrationEvent, firstForwardedIp, META_PIXEL_ID } from '../_shared/meta-conversions.ts';

// Sends Meta the server copy of a new account's sign-up. Inert until the owner adds the
// META_CAPI_ACCESS_TOKEN secret; the token travels only in the request body, never a URL or log.
serve(async req => {
  const token = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  if (!token) return json(req, { sent: false, reason: 'not_configured' });
  if (req.headers.get('Sec-GPC') === '1') return json(req, { sent: false, reason: 'privacy_signal' });
  const { user } = await authenticatedClient(req);
  const raw = await readJson(req);
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const event = await buildRegistrationEvent({
    userId: user.id, email: user.email, createdAt: user.created_at, pageUrl: body.pageUrl, fbp: body.fbp, fbc: body.fbc,
    ip: firstForwardedIp(req.headers.get('x-forwarded-for')), userAgent: req.headers.get('User-Agent'), now: Date.now(),
  });
  if (!event) return json(req, { sent: false, reason: 'not_new' });
  const version = /^v\d{2}\.0$/.test(Deno.env.get('META_GRAPH_VERSION') ?? '') ? Deno.env.get('META_GRAPH_VERSION') : 'v23.0';
  const testCode = Deno.env.get('META_CAPI_TEST_EVENT_CODE');
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${META_PIXEL_ID}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event], access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new ApiError(503, 'META_UNAVAILABLE', 'Meta could not be reached.'); }
  const result: { error?: { code?: number; error_subcode?: number } } | null = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('meta_capi_rejected', { status: response.status, code: result?.error?.code ?? null, subcode: result?.error?.error_subcode ?? null });
    throw new ApiError(503, 'META_REJECTED', 'Meta did not accept the event.');
  }
  return json(req, { sent: true });
});
