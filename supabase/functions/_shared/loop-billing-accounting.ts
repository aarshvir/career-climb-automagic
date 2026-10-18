import { ApiError, uuid } from './core.ts';
import { DODO_PAYMENT_ID } from './dodo.ts';
import { validateLoopPaidPeriod, validateLoopSubscription, type LoopBillingConfig, type LoopProviderAccountingAuthority } from './loop-billing.ts';
import type { LoopPriceSnapshot } from './loop-billing-pricing.ts';

const invalid=()=>new ApiError(409,'LOOP_BILLING_ACCOUNTING_UNVERIFIED','The provider accounting record does not match its verified payment.');
const absent=(value:unknown)=>value===null||value===undefined;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function positive(value:unknown):number{if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>1000000000)throw invalid();return value as number;}
export interface LoopAccountingAnchor {
  paymentId:string;subscriptionId:string;customerId:string;quoteId:string;currency:string;amountMinor:number;
  accountingCurrency:'USD';accountingAmountMinor:number;settlementCurrency:string|null;settlementAmountMinor:number|null;settlementTaxMinor:number|null;
  periodStart:string;validUntil:string;
}
export function currentLoopAccountingPeriod(source:unknown,payment:unknown):boolean {
  const raw=object(source),paid=object(payment);
  if(!Array.isArray(paid.service_periods)||paid.service_periods.length!==1)return false;
  const period=object(paid.service_periods[0]);
  return typeof raw.previous_billing_date==='string'&&typeof period.starts_at==='string'&&Number.isFinite(Date.parse(raw.previous_billing_date))&&Date.parse(raw.previous_billing_date)===Date.parse(period.starts_at)&&period.subscription_id===raw.subscription_id;
}
function settlement(value:Record<string,unknown>,fields:{currency:string;amount:string;tax:string}){
  const currency=value[fields.currency],rawAmount=value[fields.amount],rawTax=value[fields.tax];
  if(absent(currency)!==absent(rawAmount))throw invalid();
  if(absent(currency)){if(!absent(rawTax))throw invalid();return{settlementCurrency:null,settlementAmountMinor:null,settlementTaxMinor:null};}
  if(currency!=='USD')throw invalid();
  const amount=positive(rawAmount);
  if(!absent(rawTax)&&(!Number.isSafeInteger(rawTax)||(rawTax as number)<0||(rawTax as number)>amount))throw invalid();
  return{settlementCurrency:currency,settlementAmountMinor:amount,settlementTaxMinor:absent(rawTax)?null:rawTax as number};
}
/** API accounting can be USD while the actual customer charge is localized.
 * It is never a conversion formula or an entitlement amount. Its authority is a
 * separately verified succeeded payment in the exact original quote currency. */
export function proveLoopAccounting(source:unknown,payment:unknown,config:LoopBillingConfig,price:LoopPriceSnapshot):LoopAccountingAnchor {
  const raw=object(source),paid=object(payment);
  if(!price.quoteId||price.currency==='USD'||raw.currency!=='USD')throw invalid();
  const authority={currency:'USD' as const,amountMinor:positive(raw.recurring_pre_tax_amount)};
  const sub=validateLoopSubscription(raw,config,price,authority);
  const period=validateLoopPaidPeriod(paid,sub);
  if(!currentLoopAccountingPeriod(raw,paid))throw invalid();
  return{paymentId:period.paymentId,subscriptionId:sub.subscriptionId,customerId:sub.customerId,quoteId:price.quoteId,currency:price.currency,amountMinor:price.amountMinor,
    accountingCurrency:authority.currency,accountingAmountMinor:authority.amountMinor,...settlement(paid,{currency:'settlement_currency',amount:'settlement_amount',tax:'settlement_tax'}),periodStart:period.periodStart,validUntil:period.validUntil};
}
/** A matching previously recorded paid-cycle anchor is independent of today's
 * catalogue, FX rate, and mutable provider status snapshot. */
