// @vitest-environment node
// Independent review of the optional hosted acceptance boundary. Every value is
// an inert fixture; no real credential or provider/network operation is used.
import { describe, expect, it } from 'vitest';
import { loopBillingTestConfiguration } from '../functions/_shared/loop-billing-test-config';

const owner='11111111-1111-4111-8111-111111111111';
const fixture:Record<string,string>={
  JOBVANCE_LOOP_TEST_BILLING_ENABLED:'true',JOBVANCE_LOOP_TEST_OWNER_IDS:owner,
  JOBVANCE_LOOP_TEST_APP_URL:'https://jobvance.io',DODO_TEST_PAYMENTS_API_KEY:'dodo_test_isolated_fixture_only',
  DODO_TEST_PAYMENTS_WEBHOOK_KEY:'whsec_'+Buffer.from('isolated-signature-fixture-only').toString('base64'),
  DODO_TEST_PRODUCT_LOOP_WEEKLY:'pdt_TestWeekly',DODO_TEST_PRODUCT_LOOP_ACTIVE:'pdt_TestActive',DODO_TEST_PRODUCT_LOOP_DAILY:'pdt_TestDaily',
};
function isolated(overrides:Record<string,string|undefined>={}){
  const reads:string[]=[];
  const result=loopBillingTestConfiguration(key=>{
    reads.push(key);
    if(!key.startsWith('JOBVANCE_LOOP_TEST_')&&!key.startsWith('DODO_TEST_'))throw Error('Live configuration must not be read: '+key);
    return {...fixture,...overrides}[key];
  });
  return {result,reads};
}
describe('independent hosted Test billing isolation review',()=>{
  it('constructs a Test-only provider configuration without consulting any Live key or flag',()=>{
    const {result,reads}=isolated();expect(result).toMatchObject({mode:'test',apiBaseUrl:'https://test.dodopayments.com',testOwnerIds:[owner],loopProducts:{weekly:'pdt_TestWeekly',active:'pdt_TestActive',daily:'pdt_TestDaily'}});
    expect(reads.length).toBeGreaterThan(5);expect(Object.isFrozen(result!.testOwnerIds)).toBe(true);
  });
  it.each(['DODO_TEST_PAYMENTS_API_KEY','DODO_TEST_PAYMENTS_WEBHOOK_KEY','DODO_TEST_PRODUCT_LOOP_WEEKLY','DODO_TEST_PRODUCT_LOOP_ACTIVE','DODO_TEST_PRODUCT_LOOP_DAILY','JOBVANCE_LOOP_TEST_APP_URL'])('never falls back to Live when %s is missing',key=>{
    expect(isolated({[key]:undefined}).result).toBeNull();
  });
  it('rejects a visibly Live credential even when the Test variable name is used',()=>{
    expect(isolated({DODO_TEST_PAYMENTS_API_KEY:'dodo_live_not_a_real_key'}).result).toBeNull();
  });
  it.each(['',owner+','+owner,'*',owner+',not-a-uuid',Array.from({length:11},(_,i)=>`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`).join(',')])('disables the entire test entry for malformed or unbounded owner scope %s',owners=>{
    expect(isolated({JOBVANCE_LOOP_TEST_OWNER_IDS:owners}).result).toBeNull();
  });
  it('does not inherit an otherwise enabled Live rollout when its own opt-in is absent',()=>{
    const live={JOBVANCE_LOOP_BILLING_ENABLED:'true',JOBVANCE_BILLING_ENABLED:'true',JOBVANCE_BILLING_MODE:'live',JOBVANCE_PAYMENT_PROVIDER:'dodo',DODO_PAYMENTS_API_KEY:'dodo_live_fixture',DODO_PRODUCT_LOOP_WEEKLY:'pdt_LiveWeekly'};
    expect(loopBillingTestConfiguration(key=>live[key as keyof typeof live])).toBeNull();
    expect(isolated({JOBVANCE_LOOP_TEST_BILLING_ENABLED:'false'}).result).toBeNull();
  });
});
