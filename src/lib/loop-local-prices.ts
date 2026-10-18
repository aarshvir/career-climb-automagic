import {LOOP_LOCAL_COUNTRIES,LOOP_LOCAL_CURRENCIES,isLoopLocalCountry,isLoopLocalCurrency,type LoopLocalCountry,type LoopLocalCurrency} from '../../supabase/functions/_shared/loop-local-prices';
import {isLoopSubscriptionPlan,type LoopSubscriptionPlan} from './subscription-plans';
import {loopLocaleRegion} from './loop-price-display';
export {LOOP_LOCAL_PRICE_CATALOG_VERSION,LOOP_LOCAL_COUNTRIES,LOOP_LOCAL_CURRENCIES,isLoopLocalCountry,isLoopLocalCurrency,loopLocalPrice} from '../../supabase/functions/_shared/loop-local-prices';
export type {LoopLocalCountry,LoopLocalCurrency} from '../../supabase/functions/_shared/loop-local-prices';
export interface LoopPriceMarket {country:LoopLocalCountry|'other';currency:LoopLocalCurrency}
export function initialLoopPriceMarket(search:string,locale?:string):LoopPriceMarket {
  const params=new URLSearchParams(search);
  const explicitCountry=params.get('country'),explicitCurrency=params.get('currency');
  const hint=loopLocaleRegion(locale);
  const country=explicitCountry==='other'?'other':isLoopLocalCountry(explicitCountry)?explicitCountry:isLoopLocalCountry(hint)?hint:hint?'other':'US';
  return {country,currency:country==='other'?'USD':isLoopLocalCurrency(explicitCurrency)?explicitCurrency:LOOP_LOCAL_COUNTRIES[country].currency};
}
export type LocalizedLoopPricingReturn=`/pricing?loopPlan=${LoopSubscriptionPlan}&country=${LoopLocalCountry|'other'}&currency=${LoopLocalCurrency}`;
export function loopPricingReturn(plan:LoopSubscriptionPlan,market:LoopPriceMarket):LocalizedLoopPricingReturn {
  if(!isLoopSubscriptionPlan(plan)||!(isLoopLocalCountry(market.country)||market.country==='other'&&market.currency==='USD')||!isLoopLocalCurrency(market.currency))throw new Error('Choose a listed monthly price.');
  return `/pricing?loopPlan=${plan}&country=${market.country}&currency=${market.currency}`;
}
export function isLocalizedLoopPricingReturn(value:unknown):value is LocalizedLoopPricingReturn {
  if(typeof value!=='string'||value.length>120||!value.startsWith('/pricing?'))return false;
  const query=new URLSearchParams(value.slice('/pricing?'.length));
  const plan=query.get('loopPlan'),country=query.get('country'),currency=query.get('currency');
  return isLoopSubscriptionPlan(plan)&&(isLoopLocalCountry(country)||country==='other'&&currency==='USD')&&isLoopLocalCurrency(currency)&&value===loopPricingReturn(plan,{country,currency});
}
