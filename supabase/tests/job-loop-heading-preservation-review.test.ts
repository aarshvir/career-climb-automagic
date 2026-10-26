// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { composePacket, fingerprintLoopInputs, validateAction, validateClaim, validateOpportunity, validateProfile } from '../functions/_shared/job-loop-engine.ts';
import { renderPacket } from '../functions/_shared/job-loop-render.ts';
import type { LoopClaim, LoopOpportunity, LoopPacket, LoopProfile } from '../functions/_shared/job-loop-types.ts';

const createdAt='2026-10-26T00:00:00Z';
const opportunity:LoopOpportunity={id:'opportunity-qa',source:'manual',sourceKey:'qa-manual',checkedAt:createdAt,verification:'user_provided',status:'saved',followUpAt:null,notes:'',...validateOpportunity({title:'Operations Analyst',company:'Example Company',location:'Remote',url:'https://example.com/jobs/operations-analyst',description:'Prepare operational reports and stakeholder dashboards. Maintain reliable business analysis and clear documentation for an operations team.',contact:null})};
const headings:Record<LoopClaim['kind'],string>={employment:'EMPLOYMENT',internship:'INTERNSHIPS',academic_project:'ACADEMIC PROJECTS',personal_project:'PERSONAL PROJECTS',volunteering:'VOLUNTEERING',education:'EDUCATION',skill:'SKILLS'};
interface SourceFact {kind:LoopClaim['kind'];context:string;quote:string}
const report:Record<string,unknown>[]=[];
function fixture(facts:SourceFact[],options:{name?:string;pageTarget?:1|2}={}){
 const name=options.name??'Alex Example',sourceText=[name,...facts.flatMap(fact=>[headings[fact.kind],fact.context,fact.quote])].join('\n');
 const profile:LoopProfile={...validateProfile({audience:'professional',name,contactLine:'',targetTitles:['Operations Analyst'],locations:['Remote'],experienceYears:null,languages:[],pageTarget:options.pageTarget??1,discreetSearch:false,sourceText,excludedTerms:[],compensation:{currency:'',period:'annual',minimum:null}}),revision:1,updatedAt:createdAt};
 const claims:LoopClaim[]=facts.map((fact,index)=>({...validateClaim({sourceKind:'cv_passage',sourceQuote:fact.quote,phrasing:fact.quote,context:fact.context,kind:fact.kind,resultStatus:'not_measured',confirmed:true,shareable:true},profile),id:facts.length===1?'claim-qa':'claim-'+index,revision:1,status:'active',createdAt}));
 return {profile,claims};
}
async function packetFor(input:ReturnType<typeof fixture>,selectedClaimIds=input.claims.map(claim=>claim.id)){
 const before=JSON.stringify(input);
 const packet=await composePacket({...input,opportunity,runId:'run-qa',packetId:'packet-qa',createdAt,selectedClaimIds});
 expect(JSON.stringify(input)).toBe(before);
 expect(packet).toMatchObject({id:'packet-qa',runId:'run-qa',opportunityId:'opportunity-qa',profileRevision:1,approvedAt:null});
 expect(packet.inputHash).toBe(await fingerprintLoopInputs(input.profile,input.claims,[opportunity]));
 expect(packet.claimVersions).toEqual(Object.fromEntries(input.claims.filter(claim=>selectedClaimIds.includes(claim.id)).map(claim=>[claim.id,1])));
 return packet;
}
const normalized=(value:string)=>value.replace(/\s+/g,' ').trim();
async function outputs(label:string,input:ReturnType<typeof fixture>,packet:LoopPacket){
 const result=await renderPacket({profile:input.profile,packet});
 expect(result.packet.status).toBe('review_required');expect(result.packet.approvedAt).toBeNull();expect(result.holdReasons).toEqual([]);
 for(const kind of ['pdf','docx','txt'])expect(result.artifacts[kind]).toBeDefined();
 expect(result.packet.formatStatus?.docx?.ready).toBe(true);expect(result.packet.formatStatus?.txt?.ready).toBe(true);
 const txt=new TextDecoder().decode(result.artifacts.txt.bytes);expect(txt).toBe(packet.cvText);
 const xml=strFromU8(unzipSync(result.artifacts.docx.bytes)['word/document.xml']);
 const docText=Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),match=>match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'")).join(' ');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:result.artifacts.pdf.bytes.slice(),useSystemFonts:false});
 const pdf=await task.promise;const pages:string[]=[];
 try {for(let i=1;i<=pdf.numPages;i++){const text=await(await pdf.getPage(i)).getTextContent();pages.push(text.items.map(item=>'str'in item?item.str:'').join(' '));}}finally{await task.destroy();}
 const pdfText=pages.join(' ');
 for(const claim of input.claims.filter(claim=>Object.hasOwn(packet.claimVersions,claim.id))){
  expect(normalized(txt)).toContain(normalized(claim.phrasing));expect(normalized(docText)).toContain(normalized(claim.phrasing));expect(normalized(pdfText)).toContain(normalized(claim.phrasing));
 }
 const allowed=new Set([input.profile.name,input.profile.contactLine,...Object.values(headings),'CONFIRMED SKILLS',...input.claims.map(claim=>claim.context),...input.claims.map(claim=>'• '+claim.phrasing)]);
 for(const line of packet.cvText.split('\n').filter(Boolean))expect(allowed.has(line)).toBe(true);
 for(const artifact of Object.values(result.artifacts)){expect(artifact.sha256).toBe(createHash('sha256').update(artifact.bytes).digest('hex'));expect(artifact.byteSize).toBe(artifact.bytes.length);}
 report.push({fixture:label,cvLength:packet.cvText.length,status:result.packet.status,holdReasons:result.holdReasons,pageCount:result.pageCount,inputHash:packet.inputHash,claimVersions:packet.claimVersions,approvedAt:result.packet.approvedAt,
  parsedFactsInAllThree:true,txtSha256:result.artifacts.txt.sha256,artifacts:Object.fromEntries(Object.entries(result.artifacts).map(([key,value])=>[key,{bytes:value.byteSize,sha256:value.sha256}]))});
 return result;
}

