import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { cleanBatch, describeDevice, isBot } from '../_shared/jobvance-track.ts';

// First-party analytics intake: page views, visible seconds, clicks and form submits from
// jobvance.io (see src/lib/analytics.ts). A valid sign-in token links the visitor to the account.
const env = (name: string) => Deno.env.get(name);
const tokens = new Map<string, { id: string | null; until: number }>();

function cors(req: Request): HeadersInit {
  const origin = req.headers.get('Origin');
  const allowed = [...(env('ALLOWED_ORIGINS') ?? env('APP_URL') ?? '').split(','), 'https://jobvance.io'].map(value => {
    try { return new URL(value.trim()).origin; } catch { return ''; }
  }).filter(Boolean);
  return { ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
const done = (req: Request, status = 204) => new Response(null, { status, headers: { ...cors(req), 'Cache-Control': 'no-store' } });

async function accountFor(db: ReturnType<typeof createClient>, token: string | null): Promise<string | null> {
  if (!token) return null;
  const cached = tokens.get(token);
  if (cached && cached.until > Date.now()) return cached.id;
  const { data, error } = await db.auth.getUser(token);
  const id = error || !data.user ? null : data.user.id;
  if (tokens.size > 5000) tokens.clear();
  tokens.set(token, { id, until: Date.now() + 5 * 60_000 });
  return id;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return done(req);
  if (req.method !== 'POST') return done(req, 405);
  const userAgent = req.headers.get('User-Agent') ?? '';
  if (isBot(userAgent)) return done(req);
  const text = (await req.text()).slice(0, 70_000);
  let batch;
  try { batch = cleanBatch(JSON.parse(text)); } catch { batch = null; }
  if (!batch) return done(req, 400);
  if (!batch.events.length) return done(req);
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return done(req, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await accountFor(db, batch.token);
  const device = describeDevice(userAgent, req.headers.get('cf-ipcountry') ?? req.headers.get('x-country'));
  const { error } = await db.rpc('jobvance_track', { p_visitor: batch.visitorId, p_session: batch.sessionId, p_user: user, p_context: batch.context, p_device: device, p_events: batch.events });
  return done(req, error ? 503 : 204);
}

Deno.serve(req => handle(req).catch(() => done(req, 500)));
