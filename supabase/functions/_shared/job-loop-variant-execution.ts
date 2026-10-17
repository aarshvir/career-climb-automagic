import type { LoopCvSelection } from './job-loop-types.ts';
/** Exact immutable source and fact references; these are selectors, never client-supplied evidence. */
export function validateCvSelection(value: unknown): LoopCvSelection {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose an exact saved CV.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='factRefs,sourceHash,variantId,variantRevision'||typeof v.variantId!=='string'||!uuid.test(v.variantId)||!Number.isSafeInteger(v.variantRevision)||(v.variantRevision as number)<1||typeof v.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceHash)||!Array.isArray(v.factRefs)||v.factRefs.length>150)throw new Error('Choose an exact saved CV revision and facts.');
  const seen=new Set<string>();
  const factRefs=v.factRefs.map((value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid CV fact.');const f=value as Record<string,unknown>;if(Object.keys(f).sort().join(',')!=='id,revision'||typeof f.id!=='string'||!uuid.test(f.id)||seen.has(f.id)||!Number.isSafeInteger(f.revision)||(f.revision as number)<1)throw new Error('Choose distinct exact CV facts.');seen.add(f.id);return {id:f.id,revision:f.revision as number};});
  return {variantId:v.variantId,variantRevision:v.variantRevision as number,sourceHash:v.sourceHash,factRefs};
}
export function sameCvSelection(a: LoopCvSelection|undefined,b: LoopCvSelection|undefined):boolean{
  if(!a||!b)return !a&&!b;
  try{return JSON.stringify(validateCvSelection(a))===JSON.stringify(validateCvSelection(b));}catch{return false;}
}
