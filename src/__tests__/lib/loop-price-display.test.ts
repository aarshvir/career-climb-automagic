import {describe,expect,it} from 'vitest';
import {formatLoopPrice,loopCountryName,loopLocaleCountry} from '@/lib/loop-price-display';
describe('server-priced currency presentation',()=>{
 it('formats quoted minor units without converting their value',()=>{expect(formatLoopPrice({currency:'USD',amountMinor:2999,exponent:2},'en-US')).toBe('$29.99');expect(formatLoopPrice({currency:'INR',amountMinor:289900,exponent:2},'en-IN')).toBe('₹2,899');expect(formatLoopPrice({currency:'JPY',amountMinor:2900,exponent:0},'ja-JP')).toBe('￥2,900');expect(formatLoopPrice({currency:'KWD',amountMinor:9900,exponent:3},'en-US')).toBe('KWD 9.900');});
 it('uses an explicit locale region only as an allowed suggestion',()=>{expect(loopLocaleCountry('en-IN',['US','IN'])).toBe('IN');expect(loopLocaleCountry('zh-Hant-SG',['US','SG'])).toBe('SG');expect(loopLocaleCountry('en',['US','IN'])).toBeNull();expect(loopLocaleCountry('en-ZZ',['US','IN'])).toBeNull();expect(loopLocaleCountry(undefined,['US'])).toBeNull();});
 it('does not accept malformed money or silently assume two decimal places',()=>{for(const price of[{currency:'usd',amountMinor:29,exponent:2},{currency:'INR',amountMinor:NaN,exponent:2},{currency:'USD',amountMinor:2999.5,exponent:2},{currency:'JPY',amountMinor:2900,exponent:4}])expect(()=>formatLoopPrice(price)).toThrow();});
 it('has a readable fallback without trusting locale as financial authority',()=>{expect(formatLoopPrice({currency:'USD',amountMinor:2900,exponent:2},'invalid_locale')).toBe('$29');expect(loopCountryName('IN')).toBe('India');});
});
