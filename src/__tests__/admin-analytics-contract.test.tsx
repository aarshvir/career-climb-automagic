import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAnalytics, adminPerson, adminVisit, adVisitId, caseyId } from './fixtures/admin-analytics';

vi.unmock('react-router-dom');
const sdk=vi.hoisted(()=>({session:vi.fn(),getUser:vi.fn(),invoke:vi.fn(),listeners:new Set<(event:string,session:unknown)=>void>()}));
vi.mock('@/utils/authSession',()=>({readAuthSession:sdk.session}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:sdk.getUser,onAuthStateChange:(listener:(event:string,session:unknown)=>void)=>{
  sdk.listeners.add(listener);return{data:{subscription:{unsubscribe:()=>sdk.listeners.delete(listener)}}};
}},functions:{invoke:sdk.invoke}}}));

import { callAdmin } from '@/lib/admin-api';
import { analyticsSchema, contactsSchema, personSchema, sessionSchema } from '@/lib/admin-analytics';
import { AcquisitionSection, JourneysSection, VisitDetail } from '@/pages/admin/home/analytics-sections';

const session=(owner='owner-a',realm='00000000-0000-4000-8000-000000000001')=>({user:{id:owner},access_token:`header.${btoa(JSON.stringify({sub:owner,session_id:realm}))}.signature`});
const reply=(data:unknown)=>sdk.invoke.mockResolvedValue({data,error:null});
const mount=(child:React.ReactNode)=>render(<MemoryRouter>{child}</MemoryRouter>);
const covered=()=>({...adminAnalytics(),coverage:{startedAt:'2026-10-26T05:00:00.000Z',status:'partial' as const}});
const empty=()=>({...covered(),totals:{visitors:0,sessions:0,pageViews:0,avgSeconds:0,signedIn:0,newAccounts:0,today:0},previous:{visitors:0,sessions:0,pageViews:0},sessions:[]});

beforeEach(()=>{
  vi.clearAllMocks();sdk.listeners.clear();
  sdk.session.mockResolvedValue(session());sdk.getUser.mockResolvedValue({data:{user:{id:'owner-a'}},error:null});
  reply({analytics:covered()});
});
afterEach(()=>cleanup());

describe('exact analytics admin contracts',()=>{
  it('retains optional collection coverage and supported nullable SQL fields',()=>{
    const result=analyticsSchema.parse(covered());expect(result.coverage.status).toBe('partial');
    expect(analyticsSchema.parse(adminAnalytics()).coverage).toBeUndefined();
    const visit={...adminVisit(),person:null,userId:caseyId,country:null};
    expect(sessionSchema.parse(visit)).toMatchObject({userId:caseyId,person:null,country:null});
    expect(personSchema.parse(adminPerson()).userId).toBe(caseyId);
  });

  it('rejects mixed person attribution without rejecting a retained owner whose contact record is gone',async()=>{
    const mixed=adminVisit();mixed.person.userId='00000000-0000-4000-8000-000000000099';
    expect(sessionSchema.safeParse(mixed).success).toBe(false);
    reply({visit:mixed});await expect(callAdmin('owner-a',{action:'visit',id:adVisitId})).rejects.toMatchObject({kind:'unavailable'});
    reply({visit:{...adminVisit(),person:null}});
    expect((await callAdmin('owner-a',{action:'visit',id:adVisitId})).visit).toMatchObject({userId:caseyId,person:null});
  });

  it('rejects a person attached to an anonymous visit and duration attached to a click',()=>{
    expect(sessionSchema.safeParse({...adminVisit(),userId:null}).success).toBe(false);
    const visit=adminVisit();visit.events[1]={...visit.events[1],seconds:40};
    expect(sessionSchema.safeParse(visit).success).toBe(false);
  });

  it('rejects incorrect date, count, extra fields and duplicate identities',()=>{
    const badTime=covered();badTime.coverage.startedAt='not a timestamp';expect(analyticsSchema.safeParse(badTime).success).toBe(false);
    const badCount=covered();badCount.sessions[0].seconds=-1;expect(analyticsSchema.safeParse(badCount).success).toBe(false);
    expect(analyticsSchema.safeParse({...covered(),privateDebug:'unexpected'}).success).toBe(false);
    const badRow=covered();badRow.sessions[0]={...badRow.sessions[0],extra:true} as typeof badRow.sessions[number];
    expect(analyticsSchema.safeParse(badRow).success).toBe(false);
    const duplicate=covered();duplicate.sessions.push({...duplicate.sessions[0]});expect(analyticsSchema.safeParse(duplicate).success).toBe(false);
    const contact={userId:caseyId,name:null,phone:null,visits:0,lastVisitAt:null,channel:null};
    expect(contactsSchema.safeParse([contact,contact]).success).toBe(false);
  });

  it('rejects incorrect visit, person and range receipts through the actual browser API',async()=>{
    reply({visit:adminVisit()});await expect(callAdmin('owner-a',{action:'visit',id:'00000000-0000-4000-8000-000000000099'})).rejects.toMatchObject({kind:'unavailable'});
    reply({person:adminPerson()});await expect(callAdmin('owner-a',{action:'person',id:'00000000-0000-4000-8000-000000000099'})).rejects.toMatchObject({kind:'unavailable'});
    reply({analytics:adminAnalytics(7)});await expect(callAdmin('owner-a',{action:'analytics',days:30})).rejects.toMatchObject({kind:'unavailable'});
  });

  it('discards delayed analytics across an SDK A to B to A transition',async()=>{
    let finish:(value:unknown)=>void;sdk.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=callAdmin('owner-a',{action:'analytics',days:30});
    await vi.waitFor(()=>expect(sdk.invoke).toHaveBeenCalledOnce());
    sdk.listeners.forEach(listener=>listener('SIGNED_IN',session('owner-b','00000000-0000-4000-8000-000000000002')));
    sdk.listeners.forEach(listener=>listener('SIGNED_IN',session()));
    finish({data:{analytics:covered()},error:null});
    await expect(pending).rejects.toMatchObject({kind:'unauthenticated'});expect(sdk.listeners.size).toBe(0);
  });
});

