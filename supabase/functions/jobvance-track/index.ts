import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { cleanBatch, describeDevice, isBot, TRACK_MAX_BYTES, trackAcknowledgement } from '../_shared/jobvance-track.ts';

const env = (name: string) => Deno.env.get(name);
class IntakeFailure extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  const allowed = [...(env('ALLOWED_ORIGINS') ?? '').split(','), env('APP_URL') ?? '', 'https://jobvance.io'].flatMap(value => {
    try { const url = new URL(value.trim()); return url.protocol === 'https:' && !url.username && !url.password ? [url.origin] : []; } catch { return []; }
  });
  return origin && allowed.includes(origin) ? origin : null;
}

function cors(req: Request): HeadersInit {
  const origin = allowedOrigin(req);
  return { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), Vary: 'Origin', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function reply(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'POST, OPTIONS' } : {}) } });
}

/** Bound bytes while streaming; a forged/missing Content-Length cannot allocate an unbounded body. */
async function readBody(req: Request): Promise<string> {
  const declared = req.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new IntakeFailure(400, 'TRACK_BODY_INVALID');
  if (declared !== null && Number(declared) > TRACK_MAX_BYTES) throw new IntakeFailure(413, 'TRACK_BODY_TOO_LARGE');
  if (!req.body) throw new IntakeFailure(400, 'TRACK_BODY_INVALID');
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      length += result.value.byteLength;
      if (length > TRACK_MAX_BYTES) { await reader.cancel().catch(() => {}); throw new IntakeFailure(413, 'TRACK_BODY_TOO_LARGE'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new IntakeFailure(400, 'TRACK_BODY_INVALID'); }
}

async function handle(req: Request): Promise<Response> {
  if (!allowedOrigin(req)) return reply(req, { code: 'TRACK_ORIGIN_DENIED' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, { code: 'TRACK_METHOD_NOT_ALLOWED' }, 405);
  const contentType = (req.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'text/plain' && contentType !== 'application/json') return reply(req, { code: 'TRACK_CONTENT_TYPE_INVALID' }, 415);
  const text = await readBody(req); let body: unknown;
  try { body = JSON.parse(text); } catch { return reply(req, { code: 'TRACK_BODY_INVALID' }, 400); }
  const batch = cleanBatch(body); if (!batch) return reply(req, { code: 'TRACK_BATCH_INVALID' }, 400);
  const userAgent = req.headers.get('User-Agent') ?? '';
  if (isBot(userAgent)) return reply(req, { ignored: true, reason: 'bot' }, 202);
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(req, { code: 'TRACK_NOT_CONFIGURED' }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let user: string | null = null;
  if (batch.token !== null) {
    // No stale positive/negative token cache: every supplied token is verified for this request.
    const { data, error } = await db.auth.getUser(batch.token);
    if (error) {
      const status = typeof error.status === 'number' ? error.status : 0;
      return reply(req, { code: status >= 400 && status < 500 && status !== 429 ? 'TRACK_UNAUTHORIZED' : 'TRACK_AUTH_UNAVAILABLE' }, status >= 400 && status < 500 && status !== 429 ? 401 : 503);
    }
    if (!data.user || typeof data.user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.user.id)) return reply(req, { code: 'TRACK_UNAUTHORIZED' }, 401);
    user = data.user.id;
  }
  const device = describeDevice(userAgent, req.headers.get('cf-ipcountry'));
  const { data, error } = await db.rpc('jobvance_track', { p_visitor: batch.visitorId, p_session: batch.sessionId, p_batch: batch.batchId, p_user: user, p_context: batch.context, p_device: device, p_events: batch.events });
  if (error) {
    // Known immutable-identity conflicts are terminal. Do not surface raw database details.
    const conflict = typeof error.message === 'string' && /^(TRACK_(BATCH|EVENT|SESSION|VISITOR|OWNER|USER|INPUT|SCOPE)[A-Z_]*(CONFLICT|INVALID)|TRACK_IDENTITY_CONFLICT)$/.test(error.message);
    return reply(req, { code: conflict ? 'TRACK_CONFLICT' : 'TRACK_STORAGE_UNAVAILABLE' }, conflict ? 409 : 503);
  }
  const receipt = trackAcknowledgement(data, batch);
  return receipt ? reply(req, receipt) : reply(req, { code: 'TRACK_ACK_INVALID' }, 503);
}

Deno.serve(async req => {
  try { return await handle(req); }
  catch (reason) { return reply(req, { code: reason instanceof IntakeFailure ? reason.code : 'TRACK_SERVICE_UNAVAILABLE' }, reason instanceof IntakeFailure ? reason.status : 503); }
});
