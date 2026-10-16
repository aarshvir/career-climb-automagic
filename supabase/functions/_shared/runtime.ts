import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { ApiError, billingConfiguration, type DodoBillingConfig, type PaddleBillingConfig, type StripeBillingConfig } from './core.ts';

const env = (name: string) => Deno.env.get(name);
export const getBilling = () => billingConfiguration(env);
export const configuredBillingMode = () => env('JOBVANCE_BILLING_MODE') === 'live' ? 'live' : 'test';

function required(name: string): string {
  const value = env(name);
  if (!value) throw new ApiError(503, 'NOT_CONFIGURED', 'The service is not configured yet.');
  return value;
}

export function adminClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticatedClient(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Sign in again.');
  return { admin, user: data.user };
}

export function cors(req: Request): HeadersInit {
  const origin = req.headers.get('Origin');
  const allowed = (env('ALLOWED_ORIGINS') ?? env('APP_URL') ?? '').split(',').map(value => {
    try { return new URL(value.trim()).origin; } catch { return ''; }
  }).filter(Boolean);
  return { ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

export function json(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function readJson(req: Request): Promise<unknown> {
  if (!req.headers.get('Content-Type')?.toLowerCase().includes('application/json')) throw new ApiError(415, 'INVALID_INPUT', 'Use application/json.');
  const raw = await boundedBody(req, 180000);
  try { return JSON.parse(raw); } catch { throw new ApiError(400, 'INVALID_INPUT', 'Invalid JSON.'); }
}

export async function boundedBody(req: Request, max: number): Promise<string> {
  const declared = Number(req.headers.get('Content-Length') ?? 0);
  if (declared > max) throw new ApiError(413, 'INPUT_TOO_LARGE', 'Request is too large.');
  if (!req.body) throw new ApiError(400, 'INVALID_INPUT', 'Request body is missing.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > max) { await reader.cancel(); throw new ApiError(413, 'INPUT_TOO_LARGE', 'Request is too large.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function databaseError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const known: [string, number, string][] = [
    ['NO_CREDITS', 402, 'You have used your available packs.'],
    ['REQUEST_CONFLICT', 409, 'This request ID was already used for different inputs. Start a new request.'],
    ['CV_NOT_FOUND', 404, 'That CV is unavailable. Upload or select your own CV.'],
    ['CV_CHANGED', 409, 'The CV changed while the pack was being created. Try again.'],
    ['INVALID_PACK', 400, 'The pack request is invalid.'],
    ['CHECKOUT_LIMIT', 429, 'Too many new checkout requests. Try again tomorrow or reuse your existing checkout.'],
    ['INVALID_PLAN', 400, 'That pass is not available.'],
  ];
  for (const [code, status, message] of known) if (error.message.includes(code)) throw new ApiError(status, code, message);
  // Do not return SQL internals, processor payloads or personal information.
  throw new ApiError(503, 'PERSISTENCE_FAILED', 'The request could not be saved. Try again.');
}

export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return json(req, { error: 'Use POST.', code: 'METHOD_NOT_ALLOWED' }, 405);
    try { return await handler(req); }
    catch (error) {
      if (error instanceof ApiError) return json(req, { error: error.message, code: error.code }, error.status);
      console.error('jobvance_function_failed', { type: error instanceof Error ? error.name : 'UnknownError' });
      return json(req, { error: 'The service could not complete this request. Try again.', code: 'SERVICE_ERROR' }, 503);
    }
  });
}

export async function stripeRequest(config: StripeBillingConfig, endpoint: string, form?: URLSearchParams, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, { method: form ? 'POST' : 'GET', headers: {
    Authorization: `Bearer ${config.secretKey}`, 'Stripe-Version': '2024-06-20', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  }, body: form?.toString(), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ApiError(503, 'PAYMENT_PROVIDER_ERROR', 'Payment processing is temporarily unavailable. Retry with the same request.');
  return await response.json();
}

export async function paddleRequest(config: PaddleBillingConfig, endpoint: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const origin = config.mode === 'test' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const response = await fetch(`${origin}/${endpoint}`, { method: body ? 'POST' : 'GET', headers: {
    Authorization: `Bearer ${config.secretKey}`, 'Paddle-Version': '1', 'Content-Type': 'application/json',
  }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ApiError(503, 'PAYMENT_PROVIDER_ERROR', 'Checkout is temporarily unavailable. Retry with the same request or contact support if it needs recovery.');
  const result = await response.json();
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new ApiError(503, 'INVALID_PAYMENT_RESPONSE', 'The payment response could not be verified.');
  return result.data;
}

export async function dodoRequest(config: DodoBillingConfig, endpoint: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const unavailable = () => new ApiError(503, 'PAYMENT_PROVIDER_ERROR', 'Checkout is temporarily unavailable. Retry with the same request or contact support if it needs recovery.');
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/${endpoint}`, { method: body ? 'POST' : 'GET', headers: {
      Authorization: `Bearer ${config.secretKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch {
    // Network and timeout errors may describe the request; never surface them or the bearer key.
    throw unavailable();
  }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw unavailable(); }
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError(503, 'INVALID_PAYMENT_RESPONSE', 'The payment response could not be verified.');
  return result as Record<string, unknown>;
}
