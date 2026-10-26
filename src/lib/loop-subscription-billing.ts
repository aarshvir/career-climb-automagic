import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { requireLoopOwner } from '@/lib/job-loop-api';
import { trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import { subscriptionPlans, type LoopSubscriptionPlan } from '@/lib/subscription-plans';
import {LOOP_LOCAL_PRICE_CATALOG_VERSION,LOOP_LOCAL_CURRENCIES,isLoopLocalCurrency,isLoopLocalCountry,loopLocalPrice,type LoopLocalCountry,type LoopLocalCurrency} from '@/lib/loop-local-prices';

const generation = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const plan = z.enum(['weekly', 'active', 'daily']);
const mode = z.enum(['test', 'live']);
const currency=z.string().refine(isLoopLocalCurrency),country=z.string().refine(isLoopLocalCountry);
const pricing=z.object({quoteId:z.string().uuid().nullable(),country:z.string().regex(/^[A-Z]{2}$/).nullable(),currency,amountMinor:z.number().int().positive().max(1000000000),exponent:z.number().int().min(0).max(3),catalogVersion:z.string().min(1).max(100),taxInclusive:z.literal(true),interval:z.literal('month')}).strict();
const quoteSchema=pricing.extend({quoteId:z.string().uuid(),country,requestId:z.string().uuid(),generation,plan,expiresAt:z.string().datetime({offset:true})}).strict();
const subscription = z.object({ subscriptionId: z.string().regex(/^sub_[A-Za-z0-9_-]{1,100}$/), plan,
  status: z.enum(['pending','active','on_hold','paused','cancelled','failed','expired','past_due']),
  validUntil: z.string().datetime({ offset: true }), periodStart: z.string().datetime({ offset: true }).nullable(),
  cancelAtPeriodEnd: z.boolean(), revoked: z.boolean(), graceUntil: z.string().datetime({offset:true}).nullable(), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),pricing:pricing.nullable() }).strict();
