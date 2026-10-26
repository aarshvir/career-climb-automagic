// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { composePacket, fingerprintLoopInputs, validateClaim, validateOpportunity, validateProfile } from '../functions/_shared/job-loop-engine.ts';
import { renderPacket } from '../functions/_shared/job-loop-render.ts';
import type { LoopClaim, LoopOpportunity, LoopProfile } from '../functions/_shared/job-loop-types.ts';

const createdAt='2026-10-26T00:00:00Z';
const opportunity:LoopOpportunity={
  ...validateOpportunity({title:'Operations Analyst',company:'Example Company',location:'Remote',url:'https://example.com/jobs/operations-analyst',description:'Prepare operational reports and stakeholder dashboards. Maintain reliable business analysis and clear documentation for an operations team.',contact:null}),
  id:'opportunity-qa',source:'manual',sourceKey:'qa-manual',checkedAt:createdAt,verification:'user_provided',status:'saved',followUpAt:null,notes:'',
};
function fixture(kind:LoopClaim['kind'],context:string,quote:string,extraSource:string[]=[]){
  const section=kind==='skill'?'SKILLS':'EDUCATION';
  const sourceText=['Alex Example',section,context,quote,...extraSource].join('\n');
  const profile:LoopProfile={...validateProfile({audience:'professional',name:'Alex Example',contactLine:'',targetTitles:['Operations Analyst'],locations:['Remote'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText,excludedTerms:[],compensation:{currency:'',period:'annual',minimum:null}}),revision:1,updatedAt:createdAt};
  const claim:LoopClaim={...validateClaim({sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context,kind,resultStatus:'not_measured',confirmed:true,shareable:true},profile),id:'claim-qa',revision:1,status:'active',createdAt};
  return {profile,claims:[claim],opportunity,runId:'run-qa',packetId:'packet-qa',createdAt,selectedClaimIds:['claim-qa']};
}

describe('presentation polish preserves factual and export boundaries',()=>{
  it.each([
    {
      kind:'education' as const,context:'Education',quote:'BSc in Business Administration, Example University.',length:87,
      expected:'Alex Example\n\nEDUCATION\nEducation\n• BSc in Business Administration, Example University.',
    },
    {
      kind:'skill' as const,context:'Skills',quote:'Excel reporting, business analysis and data dashboards.',length:95,
      expected:'Alex Example\n\nCONFIRMED SKILLS\nSkills\n• Excel reporting, business analysis and data dashboards.',
    },
  ])('keeps the exact previously exportable short $kind presentation',async sample=>{
    const input=fixture(sample.kind,sample.context,sample.quote),claims=structuredClone(input.claims);
    const packet=await composePacket(input);
    expect(packet.cvText).toBe(sample.expected);expect(packet.cvText).toHaveLength(sample.length);
    expect(packet).toMatchObject({status:'review_required',holdReasons:[],claimVersions:{'claim-qa':1},approvedAt:null});
    expect(packet.inputHash).toBe(await fingerprintLoopInputs(input.profile,input.claims,[opportunity]));expect(input.claims).toEqual(claims);
    const rendered=await renderPacket({profile:input.profile,packet});
    expect(rendered.packet.status).toBe('review_required');expect(rendered.holdReasons).toEqual([]);
    expect(Object.keys(rendered.artifacts)).toEqual(expect.arrayContaining(['pdf','docx','txt']));
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toBe(sample.expected);
  });

  it('uses SKILLS and keeps a distinct context when shortening remains exportable',async()=>{
    const input=fixture('skill','Core skills','Excel reporting, business analysis and data dashboards.');
    const packet=await composePacket(input);
    expect(packet.cvText).toBe('Alex Example\n\nSKILLS\nCore skills\n• Excel reporting, business analysis and data dashboards.');
    expect(packet.cvText).toHaveLength(90);expect(packet.status).toBe('review_required');expect(packet.holdReasons).toEqual([]);
  });

  it('restores the entire original presentation when the label change alone crosses the minimum',async()=>{
    const input=fixture('skill','Core skills','Excel reporting, business analysis and SQL.',['EDUCATION','Example University','BSc in business administration.']);
    const packet=await composePacket(input);
    expect(packet.cvText).toBe('Alex Example\n\nCONFIRMED SKILLS\nCore skills\n• Excel reporting, business analysis and SQL.');
    expect(packet.status).toBe('review_required');expect(packet.cvText.length).toBeGreaterThanOrEqual(80);
  });

  it('preserves the exact eighty-character valid export rather than adding filler',async()=>{
    const input=fixture('skill','Skills','Excel, SQL and business report creation.',['EDUCATION','Example University','BSc in business administration.']);
    const packet=await composePacket(input);
    expect(packet.cvText).toBe('Alex Example\n\nCONFIRMED SKILLS\nSkills\n• Excel, SQL and business report creation.');
    expect(packet.cvText).toHaveLength(80);expect(packet.status).toBe('review_required');
    const rendered=await renderPacket({profile:input.profile,packet});expect(rendered.artifacts.txt).toBeDefined();
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toBe(packet.cvText);
  });

  it('keeps an originally under-bound CV held in both composition and rendering',async()=>{
    const input=fixture('skill','Skills','SQL, Excel and weekly business reports.',['EDUCATION','Example University','BSc in business administration.']);
    const packet=await composePacket(input);
    expect(packet.cvText.length).toBeLessThan(80);expect(packet.status).toBe('held');expect(packet.holdReasons).toContain('CV_TEXT_TOO_SHORT');
    expect(packet.cvText).not.toContain('BSc in business administration.');
    const rendered=await renderPacket({profile:input.profile,packet});expect(rendered.artifacts).toEqual({});
    expect(rendered.holdReasons).toContain('CV_TEXT_LENGTH_INVALID');
  });

  it('keeps an originally over-bound CV held even when cosmetic shortening would cross the maximum',async()=>{
    const input=fixture('skill','Skills','Excel reporting, business analysis and data dashboards.');
    const prefix='Alex Example\n\nCONFIRMED SKILLS\nSkills\n';
    const lengths=Array<number>(40).fill(1500);
    lengths[39]-=prefix.length+lengths.reduce((sum,length)=>sum+length+3,0)-1-60001;
    input.claims=lengths.map((length,index)=>{
      const lead=`Evidence item ${index+1}: `,phrasing=lead+'x'.repeat(length-lead.length-1)+'.';
      return {...validateClaim({sourceKind:'user_answer',sourceQuote:'Skills: '+phrasing,phrasing,context:'Skills',kind:'skill',resultStatus:'not_measured',confirmed:true,shareable:true},input.profile),id:`skill-${index}`,revision:1,status:'active' as const,createdAt};
    });
    input.selectedClaimIds=input.claims.map(claim=>claim.id);
    const original=prefix+input.claims.map(claim=>'• '+claim.phrasing).join('\n');
    expect(original).toHaveLength(60001);
    expect(original.replace('CONFIRMED SKILLS\nSkills\n','SKILLS\n').length).toBeLessThanOrEqual(60000);
    const packet=await composePacket(input);
    expect(packet.cvText).toBe(original);expect(packet.status).toBe('held');expect(packet.holdReasons).toContain('CV_TEXT_TOO_LONG');
    const rendered=await renderPacket({profile:input.profile,packet});expect(rendered.artifacts).toEqual({});
    expect(rendered.holdReasons).toContain('CV_TEXT_LENGTH_INVALID');
  });

  it('skips only exact duplicate contexts and preserves distinct attribution, facts, numbers and order',async()=>{
    const experience='Helped design a procurement pilot across 5 units, with 8% projected savings.';
    const education='BSc in Business Administration, Example University.';
    const skills='Excel reporting, business analysis and data dashboards.';
    const input=fixture('skill','Skills',skills);
    input.profile.sourceText=['Alex Example','EMPLOYMENT','Example Advisory',experience,'EDUCATION','Education',education,'SKILLS','Skills',skills].join('\n');
    input.claims=[
      {...validateClaim({sourceKind:'cv_passage',sourceQuote:experience,phrasing:experience,context:'Example Advisory',kind:'employment',resultStatus:'projected',confirmed:true,shareable:true},input.profile),id:'work',revision:4,status:'active',createdAt},
      {...validateClaim({sourceKind:'cv_passage',sourceQuote:education,phrasing:education,context:'Education',kind:'education',resultStatus:'not_measured',confirmed:true,shareable:true},input.profile),id:'degree',revision:2,status:'active',createdAt},
      ...input.claims,
    ];input.selectedClaimIds=['claim-qa','degree','work'];
    const before=structuredClone(input.claims),packet=await composePacket(input);
    expect(packet.cvText).toBe(['Alex Example','','EMPLOYMENT','Example Advisory','• '+experience,'','EDUCATION','• '+education,'','SKILLS','• '+skills].join('\n'));
    expect(packet.claimVersions).toEqual({work:4,degree:2,'claim-qa':1});expect(input.claims).toEqual(before);
    expect(packet.inputHash).toBe(await fingerprintLoopInputs(input.profile,input.claims,[opportunity]));
    expect(packet.evidenceText).toContain('work revision 4 / employment / Example Advisory / projected');
    expect(packet.approvedAt).toBeNull();expect(packet.status).toBe('review_required');
  });
});
