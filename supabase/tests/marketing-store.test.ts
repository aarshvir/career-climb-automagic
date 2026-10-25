import { describe, expect, it } from 'vitest';
import { supabaseStore, type SupabaseLike } from '../functions/_shared/jobvance-marketing.ts';
function database(count: number) {
  const ranges: number[][] = [];
  const db = { from(table: string) {
    let from=0,to=Infinity;
    const chain={ select(){return chain;},order(){return chain;},eq(){return chain;},limit(n:number){to=n-1;return chain;},single(){return chain;},
      range(a:number,b:number){from=a;to=b;if(table.endsWith('_metrics'))ranges.push([a,b]);return chain;},
      then(resolve:(result:unknown)=>unknown){
        const data=table.endsWith('_metrics')?Array.from({length:Math.max(0,Math.min(count- from,to-from+1))},(_,i)=>({day:`row-${from+i}`})):table.endsWith('_settings')?{}:[];
        return Promise.resolve(resolve({data,error:null}));
      },
    };return chain;
  }} as unknown as SupabaseLike;
  return {store:supabaseStore(db,'owner'),ranges};
}
describe('complete bounded cache reads',()=>{
  it('reads beyond the platform default row limit without losing days',async()=>{
    const {store,ranges}=database(1201);const result=await store.rows();
    expect(result.metrics).toHaveLength(1201);expect(ranges).toEqual([[0,499],[500,999],[1000,1499]]);
  });
  it('refuses an overflow instead of returning partial fresh totals',async()=>{
    const {store}=database(5001);await expect(store.rows()).rejects.toMatchObject({code:'MARKETING_READ_INCOMPLETE'});
  });
});
