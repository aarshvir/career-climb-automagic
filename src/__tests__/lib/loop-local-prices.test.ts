import {describe,expect,it} from 'vitest';
import {initialLoopPriceMarket,isLocalizedLoopPricingReturn,loopPricingReturn,LOOP_LOCAL_CURRENCIES} from '@/lib/loop-local-prices';
import {accountDestination,rememberLoopReturn,takeLoopReturn} from '@/lib/account-return';
describe('localized price preferences and sign-in return',()=>{
 it('suggests known locale markets and uses an honest Other USD fallback',()=>{
  expect(initialLoopPriceMarket('','en-IN')).toEqual({country:'IN',currency:'INR'});
  expect(initialLoopPriceMarket('','de-DE')).toEqual({country:'DE',currency:'EUR'});
  expect(initialLoopPriceMarket('','en-NZ')).toEqual({country:'other',currency:'USD'});
  expect(initialLoopPriceMarket('','en-u-ca-gregory')).toEqual({country:'US',currency:'USD'});
 });
 it('keeps an explicit currency override and never assigns a false country to Other',()=>{
  expect(initialLoopPriceMarket('country=IN&currency=EUR','en-US')).toEqual({country:'IN',currency:'EUR'});
  expect(initialLoopPriceMarket('country=other&currency=INR','en-IN')).toEqual({country:'other',currency:'USD'});
  expect(Object.keys(LOOP_LOCAL_CURRENCIES)).toHaveLength(9);
 });
 it('preserves only supported plan/country/currency preferences through account sign-in',()=>{
  const path=loopPricingReturn('active',{country:'IN',currency:'INR'});
  expect(accountDestination(path)).toBe(path);rememberLoopReturn(path);expect(takeLoopReturn()).toBe(path);
  expect(isLocalizedLoopPricingReturn('/pricing?loopPlan=weekly&country=other&currency=USD')).toBe(true);
  for(const path of ['/pricing?loopPlan=weekly&country=other&currency=INR','/pricing?loopPlan=weekly&country=NZ&currency=USD','/pricing?loopPlan=weekly&country=IN&currency=INR&consent=true','/pricing?loopPlan=weekly&country=IN&currency=INR#https://evil.test','/pricing?loopPlan=weekly&country=IN&currency=INR&country=US'])expect(accountDestination(path)).toBe('/loop');
 });
});
