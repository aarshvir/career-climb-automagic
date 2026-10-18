import { ApiError, DODO_PRODUCT_ID, uuid } from './core.ts';
import { loopBillingPlan, loopCheckoutBody, LOOP_BILLING_PLANS, validateLoopBillingProduct, type LoopBillingConfig, type LoopBillingPlan, type LoopBillingPriceAuthority } from './loop-billing.ts';
import { isLoopLocalCountry, isLoopLocalCurrency, LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION, loopLocalPrice } from './loop-local-prices.ts';

const invalid = () => new ApiError(409, 'LOOP_BILLING_PRICE_CHANGED', 'This price could not be confirmed. Refresh the quote before checkout.');
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; }
function plan(value: unknown): LoopBillingPlan { return loopBillingPlan(value === 'three_weekly' ? 'active' : value); }
function amount(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1000000000) throw invalid(); return value as number; }
const absent = (value: unknown) => value === undefined || value === null;
export interface LoopPriceSnapshot extends LoopBillingPriceAuthority {
  quoteId?: string; country: string | null; exponent: number; catalogVersion: string; plan: LoopBillingPlan;
  taxInclusive: true; interval: 'month';
}
export interface LoopPriceQuote extends LoopPriceSnapshot {
  quoteId: string; requestId: string; generation: number; mode: 'test' | 'live'; expiresAt: string;
  localizedPriceId: string | null; providerRevision: string; previewHash: string;
  initialAmountMinor: number; recurringAmountMinor: number;
}
/** SQL-owned historical snapshots may use an earlier catalogue revision. Never
 * compare them to today's FX, rules, or selected market. */
