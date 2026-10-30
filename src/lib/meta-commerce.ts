// Tells Meta (through our meta-conversions function) that a signed-in owner opened checkout or paid.
// The browser only asks. The function takes the order and payment facts from the database, so nothing
// here can invent a purchase, and no card, billing or CV data is involved. Same opt-outs as the pixel:
// Global Privacy Control, European time zones and the saved device choice.
import { supabase } from '@/integrations/supabase/client';
import { adsMeasurementAllowed, metaCookie } from '@/lib/meta-pixel';

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PENDING_KEY = 'jobvance_meta_checkout_pending_v1';
const CHECKED_KEY = 'jobvance_meta_purchase_check_v1';
const CHECK_INTERVAL = 30 * 60 * 1000;
const PENDING_LIFETIME = 5 * 24 * 60 * 60 * 1000;
const CHECKOUT_WAIT = 1500;

type Reply = { sent?: boolean; reason?: string } | null;
type Pending = { requestId: string; owner: string; at: number };

/** Resolves with the function's reply, or null when it could not be asked (opted out, signed out, failed). */
async function ask(kind: 'checkout' | 'purchase', owner: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  if (!import.meta.env.PROD || !adsMeasurementAllowed()) return null;
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session || session.user.id !== owner || !adsMeasurementAllowed()) return null;
  const body = { kind, ...extra, pageUrl: `${window.location.origin}${window.location.pathname}`, fbp: metaCookie('_fbp'), fbc: metaCookie('_fbc') };
  const result = await supabase.functions.invoke('meta-conversions', { body, headers: { Authorization: `Bearer ${session.access_token}` } });
  return result.error ? null : (result.data as Reply) ?? {};
}

function readPending(): Pending[] {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is Pending => !!item && UUID.test(item.requestId) && typeof item.owner === 'string' && Number.isFinite(item.at)).slice(-5) : [];
  } catch { return []; }
}
function writePending(items: Pending[]): void {
  try { if (items.length) localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-5))); else localStorage.removeItem(PENDING_KEY); } catch { /* the notice may repeat on this device only */ }
}
const settled = (reply: Reply) => !!reply && (reply.sent === true || reply.reason === 'privacy_signal' || reply.reason === 'not_configured');

async function sendCheckout(requestId: string, owner: string): Promise<void> {
  const reply = await ask('checkout', owner, { requestId });
  if (settled(reply)) writePending(readPending().filter(item => item.requestId !== requestId));
}

/**
 * Called as the provider checkout opens. Waits briefly so the request leaves before the page does; a notice
 * cut short is remembered on this device and retried on a later visit.
 */
export async function reportMetaCheckout(requestId: string, owner: string): Promise<void> {
  try {
    if (!UUID.test(requestId) || !import.meta.env.PROD || !adsMeasurementAllowed()) return;
    writePending([...readPending().filter(item => item.requestId !== requestId), { requestId, owner, at: Date.now() }]);
    await Promise.race([sendCheckout(requestId, owner).catch(() => undefined), new Promise<void>(resolve => window.setTimeout(resolve, CHECKOUT_WAIT))]);
  } catch { /* advertising measurement never blocks a purchase */ }
}

/** Retries interrupted checkout notices, then asks for any first payment not yet reported. True once Meta has one. */
export async function flushMetaCommerce(owner: string, force = false): Promise<boolean> {
  try {
    const now = Date.now();
    const last = (() => { try { return Number(localStorage.getItem(CHECKED_KEY)) || 0; } catch { return 0; } })();
    if (!force && now - last < CHECK_INTERVAL) return false;
    try { localStorage.setItem(CHECKED_KEY, String(now)); } catch { /* checked again on the next visit */ }
    const pending = readPending();
    writePending(pending.filter(item => now - item.at < PENDING_LIFETIME));
    for (const item of pending.filter(entry => entry.owner === owner && now - entry.at < PENDING_LIFETIME)) await sendCheckout(item.requestId, owner);
    return (await ask('purchase', owner))?.sent === true;
  } catch { return false; }
}
