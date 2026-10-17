// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readEmployerFeed, employerFeeds, EMPLOYER_FEED_LIMITS, UncertainProviderCall } from '../functions/_shared/job-loop-providers.ts';
import { reconcileDiscovery } from '../functions/_shared/job-loop-discovery.ts';
import { inspectDiscoveryTarget, explainDiscoveryMatch } from '../../src/lib/employer-discovery.ts';
import type { LoopOpportunity, LoopProfileInput } from '../functions/_shared/job-loop-types.ts';

const profile: LoopProfileInput = { audience:'professional', name:'Created candidate', contactLine:'', targetTitles:['Software Developer'],locations:['US'],experienceYears:4,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Created test experience only. Implemented software and reviewed product changes with a team.',excludedTerms:[],compensation:{currency:'USD',period:'annual',minimum:80000} };
const description = 'Software development and product collaboration. At least 3 years of experience required. Base salary USD 90,000–120,000 per year.';
const job = (patch: Partial<LoopOpportunity> = {}): LoopOpportunity => ({id:'job-1',sourceKey:'greenhouse:created:1',source:'employer_api',checkedAt:'2026-10-17T10:00:00Z',verification:'listed_on_source',title:'Software Engineer',company:'Created company',location:'San Francisco, California',url:'https://careers.example.com/jobs/1',description,contact:null,status:'saved',notes:'',followUpAt:null,...patch});
const json = (data:unknown) => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
const ashbyRow = (patch:Record<string,unknown>={}) => ({ title:'Software Engineer',isListed:true,location:'San Francisco, California',address:{postalAddress:{addressCountry:'USA'}},jobUrl:'https://jobs.ashbyhq.com/created/one',descriptionPlain:description,...patch });
const greenhouseRow = (id:number,title='Software Engineer') => ({id,title,absolute_url:`https://careers.example.com/jobs/${id}`,content:description,location:{name:'San Francisco, California'}});

describe('bounded published discovery', () => {
  it('supports the documented Ashby listed-only contract and rejects hidden postings', async () => {
    const fetcher=vi.fn(async()=>json({jobs:[ashbyRow(),ashbyRow({jobUrl:'https://jobs.ashbyhq.com/created/hidden',isListed:false}),ashbyRow({isListed:undefined,jobUrl:'https://jobs.ashbyhq.com/created/unknown'})]}));
    const result=await readEmployerFeed({provider:'ashby',board:'created',company:'Created'},fetcher,profile);
    expect(result.opportunities).toHaveLength(1);expect(result.opportunities[0]).toMatchObject({verification:'listed_on_source',company:'Created',location:'San Francisco, California, USA'});
    expect(fetcher.mock.calls[0][0]).toBe('https://api.ashbyhq.com/posting-api/job-board/created');
    expect(result.truncated).toBe(false);
  });
  it('examines later matches before applying the retention cap instead of taking the first 100 titles', async () => {
    const result=await readEmployerFeed({provider:'greenhouse',board:'created'},async()=>json({jobs:[...Array.from({length:110},(_,i)=>greenhouseRow(i,'Accountant')),greenhouseRow(111)]}),profile);
    expect(result.opportunities.map(item=>item.url)).toEqual(['https://careers.example.com/jobs/111']);expect(result.total).toBe(111);expect(result.truncated).toBe(false);
  });
  it('does not treat Ashby hybrid or onsite roles as remote when the legacy isRemote flag is true',async()=>{
    const fetcher=vi.fn(async()=>json({jobs:[ashbyRow({workplaceType:'Hybrid',isRemote:true}),ashbyRow({workplaceType:'OnSite',isRemote:true,jobUrl:'https://jobs.ashbyhq.com/created/two'})]}));
    const all=await readEmployerFeed({provider:'ashby',board:'created'},fetcher,profile);expect(all.opportunities[0].location).toContain('Hybrid');expect(all.opportunities.every(item=>!item.location.includes('Remote'))).toBe(true);
    const remote=await readEmployerFeed({provider:'ashby',board:'created'},fetcher,{...profile,locations:['Remote']});expect(remote.opportunities).toEqual([]);
  });
  it('reports retained-result overflow while keeping a bounded set',async()=>{
    const result=await readEmployerFeed({provider:'greenhouse',board:'created'},async()=>json({jobs:Array.from({length:110},(_,i)=>greenhouseRow(i))}),profile);
    expect(result.opportunities).toHaveLength(100);expect(result.truncated).toBe(true);
  });
  it('paginates Lever up to three source pages and reports an unknown remainder',async()=>{
    const fetcher=vi.fn(async(input:Request|string|URL)=>{const offset=Number(new URL(String(input)).searchParams.get('skip')??0);return json(Array.from({length:100},(_,i)=>({id:offset+i,text:'Software Engineer',hostedUrl:`https://jobs.lever.co/created/${offset+i}`,descriptionPlain:description,categories:{location:'New York, US'}})));});
    const result=await readEmployerFeed({provider:'lever',board:'created'},fetcher,profile);
    expect(fetcher).toHaveBeenCalledTimes(3);expect(String(fetcher.mock.calls[2][0])).toContain('skip=200');expect(result.total).toBe(300);expect(result.truncated).toBe(true);
  });
  it('fails the source as unavailable if a later page fails instead of representing a complete read',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(json(Array.from({length:100},(_,id)=>({id})))).mockResolvedValueOnce(new Response('',{status:503}));
    await expect(readEmployerFeed({provider:'lever',board:'created'},fetcher)).rejects.toThrow(/could not be read/);
  });
  it('bounds total raw response bytes including whitespace across pages',async()=>{
    const content=JSON.stringify(Array.from({length:100},(_,id)=>({id})))+' '.repeat(2600000);
    const fetcher=vi.fn(async()=>new Response(content));
    await expect(readEmployerFeed({provider:'lever',board:'created'},fetcher)).rejects.toBeInstanceOf(UncertainProviderCall);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps exact board allowlists, rejects unknown providers and deduplicates configured boards',async()=>{
    const feeds=employerFeeds(()=>JSON.stringify([{provider:'ashby',board:'created'},{provider:'ashby',board:'created'},{provider:'ashby',board:'../private'},{provider:'unknown',board:'created'}]));
    expect(feeds).toEqual([{provider:'ashby',board:'created',company:''}]);
    expect(employerFeeds(()=>undefined)).toHaveLength(6);
    const fetcher=vi.fn();await expect(readEmployerFeed({provider:'unknown' as 'ashby',board:'created'},fetcher)).rejects.toThrow(/Invalid employer/);expect(fetcher).not.toHaveBeenCalled();
    await expect(readEmployerFeed({provider:'ashby',board:'created'},async()=>new Response(' '.repeat(EMPLOYER_FEED_LIMITS.bytes+1)))).rejects.toBeInstanceOf(UncertainProviderCall);
  });
});

