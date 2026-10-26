import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } } }));
import { cleanPath, startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { cleanBatch } from '../../supabase/functions/_shared/jobvance-track';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const SA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function session(owner = A, identity = SA, signature = 'original'): Session {
  return { user: { id: owner }, access_token: `e30.${btoa(JSON.stringify({ sub: owner, session_id: identity }))}.${signature}` } as Session;
}
let observe: (_event: string, value: Session | null) => void;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ack = (body: string) => { const value = JSON.parse(body); return response({ batchId: value.batchId, accepted: value.events.length, inserted: value.events.length, duplicate: false }); };
const bodies = () => mocks.fetch.mock.calls.map((call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string));
const events = () => bodies().flatMap(body => body.events);
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
async function begin(value: Session | null = null) {
  mocks.getSession.mockResolvedValue({ data: { session: value }, error: null });
  startAnalytics({ inTests: true }); trackPage(window.location); await settle();
}
function button(label = 'Start Job Loop') { const node = document.createElement('button'); node.textContent = label; document.body.appendChild(node); return node; }
function visibility(state: 'hidden' | 'visible') { Object.defineProperty(document, 'visibilityState', { configurable: true, value: state }); document.dispatchEvent(new Event('visibilitychange')); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T05:00:00.000Z'));
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); document.body.replaceChildren();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubGlobal('fetch', mocks.fetch);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  window.history.replaceState(null, '', '/job-loop?utm_source=instagram&fbclid=removed');
  mocks.onAuthStateChange.mockImplementation(callback => { observe = callback; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; });
  mocks.fetch.mockImplementation(async (_url, init) => ack(init.body));
});
afterEach(() => { stopAnalytics(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('immutable browser measurements', () => {
  it('records rapid routes immediately, ignores field values, and emits an admitted exact-ack batch', async () => {
    await begin();
    button().click();
    const field = document.createElement('input'); field.value = 'private typed CV'; document.body.appendChild(field); field.click();
    trackPage({ pathname: '/pricing', search: '?loopPlan=weekly&email=private' });
    button('Choose plan').click();
    window.dispatchEvent(new Event('pagehide')); await settle();
    expect(events().filter(e => e.kind === 'page_view').map(e => e.path)).toEqual(['/job-loop?utm_source=instagram', '/pricing?loopPlan=weekly']);
    expect(events().filter(e => e.kind === 'click').map(e => e.path)).toEqual(['/job-loop?utm_source=instagram', '/pricing?loopPlan=weekly']);
    expect(JSON.stringify(bodies())).not.toContain('private');
    expect(bodies().every(body => cleanBatch(body) !== null)).toBe(true);
    expect(mocks.fetch.mock.calls.every(call => call[1].keepalive === true)).toBe(true);
  });

  it('never lets a delayed bootstrap overwrite a newer account callback', async () => {
    let resolve!: (value: unknown) => void;
    mocks.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
    startAnalytics({ inTests: true }); trackPage(window.location);
    observe('SIGNED_IN', session(B, SB)); await settle();
    resolve({ data: { session: session() }, error: null }); await settle();
    button().click(); window.dispatchEvent(new Event('pagehide')); await settle();
    expect(bodies().every(body => body.token === session(B, SB).access_token)).toBe(true);
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain(session(B, SB).access_token);
  });

  it('does not guess signed-out authority when bootstrap fails', async () => {
    mocks.getSession.mockRejectedValue(new Error('Auth unavailable'));
    startAnalytics({ inTests: true }); trackPage(window.location); button().click();
    await vi.advanceTimersByTimeAsync(6000); expect(mocks.fetch).not.toHaveBeenCalled();
    observe('INITIAL_SESSION', null); await settle();
    expect(events().some(e => e.kind === 'click')).toBe(true);
    expect(bodies().every(body => body.token === null)).toBe(true);
  });

  it('keeps queued A work under A through A→B→A and rotates browser attribution for each change', async () => {
    await begin(session()); button('A action').click();
    observe('SIGNED_IN', session(B, SB)); await settle(); button('B action').click();
    observe('SIGNED_IN', session()); await settle(); button('A return').click();
    window.dispatchEvent(new Event('pagehide')); await settle();
    const find = (label: string) => bodies().find(body => body.events.some((e: { label?: string }) => e.label === label));
    expect(find('A action').token).toBe(session().access_token);
    expect(find('B action').token).toBe(session(B, SB).access_token);
    expect(find('A return').token).toBe(session().access_token);
    expect(new Set([find('A action').visitorId, find('B action').visitorId, find('A return').visitorId]).size).toBe(3);
  });

  it('retries the same IDs and measurement after ambiguous delivery, accepting the original duplicate=false receipt', async () => {
    await begin(); mocks.fetch.mockClear(); mocks.fetch.mockRejectedValueOnce(new Error('Connection interrupted'));
    button().click(); window.dispatchEvent(new Event('pagehide')); await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(bodies()).toHaveLength(2); expect(bodies()[1]).toEqual(bodies()[0]);
    await vi.advanceTimersByTimeAsync(60_000); expect(bodies()).toHaveLength(2);
  });

  it('rejects an incorrect acknowledgement and does not silently discard the original batch', async () => {
    await begin(); mocks.fetch.mockClear(); mocks.fetch.mockResolvedValueOnce(response({ batchId: crypto.randomUUID(), accepted: 3, inserted: 3, duplicate: false }));
    button().click(); window.dispatchEvent(new Event('pagehide')); await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(bodies()).toHaveLength(2); expect(bodies()[1].batchId).toBe(bodies()[0].batchId);
  });

  it('uses refreshed credentials only inside the same original SDK session', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Offline'));
    await begin(session());
    observe('TOKEN_REFRESHED', session(A, SA, 'refresh'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(bodies()[1].token).toBe(session(A, SA, 'refresh').access_token);
    expect(bodies()[1].events).toEqual(bodies()[0].events);
    expect(bodies()[1].batchId).toBe(bodies()[0].batchId);
  });

  it('reports visible deltas only and resumes a BFCache page as a new exposure', async () => {
    await begin(); await vi.advanceTimersByTimeAsync(1000); visibility('hidden'); await settle();
    await vi.advanceTimersByTimeAsync(10_000); visibility('visible');
    await vi.advanceTimersByTimeAsync(2000); window.dispatchEvent(new Event('pagehide')); await settle();
    const back = new Event('pageshow'); Object.defineProperty(back, 'persisted', { value: true }); window.dispatchEvent(back);
    await vi.advanceTimersByTimeAsync(3000); window.dispatchEvent(new Event('pagehide')); await settle();
    expect(events().filter(e => e.kind === 'page_leave').map(e => e.durationMs)).toEqual([1000, 2000, 3000]);
    expect(new Set(events().filter(e => e.kind === 'page_view').map(e => e.pageId)).size).toBe(2);
  });

  it('closes old idle time under the old visit and gives the next page a new landing/context', async () => {
    await begin(); const start = Date.now();
    vi.setSystemTime(start + 31 * 60_000);
    window.history.replaceState(null, '', '/pricing?utm_campaign=second');
    trackPage(window.location); window.dispatchEvent(new Event('pagehide')); await settle();
    const old = bodies().find(body => body.events.some((e: { path: string; kind: string }) => e.kind === 'page_leave' && e.path.startsWith('/job-loop')));
    const next = bodies().find(body => body.events.some((e: { path: string; kind: string }) => e.kind === 'page_view' && e.path.startsWith('/pricing')));
    expect(old.sessionId).not.toBe(next.sessionId);
    expect(old.context.landing).toBe('/job-loop?utm_source=instagram');
    expect(next.context).toMatchObject({ landing: '/pricing?utm_campaign=second', utm_campaign: 'second' });
  });

  it('preserves an anonymous browser for first sign-in, but logout starts a separate visitor', async () => {
    await begin(); button('Anonymous action').click();
    observe('SIGNED_IN', session()); await settle(); button('Signed action').click();
    observe('SIGNED_OUT', null); await settle(); button('After logout').click();
    window.dispatchEvent(new Event('pagehide')); await settle();
    const find = (label: string) => bodies().find(body => body.events.some((e: { label?: string }) => e.label === label));
    expect(find('Anonymous action').visitorId).toBe(find('Signed action').visitorId);
    expect(find('After logout').visitorId).not.toBe(find('Signed action').visitorId);
    expect(find('Anonymous action').token).toBeNull();
  });

  it('omits private control contents and strips contact or external query values', async () => {
    await begin(); trackPage({ pathname: '/loop', search: '?token=secret' });
    button('My private CV and phone').click();
    const link = document.createElement('a'); link.href = 'mailto:private@example.com'; link.textContent = 'Private person'; link.addEventListener('click', event => event.preventDefault()); document.body.appendChild(link); link.click();
    window.dispatchEvent(new Event('pagehide')); await settle();
    const clicks = events().filter(e => e.kind === 'click');
    expect(clicks).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'button' }), expect.objectContaining({ label: 'a', href: 'mailto:' })]));
    expect(JSON.stringify(bodies())).not.toContain('private');
    expect(cleanPath({ pathname: '/auth/callback', search: '?code=secret&utm_source=ig' })).toBe('/auth/callback?utm_source=ig');
  });

  it('unsubscribes and does not dispatch stale bootstrap work after teardown', async () => {
    let resolve!: (value: unknown) => void; mocks.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
    startAnalytics({ inTests: true }); trackPage(window.location); stopAnalytics();
    resolve({ data: { session: session() }, error: null }); await settle();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
