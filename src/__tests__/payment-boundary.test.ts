import {describe,it,expect} from 'vitest';
import {checkoutSchema,jobInputSchema,safeEmployerUrl} from '@/lib/workspace-api';
import {isPaddleClientReady} from '@/lib/payment-checkout';
describe('Browser payment and employer-link boundaries',()=>{
  it('accepts only provider-specific checkout shapes',()=>{
    expect(checkoutSchema.safeParse({provider:'paddle',transactionId:'txn_'+'a'.repeat(26),billingMode:'test'}).success).toBe(true);
    expect(checkoutSchema.safeParse({provider:'paddle',transactionId:'https://untrusted.example',billingMode:'test'}).success).toBe(false);
    expect(checkoutSchema.safeParse({provider:'stripe',sessionId:'cs_test',billingMode:'live',url:'https://checkout.stripe.com/pay/x'}).success).toBe(true);
  });
  it('rejects fake checkout domains, credentials and script links',()=>{
    for(const url of ['https://checkout.stripe.com.attacker.example/pay','https://username@checkout.stripe.com/pay','javascript:alert(1)'])expect(checkoutSchema.safeParse({provider:'stripe',sessionId:'x',billingMode:'live',url}).success).toBe(false);
    expect(safeEmployerUrl('javascript:alert(1)')).toBe(null);expect(safeEmployerUrl('https://employer.example/jobs')).toBe('https://employer.example/jobs');
  });
  it('keeps test and live public tokens separate',()=>{
    expect(isPaddleClientReady('test','test_example')).toBe(true);expect(isPaddleClientReady('live','test_example')).toBe(false);expect(isPaddleClientReady('test','live_example')).toBe(false);expect(isPaddleClientReady('test','')).toBe(false);
  });
  it('rejects incomplete descriptions and untrusted employer URLs before saving',()=>{
    const input={resumeId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jobTitle:'Finance analyst',company:'',jobUrl:'',jobDescription:'A short description'};
    expect(jobInputSchema.safeParse(input).success).toBe(false);
    expect(jobInputSchema.safeParse({...input,jobDescription:'A real job description covering financial analysis and reporting requirements. '.repeat(2),jobUrl:'https://user:password@company.example'}).success).toBe(false);
  });
});
