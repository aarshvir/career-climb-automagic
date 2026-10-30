import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: sdk.invoke }, auth: { getSession: sdk.getSession } } }));

const owner = '11111111-1111-4111-8111-111111111111';
const request = '5b3c1e0e-9a41-4c3f-8a52-0e1f5b0c7d11';
const clearCookie = (name: string) => { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`; };
let commerce: typeof import('@/lib/meta-commerce');
const sent = () => sdk.invoke.mock.calls.map(call => (call as unknown as [string, { body: Record<string, unknown>; headers: Record<string, string> }])[1]);

beforeEach(async () => {
  vi.resetModules(); vi.stubEnv('PROD', true);
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) } as Intl.DateTimeFormat);
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/pricing?loop_checkout=success&payment_id=pay_secret#fragment');
  document.cookie = '_fbp=fb.1.1729849200000.1234567890'; clearCookie('_fbc');
  sdk.invoke.mockReset(); sdk.invoke.mockResolvedValue({ data: { sent: true }, error: null });
  sdk.getSession.mockReset(); sdk.getSession.mockResolvedValue({ data: { session: { user: { id: owner }, access_token: 'fixture-token' } }, error: null });
  commerce = await import('@/lib/meta-commerce');
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  clearCookie('_fbp');
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
});

describe('checkout notice', () => {
  it('asks the server about the order with Meta cookies, the bare page address and the signed-in session only', async () => {
    await commerce.reportMetaCheckout(request, owner);
    expect(sent()).toHaveLength(1);
    const [{ body, headers }] = sent();
    expect(sdk.invoke.mock.calls[0][0]).toBe('meta-conversions');
    expect(body).toEqual({ kind: 'checkout', requestId: request, pageUrl: `${window.location.origin}/pricing`, fbp: 'fb.1.1729849200000.1234567890', fbc: undefined });
    expect(headers).toEqual({ Authorization: 'Bearer fixture-token' });
    expect(JSON.stringify(body)).not.toMatch(/pay_secret|fragment/);
    expect(localStorage.getItem('jobvance_meta_checkout_pending_v1')).toBeNull(); // accepted, so nothing to retry
  });

  it('sends nothing when the browser says do not share, the device opted out, or the visitor is in Europe', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    await commerce.reportMetaCheckout(request, owner);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
    localStorage.setItem('jobvance_ads_opt_out_v1', '1');
    await commerce.reportMetaCheckout(request, owner);
    localStorage.removeItem('jobvance_ads_opt_out_v1');
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'Europe/Dublin' }) } as Intl.DateTimeFormat);
    await commerce.reportMetaCheckout(request, owner);
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(localStorage.getItem('jobvance_meta_checkout_pending_v1')).toBeNull();
  });

  it('never sends for another account, a malformed order ID or outside production', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: { user: { id: '22222222-2222-4222-8222-222222222222' }, access_token: 'someone-else' } }, error: null });
    await commerce.reportMetaCheckout(request, owner);
    await commerce.reportMetaCheckout('not-a-uuid', owner);
    vi.stubEnv('PROD', false);
    await commerce.reportMetaCheckout(request, owner);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it('does not hold the buyer longer than a moment, and remembers an unfinished notice to retry later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // leaves Intl alone, which the opt-out checks use
    sdk.invoke.mockReturnValue(new Promise(() => undefined));
    const done = commerce.reportMetaCheckout(request, owner);
    await vi.advanceTimersByTimeAsync(1600);
    await done;
    expect(JSON.parse(localStorage.getItem('jobvance_meta_checkout_pending_v1') ?? '[]')).toMatchObject([{ requestId: request, owner }]);
  });

  it('never blocks the purchase when the service errors or throws', async () => {
    sdk.invoke.mockResolvedValueOnce({ data: null, error: new Error('down') }).mockRejectedValueOnce(new Error('network'));
    await expect(commerce.reportMetaCheckout(request, owner)).resolves.toBeUndefined();
    await expect(commerce.reportMetaCheckout(request, owner)).resolves.toBeUndefined();
    expect(JSON.parse(localStorage.getItem('jobvance_meta_checkout_pending_v1') ?? '[]')).toHaveLength(1);
  });
});

describe('purchase check', () => {
  it('asks once, then waits half an hour unless the owner just returned from checkout', async () => {
    expect(await commerce.flushMetaCommerce(owner)).toBe(true);
    expect(sent().map(call => call.body.kind)).toEqual(['purchase']);
    expect(await commerce.flushMetaCommerce(owner)).toBe(false);
    expect(sdk.invoke).toHaveBeenCalledTimes(1);
    expect(await commerce.flushMetaCommerce(owner, true)).toBe(true);
    expect(sdk.invoke).toHaveBeenCalledTimes(2);
  });

  it('retries an interrupted checkout notice for the same owner first, and drops stale or foreign ones', async () => {
    const stale = '7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f', foreign = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
    localStorage.setItem('jobvance_meta_checkout_pending_v1', JSON.stringify([
      { requestId: request, owner, at: Date.now() - 600000 }, { requestId: stale, owner, at: Date.now() - 6 * 86400000 }, { requestId: foreign, owner: '22222222-2222-4222-8222-222222222222', at: Date.now() },
    ]));
    await commerce.flushMetaCommerce(owner, true);
    expect(sent().map(call => [call.body.kind, call.body.requestId])).toEqual([['checkout', request], ['purchase', undefined]]);
    expect(JSON.parse(localStorage.getItem('jobvance_meta_checkout_pending_v1') ?? '[]').map((item: { requestId: string }) => item.requestId)).toEqual([foreign]);
  });

  it('stays quiet and reports no purchase when the server has nothing new', async () => {
    sdk.invoke.mockResolvedValue({ data: { sent: false, reason: 'nothing_new' }, error: null });
    expect(await commerce.flushMetaCommerce(owner, true)).toBe(false);
  });
});
