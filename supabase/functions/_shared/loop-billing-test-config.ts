import { loopBillingConfiguration, type LoopBillingConfig } from './loop-billing.ts';
import { UUID } from './core.ts';

export type IsolatedLoopBillingConfig = LoopBillingConfig & { testOwnerIds: readonly string[] };

/** Isolated acceptance configuration. No live billing key, product, enable flag or
 * review gate is read, copied or used as a fallback by this adapter. */
export function loopBillingTestConfiguration(get: (key: string) => string | undefined): IsolatedLoopBillingConfig | null {
  if (get('JOBVANCE_LOOP_TEST_BILLING_ENABLED') !== 'true') return null;
  const owners = (get('JOBVANCE_LOOP_TEST_OWNER_IDS') ?? '').split(',').map(value => value.trim().toLowerCase());
  if (owners.length < 1 || owners.length > 10 || owners.some(value => !UUID.test(value)) || new Set(owners).size !== owners.length) return null;
  const isolated: Record<string, string | undefined> = {
    JOBVANCE_LOOP_BILLING_ENABLED: 'true',
    JOBVANCE_BILLING_ENABLED: 'true',
    JOBVANCE_PAYMENT_PROVIDER: 'dodo',
    JOBVANCE_BILLING_MODE: 'test',
    APP_URL: get('JOBVANCE_LOOP_TEST_APP_URL'),
    DODO_PAYMENTS_API_KEY: get('DODO_TEST_PAYMENTS_API_KEY'),
    DODO_PAYMENTS_WEBHOOK_KEY: get('DODO_TEST_PAYMENTS_WEBHOOK_KEY'),
    DODO_PRODUCT_LOOP_WEEKLY: get('DODO_TEST_PRODUCT_LOOP_WEEKLY'),
    DODO_PRODUCT_LOOP_ACTIVE: get('DODO_TEST_PRODUCT_LOOP_ACTIVE'),
    DODO_PRODUCT_LOOP_DAILY: get('DODO_TEST_PRODUCT_LOOP_DAILY'),
  };
  const config = loopBillingConfiguration(key => isolated[key]);
  return config?.mode === 'test' && config.apiBaseUrl === 'https://test.dodopayments.com' ? { ...config, testOwnerIds: Object.freeze(owners) } : null;
}