export function storedLoopPrice(orderValue: unknown, expectedPlan: LoopBillingPlan): LoopPriceSnapshot {
  const order = object(orderValue), raw = absent(order.pricing) ? null : object(order.pricing);
  const productId = raw?.productId ?? order.product_id;
  if (typeof productId !== 'string' || !DODO_PRODUCT_ID.test(productId) || !absent(order.product_id) && order.product_id !== productId || raw && !absent(raw.plan) && plan(raw.plan) !== expectedPlan) throw invalid();
  if (!raw || absent(raw.quoteId)) {
    if (raw && (raw.currency !== 'USD' || raw.amountMinor !== LOOP_BILLING_PLANS[expectedPlan].amount || raw.exponent !== 2 || raw.taxInclusive !== true || raw.interval !== 'month')) throw invalid();
    return { productId, currency: 'USD', amountMinor: LOOP_BILLING_PLANS[expectedPlan].amount, exponent: 2, country: null, catalogVersion: 'legacy-usd-v1', plan: expectedPlan, taxInclusive: true, interval: 'month' };
  }
  if (!isLoopLocalCurrency(raw.currency) || raw.exponent !== LOOP_LOCAL_CURRENCIES[raw.currency].exponent || typeof raw.country !== 'string' || !/^[A-Z]{2}$/.test(raw.country) ||
    raw.taxInclusive !== true || raw.interval !== 'month' || plan(raw.plan) !== expectedPlan || typeof raw.catalogVersion !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(raw.catalogVersion)) throw invalid();
  return { productId, currency: raw.currency, amountMinor: amount(raw.amountMinor), exponent: raw.exponent as number,
    country: raw.country, catalogVersion: raw.catalogVersion, plan: expectedPlan, quoteId: uuid(raw.quoteId, 'Price quote'), taxInclusive: true, interval: 'month' };
}
export function parseLoopQuote(value: unknown): LoopPriceQuote {
  const raw = object(value), pricing = storedLoopPrice({ product_id: raw.productId, pricing: raw }, plan(raw.plan));
  if (!pricing.quoteId || !Number.isSafeInteger(raw.generation) || (raw.generation as number) < 0 || raw.mode !== 'test' && raw.mode !== 'live' || typeof raw.expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(raw.expiresAt) || !Number.isFinite(Date.parse(raw.expiresAt)) ||
    typeof raw.providerRevision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.providerRevision) || typeof raw.previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.previewHash) ||
    !absent(raw.localizedPriceId) && (typeof raw.localizedPriceId !== 'string' || !/^lcp_[A-Za-z0-9_-]{1,100}$/.test(raw.localizedPriceId)) ||
    raw.initialAmountMinor !== pricing.amountMinor || raw.recurringAmountMinor !== pricing.amountMinor) throw invalid();
  return { ...pricing, quoteId: pricing.quoteId, requestId: uuid(raw.requestId, 'Price request'), generation: raw.generation as number, mode: raw.mode as 'test' | 'live',
    expiresAt: new Date(raw.expiresAt).toISOString(), providerRevision: raw.providerRevision, previewHash: raw.previewHash, localizedPriceId: raw.localizedPriceId as string | null ?? null,
    initialAmountMinor: pricing.amountMinor, recurringAmountMinor: pricing.amountMinor };
}
export function publicLoopPrice(price: LoopPriceSnapshot) {
  return { quoteId: price.quoteId ?? null, country: price.country, currency: price.currency, amountMinor: price.amountMinor, exponent: price.exponent,
    catalogVersion: price.catalogVersion, taxInclusive: true as const, interval: 'month' as const };
}
export function publicLoopQuote(quote: LoopPriceQuote) {
  return { ...publicLoopPrice(quote), quoteId: quote.quoteId, requestId: quote.requestId, generation: quote.generation, plan: quote.plan, expiresAt: quote.expiresAt };
}
export function quoteCheckoutBody(config: LoopBillingConfig, owner: string, requestId: string, generation: number, quote: LoopPriceQuote) {
  const body = loopCheckoutBody({ ...config, loopProducts: { ...config.loopProducts, [quote.plan]: quote.productId } }, owner, requestId, generation, quote.plan);
  return { ...body, billing_currency: quote.currency, billing_address: { country: quote.country }, metadata: { ...body.metadata, quote_id: quote.quoteId },
    feature_flags: { ...body.feature_flags, allow_customer_editing_country: false } };
}
export function loopPricePreviewBody(expected: LoopPriceSnapshot) {
  return { product_cart: [{ product_id: expected.productId, quantity: 1 }], billing_currency: expected.currency, billing_address: { country: expected.country },
    feature_flags: { allow_discount_code: false, allow_currency_selection: false, allow_customer_editing_country: false }, subscription_data: { trial_period_days: 0 } };
}
export async function loopPriceHash(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Catalogue authority is server-owned and versioned; the provider must agree. */
export function validateLoopPriceCandidate(value: unknown, config: LoopBillingConfig, selected: { plan: LoopBillingPlan; currency: string; country: string }): LoopPriceSnapshot {
  const raw = object(value);
  if (!isLoopLocalCountry(selected.country) || !isLoopLocalCurrency(selected.currency) || raw.catalogVersion !== LOOP_LOCAL_PRICE_CATALOG_VERSION || raw.productId !== config.loopProducts[selected.plan] ||
    plan(raw.plan) !== selected.plan || raw.currency !== selected.currency || raw.amountMinor !== loopLocalPrice(selected.plan, selected.currency) || raw.exponent !== LOOP_LOCAL_CURRENCIES[selected.currency].exponent || raw.taxInclusive !== true) throw invalid();
  return { productId: raw.productId as string, currency: selected.currency, amountMinor: amount(raw.amountMinor), exponent: raw.exponent as number, country: selected.country,
    catalogVersion: raw.catalogVersion, plan: selected.plan, taxInclusive: true, interval: 'month' };
}
export async function verifyLoopPriceRule(productValue: unknown, rulesValue: unknown, config: LoopBillingConfig, expected: LoopPriceSnapshot) {
  const product = object(productValue);
  validateLoopBillingProduct(product, config, expected.plan);
  let rule: Record<string, unknown> | null = null;
  if (expected.currency !== 'USD') {
    const rules = object(rulesValue);
    if (product.pricing_mode !== 'by_currency' || !Array.isArray(rules.items) || rules.items.length > 100) throw invalid();
    const matching = rules.items.map(object).filter(item => item.currency === expected.currency);
    if (matching.length !== 1) throw invalid();
    rule = matching[0];
    if (rule.product_id !== expected.productId || rule.mode !== 'by_currency' || !absent(rule.country_code) || rule.amount !== expected.amountMinor ||
      typeof rule.id !== 'string' || !/^lcp_[A-Za-z0-9_-]{1,100}$/.test(rule.id) || typeof rule.updated_at !== 'string' || !Number.isFinite(Date.parse(rule.updated_at))) throw invalid();
  }
  const providerRevision = await loopPriceHash({ productId: expected.productId, basePrice: LOOP_BILLING_PLANS[expected.plan].amount, currency: expected.currency,
    amountMinor: expected.amountMinor, pricingMode: product.pricing_mode ?? null, taxInclusive: true,
    localizedPriceId: rule?.id ?? null, updatedAt: rule?.updated_at ?? null });
  return { localizedPriceId: rule?.id as string | undefined ?? null, providerRevision };
}
/** Checkout preview performs no purchase. Validate both today's gross charge and
 * each monthly renewal; no discount, add-on, usage or trial may change them. */
export async function verifyLoopPricePreview(value: unknown, expected: LoopPriceSnapshot): Promise<string> {
  const preview = object(value), current = object(preview.current_breakup), recurring = object(preview.recurring_breakup);
  if (preview.currency !== expected.currency || preview.billing_country !== expected.country || preview.is_byop !== false || preview.payment_method_required !== true ||
    preview.total_price !== expected.amountMinor || current.total_amount !== expected.amountMinor || recurring.total_amount !== expected.amountMinor || current.discount !== 0 || recurring.discount !== 0 ||
    !Array.isArray(preview.product_cart) || preview.product_cart.length !== 1 || !absent(preview.trial_amount) || !absent(preview.trial_period_days) && preview.trial_period_days !== 0) throw invalid();
  const item = object(preview.product_cart[0]);
  if (item.product_id !== expected.productId || item.quantity !== 1 || item.currency !== expected.currency || item.is_subscription !== true || item.is_usage_based !== false || item.tax_inclusive !== true ||
    !absent(item.discount_amount) && item.discount_amount !== 0 || !absent(item.addons) && (!Array.isArray(item.addons) || item.addons.length !== 0) ||
    !absent(item.meters) && (!Array.isArray(item.meters) || item.meters.length !== 0)) throw invalid();
  if (!absent(preview.subscriptions)) {
    if (!Array.isArray(preview.subscriptions) || preview.subscriptions.length !== 1) throw invalid();
    const sub = object(preview.subscriptions[0]);
    if (sub.product_id !== expected.productId || sub.amount_due_now !== expected.amountMinor || sub.recurring_amount !== expected.amountMinor || !absent(sub.trial_period_days) && sub.trial_period_days !== 0) throw invalid();
  }
  for (const breakup of [current, recurring]) if (!absent(breakup.tax) && (!Number.isSafeInteger(breakup.tax) || (breakup.tax as number) < 0 || (breakup.tax as number) > expected.amountMinor)) throw invalid();
  // Provider estimate dates vary with wall time; only monetary/cart authority is hashed.
  return loopPriceHash({ country: expected.country, currency: expected.currency, product: expected.productId, quantity: 1, taxInclusive: true,
    initialAmount: current.total_amount, recurringAmount: recurring.total_amount, initialTax: current.tax ?? null, recurringTax: recurring.tax ?? null });
}
