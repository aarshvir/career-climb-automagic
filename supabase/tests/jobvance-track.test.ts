import { describe, expect, it } from 'vitest';
import { cleanBatch, describeDevice, isBot, safeTrackPath, trackAcknowledgement } from '../functions/_shared/jobvance-track';

const visitorId = '00000000-0000-4000-8000-0000000000a1', sessionId = '00000000-0000-4000-8000-0000000000b1', batchId = '00000000-0000-4000-8000-0000000000c1';
const eventId = '00000000-0000-4000-8000-0000000000d1', pageId = '00000000-0000-4000-8000-0000000000e1';
const now = Date.parse('2026-10-26T20:00:00.000Z');
const fixture = () => ({ visitorId, sessionId, batchId, token: null as string | null, context: { landing: '/onboarding', utm_source: 'instagram', screen: '390x844', fbclid: true }, events: [
  { id: eventId, pageId, kind: 'page_view', at: '2026-10-26T19:59:00.000Z', path: '/job-loop', title: 'Job Loop' },
] });

describe('immutable whole-batch analytics admission', () => {
  it('admits an exact bounded batch without mutating it', () => {
    const value=fixture(), before=structuredClone(value);
    expect(cleanBatch(value,now)).toEqual(value); expect(value).toEqual(before);
    expect(cleanBatch({...value,token:'fictional-jwt'},now)?.token).toBe('fictional-jwt');
  });

  it.each([
    ['unknown owner', (v: any) => {v.userId=visitorId;}],
    ['missing batch', (v: any) => {delete v.batchId;}],
    ['empty token is not anonymous', (v: any) => {v.token='';}],
    ['array token', (v: any) => {v.token=['jwt'];}],
    ['token whitespace', (v: any) => {v.token='a b';}],
    ['unknown context', (v: any) => {v.context.email='contact@example.invalid';}],
    ['missing landing', (v: any) => {delete v.context.landing;}],
    ['string marker', (v: any) => {v.context.fbclid='true';}],
    ['oversized marker', (v: any) => {v.context.utm_source='x'.repeat(101);}],
    ['empty events', (v: any) => {v.events=[];}],
    ['over count', (v: any) => {v.events=Array.from({length:26},(_,i)=>({...v.events[0],id:eventId.slice(0,-2)+String(i).padStart(2,'0')}));}],
    ['mixed invalid event', (v: any) => {v.events.push({...v.events[0],id:'bad'});}],
    ['duplicate event id', (v: any) => {v.events.push({...v.events[0]});}],
    ['coerced kind', (v: any) => {v.events[0].kind=['page_view'];}],
    ['noncanonical time', (v: any) => {v.events[0].at='2026-10-26T19:59:00Z';}],
    ['too old time', (v: any) => {v.events[0].at='2026-10-24T19:59:00.000Z';}],
    ['future time', (v: any) => {v.events[0].at='2026-10-26T20:10:00.000Z';}],
    ['unknown event key', (v: any) => {v.events[0].typedValue='private';}],
    ['oversized label', (v: any) => {v.events[0].label='x'.repeat(101);}],
    ['control string', (v: any) => {v.events[0].title='hello'+String.fromCharCode(0);}],
    ['string duration', (v: any) => {v.events[0].kind='page_leave';v.events[0].durationMs='100';}],
    ['duration in wrong kind', (v: any) => {v.events[0].durationMs=1;}],
    ['missing leave duration', (v: any) => {v.events[0].kind='page_leave';}],
    ['huge duration', (v: any) => {v.events[0].kind='page_leave';v.events[0].durationMs=86400001;}],
    ['nested props', (v: any) => {v.events[0].props={hidden:{yes:true}};}],
    ['unknown props', (v: any) => {v.events[0].props={whatever:1};}],
    ['nonfinite scroll', (v: any) => {v.events[0].props={maxScroll:NaN};}],
    ['scroll over100', (v: any) => {v.events[0].props={maxScroll:101};}],
    ['query destination', (v: any) => {v.events[0].href='https://external.invalid/?token=secret';}],
    ['contact destination', (v: any) => {v.events[0].href='mailto:person@example.invalid';}],
  ])('rejects the entire batch for %s', (_label, mutate) => {
    const value=fixture(); mutate(value); expect(cleanBatch(value,now)).toBeNull();
  });

  it('keeps exact explicit time segments and safe URL markers', () => {
    const value=fixture() as any; value.events[0]={...value.events[0],kind:'page_leave',durationMs:1234,props:{maxScroll:75.5,hidden:true},href:'tel:'};
    expect(cleanBatch(value,now)?.events[0]).toEqual(value.events[0]);
    for(const href of ['/pricing?loopPlan=weekly','https://employer.invalid/jobs/123','employer.invalid/jobs/123','mailto:']) expect(cleanBatch({...fixture(),events:[{...fixture().events[0],href}]},now)).not.toBeNull();
  });
  it.each(['//evil.invalid/path','/auth?code=secret','/check?email=a','/a/../b','/\\u0000','/path#part','/path?utm_source=a&utm_source=b','/a%5Cb','/a%00b'])('rejects unsafe or unsanitized path %s', path => {
    expect(safeTrackPath(path)).toBe(false);
  });

  it('only forwards a verified matching RPC receipt, including unchanged exact-retry receipts', () => {
    const batch=cleanBatch(fixture(),now)!;
    const receipt={batchId,accepted:1,inserted:1,duplicate:false};
    expect(trackAcknowledgement(receipt,batch)).toEqual(receipt);
    expect(trackAcknowledgement({...receipt,inserted:0,duplicate:true},batch)).toEqual({...receipt,inserted:0,duplicate:true});
    for(const change of [{batchId:sessionId},{accepted:0},{accepted:'1'},{inserted:-1},{inserted:2},{duplicate:['false']},{secret:'no'}]) expect(trackAcknowledgement({...receipt,...change},batch)).toBeNull();
    expect(trackAcknowledgement([receipt],batch)).toBeNull();
  });
  it('describes in-app/device metadata and returns explicit bot classification', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram 350.0','AE')).toEqual({device:'mobile',browser:'Instagram',os:'iOS',inApp:'Instagram',country:'AE'});
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36','unknown')).toMatchObject({device:'desktop',browser:'Chrome',country:null});
    expect(isBot('facebookexternalhit/1.1')).toBe(true);expect(isBot('Mozilla/5.0 Safari/605.1.15')).toBe(false);
  });
});