describe('analytics admin rendering matches measurement authority',()=>{
  it('shows collection start even when acquisition and journey lists are empty',async()=>{
    reply({analytics:empty()});const page=mount(<AcquisitionSection userId="owner-a" days={30}/>);
    expect(await screen.findByRole('note')).toHaveTextContent('comparisons are incomplete');expect(screen.getByText('No visits recorded yet.')).toBeInTheDocument();
    page.unmount();mount(<JourneysSection userId="owner-a" days={30}/>);
    expect(await screen.findByRole('note')).toHaveTextContent('Visit collection began');
  });

  it('labels organic tagged campaigns without representing them as ads',async()=>{
    const data=covered();data.channels=[{label:'Social (unpaid)',visitors:1,sessions:1,newAccounts:1}];
    reply({analytics:data});mount(<AcquisitionSection userId="owner-a" days={30}/>);
    expect(await screen.findByRole('heading',{name:'Tagged campaigns'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Ad campaigns'})).not.toBeInTheDocument();expect(screen.getByText('Social (unpaid)')).toBeInTheDocument();
  });

  it('renders first-touch accounts even when no current-window visit exists',async()=>{
    const data=empty();data.totals.newAccounts=1;data.channels=[{label:'Social (unpaid)',visitors:0,sessions:0,newAccounts:1}];
    reply({analytics:data});mount(<AcquisitionSection userId="owner-a" days={30}/>);
    expect(await screen.findByText('New accounts from visits')).toBeInTheDocument();expect(screen.queryByText('No visits recorded yet.')).not.toBeInTheDocument();
  });

  it('retains deleted-account attribution without claiming the visit was anonymous',async()=>{
    reply({visit:{...adminVisit(),person:null}});mount(<VisitDetail userId="owner-a" id={adVisitId}/>);
    expect(await screen.findByText('Account details unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Anonymous')).not.toBeInTheDocument();
    expect(screen.getByText(/1 other recorded visit linked to this account/)).toBeInTheDocument();
    expect(screen.queryByText(/Has not signed in on this browser/)).not.toBeInTheDocument();
  });

  it('shows each actual page-exposure duration once in the visit timeline',async()=>{
    const data=adminVisit();data.events=[
      {at:'2026-10-25T15:00:00.000Z',kind:'page_view',path:'/loop',seconds:11,scroll:30},
      {at:'2026-10-25T15:01:00.000Z',kind:'page_view',path:'/loop',seconds:22,scroll:80},
    ];reply({visit:data});mount(<VisitDetail userId="owner-a" id={adVisitId}/>);
    expect(await screen.findByText('11 s on screen · scrolled 30%')).toBeInTheDocument();
    expect(screen.getByText('22 s on screen · scrolled 80%')).toBeInTheDocument();
    expect(screen.getByText('33 s')).toBeInTheDocument();
  });

  it('never creates a callable telephone link for an operator-masked number',async()=>{
    const data=adminVisit();data.person={...data.person,email:'c***@work.org',phone:'+97••••567'};
    reply({visit:data});mount(<VisitDetail userId="owner-a" id={adVisitId}/>);
    expect(await screen.findByText('+97••••567')).toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