export function knownLoopAccounting(order:unknown,source:unknown,price:LoopPriceSnapshot):LoopProviderAccountingAuthority|undefined {
  const raw=object(source),stored=object(order).providerAccounting;
  if(absent(stored))return undefined;
  if(!Array.isArray(stored)||stored.length>1000)throw invalid();
  const customer=object(raw.customer);
  for(const value of stored){
    const anchor=object(value);
    if(anchor.accountingCurrency!==raw.currency||anchor.accountingAmountMinor!==raw.recurring_pre_tax_amount||anchor.subscriptionId!==raw.subscription_id||anchor.customerId!==customer.customer_id)continue;
    if(anchor.quoteId!==price.quoteId||anchor.currency!==price.currency||anchor.amountMinor!==price.amountMinor||anchor.accountingCurrency!=='USD'||typeof anchor.paymentId!=='string'||!DODO_PAYMENT_ID.test(anchor.paymentId))throw invalid();
    uuid(anchor.quoteId,'Price quote');settlement(anchor,{currency:'settlementCurrency',amount:'settlementAmountMinor',tax:'settlementTaxMinor'});
    return{currency:'USD',amountMinor:positive(anchor.accountingAmountMinor)};
  }
  return undefined;
}
/** A late positive payment may refer to an earlier, already anchored paid cycle
 * while the provider's current accounting snapshot has advanced. The existing
 * immutable anchor authenticates only that exact old payment and service period. */
export function knownLoopPaymentAccounting(order:unknown,source:unknown,payment:unknown,price:LoopPriceSnapshot):boolean {
  const stored=object(order).providerAccounting,raw=object(source),paid=object(payment);
  if(absent(stored))return false;
  if(!Array.isArray(stored)||stored.length>1000)throw invalid();
  const found=stored.map(object).find(value=>value.paymentId===paid.payment_id);
  if(!found)return false;
  const customer=object(raw.customer);
  if(found.quoteId!==price.quoteId||found.currency!==price.currency||found.amountMinor!==price.amountMinor||found.subscriptionId!==raw.subscription_id||found.customerId!==customer.customer_id||
    found.accountingCurrency!=='USD'||paid.status!=='succeeded'||paid.currency!==price.currency||paid.total_amount!==price.amountMinor||!Array.isArray(paid.service_periods)||paid.service_periods.length!==1)throw invalid();
  positive(found.accountingAmountMinor);
  const period=object(paid.service_periods[0]);
  if(period.subscription_id!==found.subscriptionId||typeof found.periodStart!=='string'||typeof found.validUntil!=='string'||
    Date.parse(String(period.starts_at))!==Date.parse(found.periodStart)||Date.parse(String(period.ends_at))!==Date.parse(found.validUntil))throw invalid();
  const previous=settlement(found,{currency:'settlementCurrency',amount:'settlementAmountMinor',tax:'settlementTaxMinor'}),current=settlement(paid,{currency:'settlement_currency',amount:'settlement_amount',tax:'settlement_tax'});
  if(previous.settlementCurrency!==current.settlementCurrency||previous.settlementAmountMinor!==current.settlementAmountMinor||previous.settlementTaxMinor!==current.settlementTaxMinor)throw invalid();
  return true;
}
export function accountingBindArgs(anchor:LoopAccountingAnchor){
  return{p_quote:anchor.quoteId,p_subscription:anchor.subscriptionId,p_customer:anchor.customerId,p_payment:anchor.paymentId,p_currency:anchor.currency,p_amount:anchor.amountMinor,
    p_settlement_currency:anchor.settlementCurrency,p_settlement_amount:anchor.settlementAmountMinor,p_settlement_tax:anchor.settlementTaxMinor,p_accounting_currency:anchor.accountingCurrency,p_accounting_amount:anchor.accountingAmountMinor,p_period_start:anchor.periodStart,p_valid_until:anchor.validUntil};
}
