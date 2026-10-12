import type { LoopClaim, LoopOpportunity, LoopPacket, LoopProfile } from './job-loop-types.ts';

/** Preparation prompts cite existing facts; this does not assess interview performance or send messages. */
export function buildInterviewBrief(profile:LoopProfile,claims:LoopClaim[],opportunity:LoopOpportunity,packet:LoopPacket):NonNullable<LoopPacket['interviewBrief']>{
  const excluded=(value:string)=>profile.excludedTerms.some(term=>value.toLowerCase().includes(term.toLowerCase()));
  const approved=claims.filter(claim=>claim.status==='active'&&claim.confirmed&&claim.shareable&&packet.claimVersions[claim.id]===claim.revision&&!excluded(claim.phrasing+' '+claim.context));
  const example=approved.find(claim=>!['skill','education'].includes(claim.kind))??approved[0];
  const vacancy=opportunity.description.split(/\n|(?<=[.!?])\s+/).map(value=>value.trim()).find(value=>value.length>=20&&value.length<=350&&!excluded(value))??(!excluded(opportunity.title)?opportunity.title:'Review the original vacancy in your private opportunity record.');
  const gap=packet.assessment.gaps.find(value=>!excluded(value))??'The vacancy and your confirmed examples do not establish every requirement.';
  return [
    {title:'Explain your interest in this role',prompt:`Connect this employer requirement to your actual target: ${vacancy} Explain your motivation in your own words; no motivation has been invented for you.`,evidenceClaimIds:[],sourceQuote:vacancy},
    {title:'Prepare one factual example',prompt:example?`${example.kind.replace(/_/g,' ')} — ${example.context}: ${example.phrasing}\nPractise the situation, your own action and the actual result. Keep projected or unmeasured results labelled.`:'Confirm a shareable example before preparing an answer.',evidenceClaimIds:example?[example.id]:[],sourceQuote:example?.sourceQuote??''},
    {title:'Address an evidence gap honestly',prompt:`Prepare a question or a truthful transferable example for: ${gap} Do not imply experience you have not confirmed.`,evidenceClaimIds:[],sourceQuote:gap},
    {title:'Confirm the practical conditions',prompt:'Recheck the source vacancy for location, experience, pay, work authorization, sponsorship and deadlines. Unknown conditions remain unknown; ask the employer where necessary.',evidenceClaimIds:[],sourceQuote:vacancy},
    {title:'Review your next conversation',prompt:packet.contact?`Your named contact was confirmed by you. Review the existing recruiter draft and exact attachment before using it. ${packet.contact.inExistingThread?'Continue the existing thread.':''}`:'No recipient has been verified. Use the employer application link, or confirm a named contact and their public source before preparing outreach.',evidenceClaimIds:[],sourceQuote:excluded(packet.contact?.sourceQuote??opportunity.url)?'Source withheld under your exclusion preferences.':packet.contact?.sourceQuote??opportunity.url},
  ];
}