describe('independent PR25 actual export preservation',()=>{
 it.each([
  {name:'education87 legacy presentation retained',fact:{kind:'education' as const,context:'Education',quote:'BSc in Business Administration, Example University.'},legacy:'Alex Example\n\nEDUCATION\nEducation\n• BSc in Business Administration, Example University.',sha:'618f331bada04310fd8ae9e2c8167175c3b81ebf53ca976a078963f3764c9630',hash:'d9492f3c37481f2b53541e827676999ce82603363804df9de3b87eef9f18cdb0'},
  {name:'skills95 legacy presentation retained',fact:{kind:'skill' as const,context:'Skills',quote:'Excel reporting, business analysis and data dashboards.'},legacy:'Alex Example\n\nCONFIRMED SKILLS\nSkills\n• Excel reporting, business analysis and data dashboards.',sha:'0909dace587f70572b73c73ca84797c0905715009c8dc786dbf929fb9b1ab44f',hash:'4cddfedcef1a4a39e48de0ea60cd8bf289fdb6d035697ad4dc62b31dcc1eb1e1'},
 ])('$name',async({name,fact,legacy,sha,hash})=>{
  const input=fixture([fact]),packet=await packetFor(input);expect(packet.cvText).toBe(legacy);expect(packet.inputHash).toBe(hash);
  const rendered=await outputs(name,input,packet);expect(rendered.artifacts.txt.sha256).toBe(sha);
  expect(()=>validateAction({action:'approve_packet',packetId:packet.id,inputHash:packet.inputHash,reviewedText:packet.cvText,confirmFacts:true,confirmDisclosure:true})).not.toThrow();
 });
 it('keeps a distinct Core skills context while using the shorter section name',async()=>{
  const input=fixture([{kind:'skill',context:'Core skills',quote:'Excel reporting, business analysis and data dashboards.'}]),packet=await packetFor(input);
  expect(packet.cvText).toBe('Alex Example\n\nSKILLS\nCore skills\n• Excel reporting, business analysis and data dashboards.');
  expect(packet.inputHash).toBe('dd1c2e4e4583ccbb331a103062451771c75df6726f37e48ed2c9122774bf9cfb');
  await outputs('distinct skills context',input,packet);
 });
 it.each(['Education','eDuCaTiOn'])('removes only duplicate %s context for normal-length education',async context=>{
  const fact={kind:'education' as const,context,quote:'Bachelor of Science in Business Administration with operations coursework, Example University.'};
  const input=fixture([fact]),packet=await packetFor(input);
  expect(packet.cvText.split('\n').filter(line=>line.toLowerCase()==='education')).toEqual(['EDUCATION']);
  expect(packet.cvText).toContain(fact.quote);await outputs('normal education '+context,input,packet);
 });
 it.each(['Education:','Education | Example University | 2016'])('retains near-match context %s without deleting provenance',async context=>{
  const input=fixture([{kind:'education',context,quote:'Bachelor of Science in Business Administration with operations coursework, Example University.'}]),packet=await packetFor(input);
  expect(packet.cvText.split('\n').filter(line=>line===context)).toEqual([context]);
  expect(packet.cvText.split('\n').filter(line=>line==='EDUCATION')).toEqual(['EDUCATION']);
  await outputs('near-match '+context,input,packet);
 });
 it('preserves real employment chronology and education/skills facts despite relevance-order selection',async()=>{
  const facts:SourceFact[]=[
   {kind:'employment',context:'Earlier Example Group',quote:'Prepared an operations tracker covering six regional workstreams.'},
   {kind:'employment',context:'Later Example Company',quote:'Maintained business dashboards and documented weekly reporting procedures.'},
   {kind:'education',context:'Example University',quote:'Bachelor of Science in Business Administration, Example University.'},
   {kind:'skill',context:'Core skills',quote:'Excel reporting and stakeholder communication.'},
  ];
  const input=fixture(facts),packet=await packetFor(input,input.claims.map(claim=>claim.id).reverse());
  expect(packet.cvText.indexOf('Earlier Example Group')).toBeLessThan(packet.cvText.indexOf('Later Example Company'));
  for(const fact of facts)expect(packet.cvText.split(fact.quote)).toHaveLength(2);
  await outputs('normal distinct contexts and reversed role selection',input,packet);
 });
 it('keeps long literal content and attribution without extra filler or arbitrary truncation',async()=>{
  const quote=Array.from({length:12},(_,i)=>'Prepared operational analysis note '+(i+1)+' and maintained the reporting tracker for the team.').join(' ');
  const input=fixture([{kind:'employment',context:'Example Operations Team',quote},{kind:'skill',context:'Skills',quote:'Excel reporting, stakeholder documentation and structured operations analysis.'}],{pageTarget:2});
  const packet=await packetFor(input);expect(packet.cvText).toContain('• '+quote);
  expect(packet.cvText).not.toContain('CONFIRMED SKILLS');await outputs('long actual paragraph',input,packet);
 });
 it('retains the existing80-character export and approval floor rather than padding a short packet',async()=>{
  const input=fixture([{kind:'education',context:'Education',quote:'BSc in Business Administration, Example University.'}]),packet=await packetFor(input);
  const short=packet.cvText.slice(0,79);const rendered=await renderPacket({profile:input.profile,packet:{...packet,cvText:short}});
  expect(rendered.packet.status).toBe('held');expect(rendered.holdReasons).toContain('CV_TEXT_LENGTH_INVALID');expect(rendered.artifacts).toEqual({});
  expect(()=>validateAction({action:'approve_packet',packetId:packet.id,inputHash:packet.inputHash,reviewedText:short,confirmFacts:true,confirmDisclosure:true})).toThrow();
 });
 it('keeps the exact80-character original export valid with no unselected fact padding',async()=>{
  const input=fixture([{kind:'skill',context:'Skills',quote:'Excel reporting, business analysis and data dashboards.'}]);
  const phrase='Excel, SQL and business report creation.';
  input.profile.sourceText=['Alex Example','SKILLS','Skills',phrase,'EDUCATION','Example University','BSc in business administration.'].join('\n');
  input.claims=[{...validateClaim({sourceKind:'cv_passage',sourceQuote:phrase,phrasing:phrase,context:'Skills',kind:'skill',resultStatus:'not_measured',confirmed:true,shareable:true},input.profile),id:'claim-qa',revision:1,status:'active',createdAt}];
  const packet=await packetFor(input);expect(packet.cvText).toBe('Alex Example\n\nCONFIRMED SKILLS\nSkills\n• '+phrase);expect(packet.cvText).toHaveLength(80);
  expect(packet.cvText).not.toContain('BSc in business administration.');
  await outputs('exact80 original export',input,packet);
 });
 it('preserves an original60,001-character hold even though shorter headings would fall under60,000',async()=>{
  const input=fixture([{kind:'skill',context:'Skills',quote:'Excel reporting, business analysis and data dashboards.'}]);
  const initial='Alex Example\n\nCONFIRMED SKILLS\nSkills\n';
  const parts=Array.from({length:40},(_,index)=>{
   const start='Evidence note '+(index+1)+': ';
   const literal=start+'Maintained operational reporting notes for the business team. '.repeat(26);
   return literal.slice(0,1499)+'.';
  });
  const excess=initial.length+parts.join('\n').length+parts.length*2-60001;
  parts[parts.length-1]=parts[parts.length-1].slice(0,-excess-1)+'.';
  input.claims=parts.map((phrase,index)=>({...validateClaim({sourceKind:'user_answer',sourceQuote:'Skills: '+phrase,phrasing:phrase,context:'Skills',kind:'skill',resultStatus:'not_measured',confirmed:true,shareable:true},input.profile),id:'skill-'+index,revision:1,status:'active' as const,createdAt}));
  const original=initial+parts.map(phrase=>'• '+phrase).join('\n');
  expect(original).toHaveLength(60001);expect(original.replace('CONFIRMED SKILLS\nSkills\n','SKILLS\n').length).toBe(59984);
  const packet=await packetFor(input);expect(packet.cvText).toBe(original);expect(packet.status).toBe('held');expect(packet.holdReasons).toContain('CV_TEXT_TOO_LONG');
  const rendered=await renderPacket({profile:input.profile,packet});expect(rendered.artifacts).toEqual({});expect(rendered.holdReasons).toContain('CV_TEXT_LENGTH_INVALID');
  expect(()=>validateAction({action:'approve_packet',packetId:packet.id,inputHash:packet.inputHash,reviewedText:packet.cvText,confirmFacts:true,confirmDisclosure:true})).toThrow();
  report.push({fixture:'original60001 remains held, cosmetic59984 rejected',cvLength:packet.cvText.length,status:rendered.packet.status,holdReasons:rendered.holdReasons,inputHash:packet.inputHash,approvedAt:packet.approvedAt,artifacts:{}});
 });
 it('does not reintroduce withdrawn or unshareable source facts under the formatting change',async()=>{
  const input=fixture([{kind:'skill',context:'Core skills',quote:'Excel reporting, business analysis and data dashboards.'}]);
  for(const changed of [{...input.claims[0],status:'withdrawn' as const},{...input.claims[0],shareable:false}]){
   await expect(composePacket({...input,claims:[changed],opportunity,runId:'run-qa',selectedClaimIds:[changed.id]})).rejects.toThrow(/selection/);
   const packet=await composePacket({...input,claims:[changed],opportunity,runId:'run-qa'});expect(packet.status).toBe('held');expect(packet.cvText).not.toContain(changed.phrasing);expect(packet.approvedAt).toBeNull();
  }
 });
});
afterAll(async()=>{
 if(process.env.PR25_PRESERVATION_EXPORT!=='1')return;
 const source=await readFile(new URL('../functions/_shared/job-loop-engine.ts',import.meta.url),'utf8');
 await writeFile(new URL('../../../jobvance-marketing-coordination/design-team-2026-10-26/pr25-independent-artifacts.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),scope:'Actual current engine/render with parsed PDF/DOCX/TXT, isolated literal fixtures; no browser/native/provider proof',engineSha256:createHash('sha256').update(source).digest('hex'),results:report},null,2)+'\n');
});