describe('fresh discovery reconciliation without erasing history',()=>{
  it('deduplicates an exact URL across providers and never merges same-title different jobs',()=>{
    const result=reconcileDiscovery(profile,[],[job(),job({id:'search',sourceKey:'url:alias',source:'web_search',url:job().url+'?utm_source=search'}),job({id:'job-2',sourceKey:'greenhouse:created:2',url:'https://careers.example.com/jobs/2'})]);
    expect(result.preparation.map(item=>item.id)).toEqual(['job-1','job-2']);expect(result.duplicates).toBe(1);expect(result.opportunities).toHaveLength(2);
  });
  it('preserves manually reviewed descriptions and their explicit history when the source also discovers that URL',()=>{
    const manual=job({source:'manual',sourceKey:'manual:one',verification:'user_provided',description:'My deliberately reviewed source.',notes:'My notes',status:'applied'});
    const result=reconcileDiscovery(profile,[manual],[job()]);expect(result.opportunities).toEqual([manual]);expect(result.updates).toEqual([]);expect(result.preparation).toEqual([]);
  });
  it('updates source facts by URL while retaining original id/key, application stage, notes and reminders',()=>{
    const old=job({id:'old-id',source:'web_search',sourceKey:'url:original',status:'interview',notes:'Bring portfolio',followUpAt:'2026-10-20T00:00:00Z'});
    const result=reconcileDiscovery(profile,[old],[job({description:description+' New detail.'})]);
    expect(result.opportunities).toHaveLength(1);expect(result.updates[0]).toMatchObject({id:'old-id',sourceKey:'url:original',source:'employer_api',status:'interview',notes:'Bring portfolio',followUpAt:old.followUpAt});expect(result.preparation).toEqual([]);
  });
  it('does not infer expiry from failed, capped, removed or unconfigured sources',()=>{
    const original=job({status:'prepared',notes:'Keep this history'});const result=reconcileDiscovery(profile,[original],[]);
    expect(result.updates[0]).toEqual({...original,verification:'unverified'});expect(result.preparation).toEqual([]);expect(result.stale).toBe(1);expect(original.verification).toBe('listed_on_source');
  });
  it('recovers an uncertain vacancy when its exact listing is observed again',()=>{
    const result=reconcileDiscovery(profile,[job({verification:'unverified',status:'prepared'})],[job()]);expect(result.preparation).toHaveLength(1);expect(result.preparation[0]).toMatchObject({status:'prepared',verification:'listed_on_source'});
  });
  it('does not repeatedly spend on unrefreshed saved web-search snippets',()=>{
    const result=reconcileDiscovery(profile,[job({source:'web_search',verification:'unverified'})],[]);expect(result.preparation).toEqual([]);expect(result.updates).toEqual([]);
  });
  it('preserves all existing rows at capacity and reports unsaved matches',()=>{
    const known=Array.from({length:100},(_,i)=>job({id:`old-${i}`,sourceKey:`old:${i}`,url:`https://careers.example.com/old/${i}`,status:'applied'}));const result=reconcileDiscovery(profile,known,[job()]);expect(result.opportunities).toEqual(known);expect(result.deferred).toBe(1);expect(result.updates).toEqual([]);
  });
  it('refreshes a source conflict but does not prepare it',()=>{
    const result=reconcileDiscovery(profile,[job()],[job({title:'Accountant'})]);expect(result.updates[0].title).toBe('Accountant');expect(result.preparation).toEqual([]);
  });
  it('does not duplicate preparation of already duplicated exact URL history',()=>{
    const result=reconcileDiscovery(profile,[job(),job({id:'legacy-duplicate',sourceKey:'legacy:duplicate'})],[job()]);expect(result.opportunities).toHaveLength(2);expect(result.preparation).toHaveLength(1);
  });
});