const checkout = z.object({ requestId: z.string().uuid(), plan, status: z.string().min(1).max(40), checkoutUrl: z.string().max(4000).nullable(),pricing:pricing.nullable() }).strict();
const entitlement = z.object({active:z.boolean(),plan:z.enum(['weekly','three_weekly','daily','pilot']).nullable(),cadence:z.enum(['weekly','three_weekly','daily']).nullable(),variantLimit:z.literal(3),maxWeeklyRuns:z.union([z.literal(0),z.literal(1),z.literal(3),z.literal(7)]),validUntil:z.string().datetime({offset:true}).nullable()}).strict();
const cancelRequest = z.object({requestId:z.string().uuid(),subscriptionId:z.string().regex(/^sub_[A-Za-z0-9_-]{1,100}$/),status:z.enum(['creating','uncertain','confirmed']),version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
const statusSchema = z.object({ billingConfigured: z.boolean(), billingMode: mode, generation: generation.nullable(),fulfillmentPending:z.boolean(),
  plans: z.array(z.object({ id: plan, amount: z.number().int(), currency: z.literal('USD'), interval: z.literal('month'), runsPerWeek: z.union([z.literal(1),z.literal(3),z.literal(7)]) }).strict()).max(3),
  entitlement: entitlement.nullable(), subscription: subscription.nullable(), checkout: checkout.nullable(),cancelRequest:cancelRequest.nullable() }).strict();
export type LoopBillingStatus = z.infer<typeof statusSchema>;
export type LoopSubscription = z.infer<typeof subscription>;
export type LoopPricing = z.infer<typeof pricing>;
export type LoopPriceQuote = z.infer<typeof quoteSchema>;
export interface LoopBillingScope { ownerId: string; authority: number; billingMode?: 'test'|'live'; pricing?:LoopPricing }
export interface LoopCheckoutIntent { action: 'checkout'; plan: LoopSubscriptionPlan; requestId: string; expectedGeneration: number; consent: true;quoteId?:string }
export interface LoopCancelIntent { action: 'cancel'; requestId: string; expectedGeneration: number; expectedSubscriptionId: string; expectedVersion: number; consent: true;contractVersion:2 }
export interface LoopQuoteIntent {action:'quote';requestId:string;expectedGeneration:number;plan:LoopSubscriptionPlan;country:LoopLocalCountry;currency:LoopLocalCurrency}
export class LoopBillingError extends Error { constructor(message: string, public readonly code: string | null = null) { super(message); this.name = 'LoopBillingError'; } }

export function captureLoopCheckoutIntent(selectedPlan: LoopSubscriptionPlan, expectedGeneration: number, requestId: string = crypto.randomUUID(),quoteId?:string): Readonly<LoopCheckoutIntent> {
  return Object.freeze(z.object({ action:z.literal('checkout'),plan,requestId:z.string().uuid(),expectedGeneration:generation,consent:z.literal(true),quoteId:z.string().uuid().optional() }).strict().parse({action:'checkout',plan:selectedPlan,requestId,expectedGeneration,consent:true,...(quoteId?{quoteId}:{})}) as LoopCheckoutIntent);
}
export function captureLoopCancelIntent(current: LoopSubscription, expectedGeneration: number, requestId: string = crypto.randomUUID()): Readonly<LoopCancelIntent> {
  const parsed = subscription.parse(current);
  return Object.freeze({action:'cancel',requestId:z.string().uuid().parse(requestId),expectedGeneration:generation.parse(expectedGeneration),expectedSubscriptionId:parsed.subscriptionId,expectedVersion:parsed.version,consent:true,contractVersion:2});
}
export function captureLoopQuoteIntent(value:LoopQuoteIntent):Readonly<LoopQuoteIntent>{return Object.freeze(z.object({action:z.literal('quote'),requestId:z.string().uuid(),expectedGeneration:generation,plan,country,currency}).strict().parse(value) as LoopQuoteIntent);}
export function quotePricing(value:LoopPriceQuote):LoopPricing {return pricing.parse({quoteId:value.quoteId,country:value.country,currency:value.currency,amountMinor:value.amountMinor,exponent:value.exponent,catalogVersion:value.catalogVersion,taxInclusive:value.taxInclusive,interval:value.interval});}
export function sameLoopPricing(a:LoopPricing|undefined|null,b:LoopPricing|undefined|null):boolean{return !!a&&!!b&&['quoteId','country','currency','amountMinor','exponent','catalogVersion','taxInclusive','interval'].every(key=>a[key]===b[key]);}
function validateMoney(value:LoopPricing){if(!isLoopLocalCurrency(value.currency)||value.exponent!==LOOP_LOCAL_CURRENCIES[value.currency].exponent)throw new LoopBillingError('The original payment currency could not be confirmed.');}
/** A checkout address is bound to the exact provider mode. A test URL is never a live payment. */
export function validLoopCheckoutUrl(value: string, billingMode: 'test'|'live'): boolean {
  try { const url=new URL(value); return url.protocol==='https:' && url.hostname === (billingMode==='live'?'checkout.dodopayments.com':'test.checkout.dodopayments.com') && !url.username && !url.password && !url.port && url.pathname.startsWith('/'); } catch { return false; }
}
function currentScope(scope: LoopBillingScope, stillCurrent?: () => boolean) {
  if (scope.authority < 0 || trackingDraftAuthority(scope.ownerId)!==scope.authority || stillCurrent && !stillCurrent()) throw new LoopBillingError('Your sign-in changed. Reopen your current Automated Job Loop billing before continuing.','AUTH_CHANGED');
}
async function call(scope: LoopBillingScope, body: object, stillCurrent?: () => boolean): Promise<unknown> {
  const original=Object.freeze({...body});
  const assertOwner=async()=>{currentScope(scope,stillCurrent);await requireLoopOwner(scope.ownerId);currentScope(scope,stillCurrent);};
  await assertOwner();
  let result: {data:unknown;error:unknown};
  try { result=await supabase.functions.invoke('job-loop-billing',{body:original}); }
  catch { await assertOwner();throw new LoopBillingError('The payment action could not be confirmed. Refresh billing before retrying the original request.','UNCONFIRMED'); }
  await assertOwner();
  if (result.error) {
    const response=(result.error as {context?:unknown}).context;
    const payload=response instanceof Response ? await response.clone().json().catch(()=>null) : null;
    await assertOwner();
    const code=payload && !Array.isArray(payload) && typeof payload.code==='string' && /^[A-Z_]{1,80}$/.test(payload.code) ? payload.code : null;
    throw new LoopBillingError(['BILLING_UNAVAILABLE','LOOP_BILLING_UNAVAILABLE'].includes(code??'')?'Automated Job Loop checkout is not available right now. Your existing access and saved work are unchanged.':code==='LOOP_CHECKOUT_FINISHED'?'This checkout already has a subscription. Refresh billing to manage its current state.':code==='LOOP_SUBSCRIPTION_EXISTS'?'An existing subscription may still renew or have an unresolved payment. Refresh billing and confirm its cancellation, or contact support before another checkout.':code==='LOOP_PILOT_FULL'?'Automated Job Loop is at its current account capacity. A new checkout was not opened. Existing access and saved work are unchanged.':code==='LOOP_CHECKOUT_PENDING'?'A previous checkout needs confirmation. Refresh billing and resume that checkout.':'We could not confirm this billing action. Refresh billing before retrying the original request.',code);
  }
  return result.data;
}
export async function readLoopBilling(scope: LoopBillingScope, stillCurrent?:()=>boolean):Promise<LoopBillingStatus> {
  const result=statusSchema.parse(await call(scope,{action:'status',contractVersion:2},stillCurrent));
  const ids=new Set<string>();
  for(const offered of result.plans){const known=subscriptionPlans.find(item=>item.id===offered.id);if(!known || ids.has(offered.id) || offered.amount!==known.priceUsd*100 || offered.runsPerWeek!==(offered.id==='weekly'?1:offered.id==='active'?3:7))throw new LoopBillingError('The monthly plan could not be confirmed. Please refresh billing.');ids.add(offered.id);}
  if(result.checkout?.checkoutUrl && !validLoopCheckoutUrl(result.checkout.checkoutUrl,result.billingMode))throw new LoopBillingError('The saved checkout address could not be confirmed.');
  if(result.subscription?.pricing)validateMoney(result.subscription.pricing);
  if(result.checkout?.pricing)validateMoney(result.checkout.pricing);
  return result;
}
export async function requestLoopPriceQuote(scope:LoopBillingScope,intent:Readonly<LoopQuoteIntent>,stillCurrent?:()=>boolean):Promise<LoopPriceQuote>{
  const original=captureLoopQuoteIntent(intent),result=quoteSchema.parse(await call(scope,original,stillCurrent));
  validateMoney(result);
  if(result.requestId!==original.requestId||result.generation!==original.expectedGeneration||result.plan!==original.plan||result.country!==original.country||result.currency!==original.currency||result.catalogVersion!==LOOP_LOCAL_PRICE_CATALOG_VERSION||result.amountMinor!==loopLocalPrice(original.plan,original.currency)||Date.parse(result.expiresAt)<=Date.now())throw new LoopBillingError('This monthly price is no longer current. Refresh the price before continuing.');
  return Object.freeze(result);
}
export async function createLoopSubscriptionCheckout(scope:LoopBillingScope,intent:Readonly<LoopCheckoutIntent>,stillCurrent?:()=>boolean){
  const original=Object.freeze(z.object({action:z.literal('checkout'),plan,requestId:z.string().uuid(),expectedGeneration:generation,consent:z.literal(true),quoteId:z.string().uuid().optional()}).strict().parse(intent));
  const parsed=z.object({provider:z.literal('dodo'),billingMode:mode,generation,requestId:z.string().uuid(),plan,sessionId:z.string().regex(/^cks_[A-Za-z0-9_-]{1,100}$/),url:z.string().max(4000),pricing:pricing.optional()}).strict().parse(await call(scope,original,stillCurrent));
  if(parsed.pricing)validateMoney(parsed.pricing);
  const legacyUsd=!original.quoteId&&!parsed.pricing&&scope.pricing?.quoteId===null&&scope.pricing?.currency==='USD'&&scope.pricing?.catalogVersion==='legacy-usd-v1'&&scope.pricing?.amountMinor===loopLocalPrice(original.plan,'USD');
  if(parsed.requestId!==original.requestId||parsed.plan!==original.plan||parsed.generation!==original.expectedGeneration||scope.billingMode!==undefined&&scope.billingMode!==parsed.billingMode||original.quoteId&&parsed.pricing?.quoteId!==original.quoteId||scope.pricing&&!legacyUsd&&!sameLoopPricing(scope.pricing,parsed.pricing)||!validLoopCheckoutUrl(parsed.url,parsed.billingMode))throw new LoopBillingError('The checkout receipt did not match your chosen plan and monthly price. Refresh billing before continuing.');
  return parsed;
}
export async function cancelLoopSubscription(scope:LoopBillingScope,intent:Readonly<LoopCancelIntent>,stillCurrent?:()=>boolean){
  const original=z.object({action:z.literal('cancel'),requestId:z.string().uuid(),expectedGeneration:generation,expectedSubscriptionId:z.string().regex(/^sub_[A-Za-z0-9_-]{1,100}$/),expectedVersion:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),consent:z.literal(true),contractVersion:z.literal(2)}).strict().parse(intent);
  const result=z.object({requestId:z.string().uuid(),generation,subscriptionId:z.string(),status:z.enum(['confirmed','uncertain']),subscription:subscription.nullable()}).strict().parse(await call(scope,original,stillCurrent));
  if(result.subscription?.pricing)validateMoney(result.subscription.pricing);
  if(result.requestId!==original.requestId||result.generation!==original.expectedGeneration||result.subscriptionId!==original.expectedSubscriptionId||result.subscription&&result.subscription.subscriptionId!==original.expectedSubscriptionId)throw new LoopBillingError('The cancellation receipt did not match your subscription. Refresh billing to confirm its current state.');
  return result;
}
