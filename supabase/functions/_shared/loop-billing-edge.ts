import { ApiError, type DodoBillingConfig } from './core.ts';
import type { adminClient } from './runtime.ts';
export function loopBillingRpc(admin: ReturnType<typeof adminClient>) {
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(name, args);
    if (error) {
      const codes: [string,number,string][] = [
        ['LOOP_PILOT_FULL',429,'Job Loop has no available service places right now. No checkout was opened and no charge was requested.'],
        ['LOOP_BILLING_AUTH',401,'Sign in again before managing billing.'],
        ['LOOP_BILLING_SESSION',401,'Sign in again before managing billing.'],
        ['LOOP_BILLING_GENERATION',409,'Your Job Loop changed. Refresh before continuing.'],
        ['LOOP_REQUEST_STALE',409,'Your Job Loop changed. Refresh before continuing.'],
        ['LOOP_BILLING_CONFLICT',409,'This billing request belongs to a different action.'],
        ['LOOP_BILLING_REQUEST_CONFLICT',409,'This billing request belongs to a different action or sign-in session.'],
        ['LOOP_BILLING_REVISION_CONFLICT',409,'This subscription changed. Refresh it before confirming cancellation.'],
        ['LOOP_BILLING_SUBSCRIPTION_CHANGED',409,'This subscription changed. Refresh it before confirming cancellation.'],
        ['LOOP_CHECKOUT_PENDING',409,'An existing checkout is still open or needs reconciliation. Resume it or contact support before starting another.'],
        ['LOOP_CANCELLATION_PENDING',409,'A cancellation is still being confirmed. Reuse its original request and refresh the subscription.'],
        ['LOOP_BILLING_PAID_PERIOD_REQUIRED',409,'This subscription has no verified paid month yet. Payment confirmation will be retried.'],
        ['LOOP_BILLING_ACTIVE',409,'An existing subscription or checkout must be managed first.'],
        ['LOOP_BILLING_LIMIT',429,'Too many new checkout attempts. Reuse your existing checkout or contact support.'],
        ['LOOP_BILLING_UNBOUND',409,'This payment is not linked to a Job Loop checkout.'],
      ];
      for (const [code,status,message] of codes) if (error.message.includes(code)) throw new ApiError(status,code,message);
      throw new ApiError(503,'LOOP_BILLING_PERSISTENCE','This billing update could not be confirmed. Retry with the same request.');
    }
    return data as T;
  };
}
export async function loopBillingProvider(config: DodoBillingConfig, endpoint: string, body?: Record<string, unknown>, method?: 'GET'|'POST'|'PATCH'): Promise<Record<string, unknown>> {
  const invalid = () => new ApiError(503,'PAYMENT_PROVIDER_ERROR','Billing is temporarily unavailable. Keep the same request while its outcome is checked.');
  if (!/^(?:products\/pdt_|payments\/pay_|subscriptions\/sub_|refunds\/ref_|checkouts(?:\/cks_)?)[A-Za-z0-9_-]*$/.test(endpoint)) throw invalid();
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/${endpoint}`, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${config.secretKey}`, Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch { throw invalid(); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw invalid(); }
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