describe('honest matching explanations across supported target markets',()=>{
  it.each([['US','Seattle'],['US','Pittsburgh, PA'],['India','Bangalore'],['India','Hyderabad'],['UK','Leeds'],['UAE','Sharjah'],['Saudi Arabia','Riyadh'],['Qatar','Doha'],['Bahrain','Manama'],['Oman','Muscat']])('recognises %s country preference for %s without inventing work authorisation',(target,location)=>{
    expect(inspectDiscoveryTarget({...profile,locations:[target]},job({location})).location).toBe('matched');
  });
  it('does not override an explicit contradictory country for an ambiguous city',()=>{
    expect(inspectDiscoveryTarget(profile,job({location:'London, Canada'})).location).toBe('mismatch');
    expect(inspectDiscoveryTarget({...profile,locations:['UK']},job({location:'London, Canada'})).location).toBe('mismatch');
    expect(inspectDiscoveryTarget({...profile,locations:['India']},job({location:'Hyderabad, Pakistan'})).location).toBe('mismatch');
  });
  it.each([['Software Developer','Software Engineer'],['ML Engineer','Machine Learning Engineer'],['HR Manager','Human Resources Manager'],['QA Engineer','Quality Assurance Engineer']])('recognises %s as %s while retaining the complete role direction',(target,title)=>{
    expect(inspectDiscoveryTarget({...profile,targetTitles:[target]},job({title})).role).toBe('matched');
  });
  it('does not confuse a different role or technical specialism',()=>{
    expect(inspectDiscoveryTarget({...profile,targetTitles:['QA Engineer']},job({title:'Software Engineer'})).role).toBe('mismatch');
    expect(inspectDiscoveryTarget({...profile,targetTitles:['Backend Developer']},job({title:'Frontend Developer'})).role).toBe('mismatch');
    expect(inspectDiscoveryTarget({...profile,targetTitles:['Product Manager']},job({title:'Engineering Manager, Product'})).role).toBe('mismatch');
    expect(inspectDiscoveryTarget({...profile,targetTitles:['Product Manager']},job({title:'Product Operations Manager'})).role).toBe('mismatch');
  });
  it('matches excluded terms at boundaries without excluding unrelated words',()=>{
    expect(inspectDiscoveryTarget({...profile,excludedTerms:['AI']},job({company:'Retail company'})).excluded).toBe(false);
    expect(inspectDiscoveryTarget({...profile,excludedTerms:['AI']},job({company:'AI company'})).excluded).toBe(true);
    expect(inspectDiscoveryTarget({...profile,excludedTerms:['C++']},job({description:description+' C++ is required.'})).excluded).toBe(true);
    expect(inspectDiscoveryTarget({...profile,excludedTerms:['example']},job()).excluded).toBe(true);
  });
  it('shows observed reasons and explicit missing evidence without a fabricated fit percentage',()=>{
    const explained=explainDiscoveryMatch(profile,job());expect(explained.reasons).toHaveLength(4);expect(explained.missing).toContain('Review role-specific requirements and work authorisation before applying.');
    const unknown=explainDiscoveryMatch({...profile,experienceYears:null},job({description:'Work with the product team to build software. No salary or mandatory experience stated.'}));expect(unknown.missing).toContain('Experience requirements have not been fully verified.');expect(unknown.missing).toContain('Comparable base pay is not stated clearly enough to check your minimum.');expect(JSON.stringify(unknown)).not.toContain('%');
  });
});
