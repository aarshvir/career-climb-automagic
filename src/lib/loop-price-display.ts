/** Presentation only: no exchange-rate calculation or payable-price authority. */
export function formatLoopPrice(price: unknown, locale?:string):string {
  if(!price||typeof price!=='object'||Array.isArray(price))throw new Error('The quoted price could not be displayed.');
  const {currency,amountMinor,exponent}=price as Record<string,unknown>;
  if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||typeof amountMinor!=='number'||!Number.isSafeInteger(amountMinor)||amountMinor<0||typeof exponent!=='number'||!Number.isInteger(exponent)||exponent<0||exponent>3)throw new Error('The quoted price could not be displayed.');
  const factor=10**exponent, fraction=amountMinor%factor===0?0:exponent;
  const options:Intl.NumberFormatOptions={style:'currency',currency,minimumFractionDigits:fraction,maximumFractionDigits:exponent};
  try{return new Intl.NumberFormat(locale,options).format(amountMinor/factor);}
  catch{return new Intl.NumberFormat('en-US',options).format(amountMinor/factor);}
}
/** An explicit locale region can suggest a preference, never prove residence. */
export function loopLocaleCountry(locale:string|undefined,allowed:readonly string[]):string|null {
  const region=loopLocaleRegion(locale);
  return region&&allowed.includes(region)?region:null;
}
export function loopLocaleRegion(locale:string|undefined):string|null {
  if(typeof locale!=='string'||locale.length>100)return null;
  const region=locale.replace(/_/g,'-').match(/^[A-Za-z]{2,8}(?:-[A-Za-z]{4})?-([A-Za-z]{2})(?:-|$)/)?.[1]?.toUpperCase();
  return region??null;
}
export function loopCountryName(code:string,locale='en'):string {
  const DisplayNames=(Intl as unknown as {DisplayNames?:new(locales:string[],options:{type:'region'})=>{of(value:string):string|undefined}}).DisplayNames;
  try{return DisplayNames?new DisplayNames([locale],{type:'region'}).of(code)??code:code;}catch{return code;}
}
