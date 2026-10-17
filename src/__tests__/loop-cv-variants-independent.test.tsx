import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopCvVariants from '@/pages/LoopCvVariants';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import type { LoopAction, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
const mocks=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('@/lib/job-loop-api',()=>({callJobLoop:mocks.call}));
const owner='11111111-1111-4111-a111-111111111111',id='33333333-3333-4333-a333-333333333333',hash='a'.repeat(64),date='2026-10-17T00:00:00Z';
const profile={audience:'professional',name:'Created Candidate',contactLine:'',targetTitles:['Analyst'],locations:['Dubai'],experienceYears:3,languages:['English'],pageTarget:1,discreetSearch:false,sourceText:'Created Employer\nPrepared weekly reports with the operations team.\nEducation\nCreated University business degree.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null}};
const snapshot={recordVersion:1,lifecycleGeneration:7,profile:{...profile,revision:1,updatedAt:date},claims:[],opportunities:[],inbox:[],runs:[],packets:[]} as unknown as LoopSnapshot;
function props(){const authority=trackingDraftAuthority(owner);return {snapshot:structuredClone(snapshot),owner,authority,ready:true,busy:false,hidden:false,captureGuard:()=>()=>trackingDraftAuthority(owner)===authority};}
function response(action:Extract<LoopAction,{action:'save_cv_variant'}>){return {variantSave:{variant:{id:action.variantId??id,generation:7,revision:action.expectedVariantRevision+1,label:action.label,profile:structuredClone(action.profile),claims:[],sourceHash:hash,createdAt:date,updatedAt:date},recordVersion:action.expectedVersion+1,requestId:action.requestId,requestHash:hash,sourceHash:hash,savedRevision:action.expectedVariantRevision+1,reused:false,generation:7}};}
async function draft(){fireEvent.click(screen.getByRole('button',{name:'Load saved CV variants'}));await screen.findByRole('button',{name:'Create a CV variant'});fireEvent.click(screen.getByRole('button',{name:'Create a CV variant'}));fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Operations'}});}
const permit=()=>fireEvent.click(screen.getByLabelText('Save this exact CV source and selected facts privately in my account.'));
beforeEach(()=>{clearTrackingDraftMemory();setTrackingDraftOwner(owner);setTrackingLoopGeneration(owner,7);mocks.call.mockReset();mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>action.action==='read_cv_variants'?{cvVariants:{generation:7,recordVersion:1,variants:[]}}:response(action as never));});
afterEach(()=>{cleanup();clearTrackingDraftMemory();});
describe('independent CV variant UI boundaries',()=>{
  it('rejects same-batch edit then submit under earlier private-save consent',async()=>{
    render(<LoopCvVariants {...props()}/>);await draft();permit();
    act(()=>{fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Changed after consent'}});fireEvent.submit(screen.getByRole('form',{name:'CV variant draft'}));});
    expect(mocks.call.mock.calls.filter(([,a])=>a.action==='save_cv_variant')).toHaveLength(0);expect(screen.getByRole('button',{name:'Save CV variant'})).toBeDisabled();
  });
  it('preserves newer wording when the earlier private save returns late',async()=>{
    let resolve!:(value:unknown)=>void;let submitted!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};submitted=action as typeof submitted;return new Promise(done=>{resolve=done;});});
    render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await waitFor(()=>expect(submitted).toBeDefined());
    fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Newer unsaved wording'}});
    await act(async()=>{resolve(response(submitted));});
    expect(screen.getByLabelText('CV variant name')).toHaveValue('Newer unsaved wording');expect(screen.getByLabelText('Save this exact CV source and selected facts privately in my account.')).not.toBeChecked();
  });
  it('retains the exact ambiguous request across route unmount and requires deliberate retry',async()=>{
    let original!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};original=action as typeof original;throw new Error('Response unavailable');});
    const first=render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await screen.findByText(/Response unavailable/);first.unmount();
    const before=mocks.call.mock.calls.length;render(<LoopCvVariants {...props()}/>);expect(mocks.call.mock.calls).toHaveLength(before);expect(screen.getByRole('button',{name:'Retry original CV save'})).toBeDisabled();
    mocks.call.mockImplementation(async(_owner:string,a:LoopAction)=>response(a as never));
    fireEvent.click(screen.getByLabelText('Retry this original private-save request. Keep any newer saved version and my newer draft edits.'));fireEvent.click(screen.getByRole('button',{name:'Retry original CV save'}));
    await waitFor(()=>expect(mocks.call.mock.calls).toHaveLength(before+1));expect(mocks.call.mock.calls.at(-1)?.[1]).toEqual(original);
  });
  it('does not display a late save from an earlier same-owner SDK session',async()=>{
    let resolve!:(value:unknown)=>void;let submitted!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};submitted=action as typeof submitted;return new Promise(done=>{resolve=done;});});
    const rendered=render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await waitFor(()=>expect(submitted).toBeDefined());
    setTrackingDraftOwner(owner,'44444444-4444-4444-a444-444444444444');setTrackingLoopGeneration(owner,7);rendered.rerender(<LoopCvVariants {...props()}/>);
    await act(async()=>{resolve(response(submitted));});expect(screen.queryByText(/Your CV variant is saved privately/)).not.toBeInTheDocument();expect(screen.queryByRole('form',{name:'CV variant draft'})).not.toBeInTheDocument();
  });
  it('keeps newer edits made before retrying an earlier ambiguous save',async()=>{
    let original!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};original=action as typeof original;throw new Error('Response unavailable');});
    render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await screen.findByText(/Response unavailable/);
    const first=structuredClone(original);fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Important newer draft'}});
    mocks.call.mockImplementation(async(_owner:string,a:LoopAction)=>response(a as never));
    fireEvent.click(screen.getByLabelText('Retry this original private-save request. Keep any newer saved version and my newer draft edits.'));fireEvent.click(screen.getByRole('button',{name:'Retry original CV save'}));
    await waitFor(()=>expect(screen.queryByRole('region',{name:'Unconfirmed CV save'})).not.toBeInTheDocument());
    expect(mocks.call.mock.calls.at(-1)?.[1]).toEqual(first);expect(screen.getByLabelText('CV variant name')).toHaveValue('Important newer draft');
  });
  it('requires fresh list inspection and revision review to escape an unsuccessful original request without losing edits',async()=>{
    let version=1;let first!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:version,variants:[]}};first=action as typeof first;throw new Error('Your record changed');});
    render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await screen.findByText(/Your record changed/);
    fireEvent.click(screen.getByText('Review a different save instead'));const stop=screen.getByLabelText('I inspected the refreshed saved list. Stop retrying this original request so I can review a different save.');expect(stop).toBeDisabled();
    version=2;fireEvent.click(screen.getByRole('button',{name:'Refresh saved CV variants'}));await waitFor(()=>expect(stop).not.toBeDisabled());fireEvent.click(stop);fireEvent.click(screen.getByRole('button',{name:'Keep edits and stop retrying'}));
    expect(screen.getByLabelText('CV variant name')).toHaveValue('Operations');expect(screen.getByRole('button',{name:'Save CV variant'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Use current saved revision for these edits'}));expect(screen.getByLabelText('Save this exact CV source and selected facts privately in my account.')).not.toBeChecked();
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>response(action as never));permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));
    await waitFor(()=>expect(mocks.call.mock.calls.filter(([,a])=>a.action==='save_cv_variant')).toHaveLength(2));const second=mocks.call.mock.calls.at(-1)?.[1];expect(second.expectedVersion).toBe(2);expect(second.requestId).not.toBe(first.requestId);expect(second.label).toBe('Operations');
  });
  it('requires explicit continuation before newer edits can update the newly confirmed variant',async()=>{
    let resolve!:(value:unknown)=>void;let first!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};first=action as typeof first;return new Promise(done=>{resolve=done;});});
    render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await waitFor(()=>expect(first).toBeDefined());fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Later wording'}});await act(async()=>{resolve(response(first));});
    expect(screen.getByRole('button',{name:'Save CV variant'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Continue edits to Operations'}));expect(screen.getByLabelText('CV variant name')).toHaveValue('Later wording');
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>response(action as never));permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));
    await waitFor(()=>expect(mocks.call.mock.calls.filter(([,a])=>a.action==='save_cv_variant')).toHaveLength(2));const second=mocks.call.mock.calls.at(-1)?.[1];expect(second).toMatchObject({variantId:id,expectedVersion:2,expectedVariantRevision:1,label:'Later wording'});
  });
  it('recovers retained edits when mounted authority becomes ready after initial render',async()=>{
    const first=render(<LoopCvVariants {...props()}/>);await draft();fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Preserved during bootstrap'}});first.unmount();
    const at=props(),second=render(<LoopCvVariants {...at} ready={false}/>);expect(screen.queryByRole('form',{name:'CV variant draft'})).not.toBeInTheDocument();
    second.rerender(<LoopCvVariants {...at} ready/>);expect(await screen.findByLabelText('CV variant name')).toHaveValue('Preserved during bootstrap');expect(screen.getByLabelText('Save this exact CV source and selected facts privately in my account.')).not.toBeChecked();
  });
  it('preserves the confirmed earlier save association across remount while newer create-draft edits await explicit continuation',async()=>{
    let original!:Extract<LoopAction,{action:'save_cv_variant'}>;
    mocks.call.mockImplementation(async(_owner:string,action:LoopAction)=>{if(action.action==='read_cv_variants')return {cvVariants:{generation:7,recordVersion:1,variants:[]}};original=action as typeof original;throw new Error('Response unavailable');});
    const first=render(<LoopCvVariants {...props()}/>);await draft();permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));await screen.findByText(/Response unavailable/);
    fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Newer edits for the saved variant'}});const submitted=structuredClone(original);
    mocks.call.mockImplementation(async(_owner:string,a:LoopAction)=>response(a as never));fireEvent.click(screen.getByLabelText('Retry this original private-save request. Keep any newer saved version and my newer draft edits.'));fireEvent.click(screen.getByRole('button',{name:'Retry original CV save'}));await screen.findByRole('button',{name:'Continue edits to Operations'});
    fireEvent.change(screen.getByLabelText('CV variant name'),{target:{value:'Even newer edits after confirmation'}});first.unmount();
    render(<LoopCvVariants {...props()}/>);expect(screen.getByLabelText('CV variant name')).toHaveValue('Even newer edits after confirmation');
    // A recovered original request can establish the exact saved ID again.
    // The newer draft must not be reintroduced as an unrelated fresh create.
    expect(screen.getByRole('button',{name:'Retry original CV save'})).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Retry this original private-save request. Keep any newer saved version and my newer draft edits.'));fireEvent.click(screen.getByRole('button',{name:'Retry original CV save'}));await screen.findByRole('button',{name:'Continue edits to Operations'});expect(mocks.call.mock.calls.at(-1)?.[1]).toEqual(submitted);
    fireEvent.click(screen.getByRole('button',{name:'Continue edits to Operations'}));permit();fireEvent.click(screen.getByRole('button',{name:'Save CV variant'}));
    await waitFor(()=>expect(mocks.call.mock.calls.at(-1)?.[1]).toMatchObject({action:'save_cv_variant',variantId:id,expectedVariantRevision:1,label:'Even newer edits after confirmation'}));
  });
});
