/** Fixed monthly catalogue shared by public cards and the authenticated quote
 * service. These amounts are not client authority: SQL and Dodo independently
 * verify the exact selected price before checkout and when a payment settles.
 * Existing subscriptions retain their original currency and amount. */
export const LOOP_LOCAL_PRICE_CATALOG_VERSION = 'loop-local-2026-10-18-v3';
export type LoopLocalPlan = 'weekly' | 'active' | 'daily';

export const LOOP_LOCAL_PRICE_SOURCE = {
  asOf: '2026-10-16',
  publishedAt: '2026-10-18',
  ecb: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  aed: 'https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency',
  // ECB quotes units per EUR; local/USD = local/EUR divided by USD/EUR.
  eurRates: { USD: '1.1253', EUR: '1', GBP: '0.84385', INR: '106.8640', CAD: '1.5935', AUD: '1.6171', SGD: '1.4395', JPY: '177.82' },
  aedPerUsd: '3.6725',
  roundingPolicy: 'nearest-whole-currency-ending-v2',
  // INR/JPY: nearest 1000-unit candidate minus one whole currency unit.
  // Other local currencies: nearest whole unit below 100, otherwise the
  // nearest 10-unit candidate minus one whole currency unit. Ties go upwards.
  // USD keeps the previously approved base prices. No live FX runs in clients.
} as const;

export const LOOP_LOCAL_CURRENCIES = {
  USD: { label: 'US dollar', exponent: 2, amounts: { weekly: 2900, active: 5900, daily: 9900 } },
  EUR: { label: 'Euro', exponent: 2, amounts: { weekly: 2600, active: 5200, daily: 8800 } },
  GBP: { label: 'British pound', exponent: 2, amounts: { weekly: 2200, active: 4400, daily: 7400 } },
  INR: { label: 'Indian rupee', exponent: 2, amounts: { weekly: 299900, active: 599900, daily: 899900 } },
  AED: { label: 'UAE dirham', exponent: 2, amounts: { weekly: 10900, active: 21900, daily: 35900 } },
  CAD: { label: 'Canadian dollar', exponent: 2, amounts: { weekly: 4100, active: 8400, daily: 13900 } },
  AUD: { label: 'Australian dollar', exponent: 2, amounts: { weekly: 4200, active: 8500, daily: 13900 } },
  SGD: { label: 'Singapore dollar', exponent: 2, amounts: { weekly: 3700, active: 7500, daily: 12900 } },
  JPY: { label: 'Japanese yen', exponent: 0, amounts: { weekly: 4999, active: 8999, daily: 15999 } },
} as const;
export type LoopLocalCurrency = keyof typeof LOOP_LOCAL_CURRENCIES;

/** Billing country is chosen independently of job-search preferences. */
export const LOOP_LOCAL_COUNTRIES = {
  US: { label: 'United States', currency: 'USD' },
  IN: { label: 'India', currency: 'INR' },
  AE: { label: 'United Arab Emirates', currency: 'AED' },
  GB: { label: 'United Kingdom', currency: 'GBP' },
  CA: { label: 'Canada', currency: 'CAD' },
  AU: { label: 'Australia', currency: 'AUD' },
  SG: { label: 'Singapore', currency: 'SGD' },
  JP: { label: 'Japan', currency: 'JPY' },
  AT: { label: 'Austria', currency: 'EUR' },
  BE: { label: 'Belgium', currency: 'EUR' },
  CY: { label: 'Cyprus', currency: 'EUR' },
  DE: { label: 'Germany', currency: 'EUR' },
  EE: { label: 'Estonia', currency: 'EUR' },
  ES: { label: 'Spain', currency: 'EUR' },
  FI: { label: 'Finland', currency: 'EUR' },
  FR: { label: 'France', currency: 'EUR' },
  GR: { label: 'Greece', currency: 'EUR' },
  HR: { label: 'Croatia', currency: 'EUR' },
  IE: { label: 'Ireland', currency: 'EUR' },
  IT: { label: 'Italy', currency: 'EUR' },
  LT: { label: 'Lithuania', currency: 'EUR' },
  LU: { label: 'Luxembourg', currency: 'EUR' },
  LV: { label: 'Latvia', currency: 'EUR' },
  MT: { label: 'Malta', currency: 'EUR' },
  NL: { label: 'Netherlands', currency: 'EUR' },
  PT: { label: 'Portugal', currency: 'EUR' },
  SI: { label: 'Slovenia', currency: 'EUR' },
  SK: { label: 'Slovakia', currency: 'EUR' },
} as const;
export type LoopLocalCountry = keyof typeof LOOP_LOCAL_COUNTRIES;

export function isLoopLocalCurrency(value: unknown): value is LoopLocalCurrency {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOOP_LOCAL_CURRENCIES, value);
}
export function isLoopLocalCountry(value: unknown): value is LoopLocalCountry {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOOP_LOCAL_COUNTRIES, value);
}
export function loopLocalPrice(plan: unknown, currency: unknown): number | null {
  if (!isLoopLocalCurrency(currency) || typeof plan !== 'string' || !['weekly', 'active', 'daily'].includes(plan)) return null;
  return LOOP_LOCAL_CURRENCIES[currency].amounts[plan as LoopLocalPlan];
}
