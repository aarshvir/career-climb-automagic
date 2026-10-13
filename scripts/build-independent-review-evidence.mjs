/** Offline public-source evidence. Never reads a worktree file, environment, customer record or prior review. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_COMMIT = '2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69';
export const DIMENSIONS = [
  ['user_need_value','User need / value'],['onboarding','Onboarding'],['ux_accessibility_mobile','UX / accessibility / mobile'],
  ['evidence_trust_document_quality','Evidence trust / document quality'],['job_coverage_relevance','Job coverage / relevance'],
  ['automation_effort','Automation / effort'],['tracking_actionability','Tracking / actionability'],
  ['reliability_recovery','Reliability / recovery'],['privacy_control','Privacy / control'],['willingness_to_pay','Willingness to pay'],
];
const selections = [
  ['src/MvpApp.tsx',1,180,6500],['src/pages/ProductPage.tsx',1,110,4500],['src/pages/ProductPage.tsx',165,215,6000],
  ['src/pages/AudienceLanding.tsx',1,60,4000],['src/lib/job-loop-audiences.ts',1,180,4000],
  ['src/pages/CvCheck.tsx',80,220,6000],['src/pages/CvCheck.tsx',278,280,12000],
  ['src/lib/cv-evidence.ts',95,110,4500],['src/lib/cv-evidence.ts',280,390,6000],['src/lib/check-draft.ts',1,55,4000],
  ['src/lib/document-export.ts',1,200,4000],['src/pages/SubscriptionPricing.tsx',1,60,3000],['src/lib/subscription-plans.ts',1,60,2500],['src/pages/PilotLanding.tsx',1,90,3000],
  ['src/pages/JobLoop.tsx',280,340,3000],['src/pages/JobLoop.tsx',314,335,4000],['src/pages/JobLoopPanels.tsx',1,36,3500],['src/pages/JobLoopPanels.tsx',47,68,4000],['src/pages/LoopPacketPreview.tsx',1,100,3500],
  ['src/pages/LoopSupport.tsx',1,80,2500],['supabase/functions/_shared/job-loop-engine.ts',75,130,3000],
  ['supabase/functions/_shared/job-loop-engine.ts',200,300,5000],['supabase/functions/_shared/job-loop-runtime.ts',1,105,4000],
  ['supabase/functions/_shared/job-loop-runtime.ts',130,180,3000],['supabase/functions/_shared/job-loop-providers.ts',80,150,4000],
  ['supabase/functions/_shared/job-loop-types.ts',1,115,3000],['src/lib/pilot-demo.ts',1,60,2500],
];
const sha = value => createHash('sha256').update(value).digest('hex');
export function canonicalEvidenceJson(value) {
  function sorted(item){if(Array.isArray(item))return item.map(sorted);if(item&&typeof item==='object')return Object.fromEntries(Object.keys(item).sort().map(key=>[key,sorted(item[key])]));return item;}
  return JSON.stringify(sorted(value));
}
function boundedPrefix(value, maxBytes) {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  let prefix = '', bytes = 0;
  for (const character of value) { const size = Buffer.byteLength(character); if (bytes + size > maxBytes) break; prefix += character; bytes += size; }
  return prefix;
}
export function buildIndependentReviewEvidence(readPinnedSource) {
  const cache = new Map();
  const sources = selections.map(([path,startLine,endLine,maxBytes]) => {
    if (!cache.has(path)) cache.set(path, Buffer.from(readPinnedSource(BASELINE_COMMIT,path)));
    const source = cache.get(path); const lines = source.toString('utf8').split('\n');
    if (startLine > lines.length) throw new Error('The pinned evidence selection is outside its source.');
    const selected = lines.slice(startLine - 1,Math.min(endLine,lines.length)).join('\n');
    const excerpt = boundedPrefix(selected,maxBytes);
    // Reject actual credential-looking strings, never remove source wording silently.
    if (/sk-or-[a-z\d_-]{12,}|sb_secret_[a-z\d_-]{12,}|Bearer\s+(?:eyJ[a-z\d_-]{20,}|sk-[a-z\d_-]{12,})/i.test(excerpt)) throw new Error('A public-source excerpt failed credential screening.');
    return { path,sourceSha256:sha(source),startLine,endLine:startLine+(excerpt.match(/\n/g)?.length??0),excerptSha256:sha(excerpt),excerpt,truncated:excerpt.length<selected.length };
  });
  const evidence = { version:1,sourceCommit:BASELINE_COMMIT,kind:'pinned_public_source',coverageLimits:[
    'This package contains bounded excerpts from the pinned source commit only. It is the same package for every external persona reviewer.',
    'No live browser journey, authenticated production execution, configured provider, scheduled occurrence, account saving, tracking mutation, erasure or employer submission is established by source excerpts.',
    'Public examples in the included audience and pilot source are expressly fictional illustrations, not customer outcomes or successful execution evidence.',
    'The full source is larger than these selected ranges. Each excerpt records its lines, full-source SHA-256 and excerpt SHA-256; truncated excerpts may stop inside a source line.',
    'Layout, accessibility, mobile PDF interoperability, multilingual or scanned-file handling, realistic time savings and actual vacancy coverage have not been observed by this package.',
    'Pricing and statements in source do not establish actual purchase demand, paid entitlements, operating service availability or deployment parity with this commit.',
    'Prior independent reviews, their scores, improvement targets, tests, environment files, credentials, private records and newly implemented fixes are excluded.',
  ],rubric:DIMENSIONS.map(([key,label])=>({key,label})),sources };
  const serialized = JSON.stringify(evidence); const bytes = Buffer.byteLength(serialized);
  if (bytes > 120000) throw new Error('The pinned evidence package exceeds its 120KB boundary.');
  return { evidence,manifest:{version:1,sourceCommit:BASELINE_COMMIT,evidenceSha256:sha(canonicalEvidenceJson(evidence)),hashFormat:'sha256-utf8-canonical-json-sorted-object-keys',utf8Bytes:bytes,sourceFiles:cache.size,excerpts:sources.length,paths:[...cache.keys()],coverageLimits:evidence.coverageLimits} };
}
export async function main() {
  if (process.argv.length !== 2) throw new Error('This fixed evidence builder does not accept overrides.');
  const root = resolve(fileURLToPath(new URL('..',import.meta.url)));
  const built = buildIndependentReviewEvidence((commit,path)=>execFileSync('git',['show',`${commit}:${path}`],{cwd:root,maxBuffer:1000000,stdio:['ignore','pipe','pipe']}));
  const output = resolve(root,'docs/audits/2026-10-12/evidence'); await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'public-source-baseline.json'),JSON.stringify(built.evidence,null,2)+'\n','utf8');
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(built.manifest,null,2)+'\n','utf8');
  process.stdout.write(JSON.stringify({sourceCommit:BASELINE_COMMIT,evidenceSha256:built.manifest.evidenceSha256,utf8Bytes:built.manifest.utf8Bytes,sourceFiles:built.manifest.sourceFiles,excerpts:built.manifest.excerpts})+'\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(()=>{process.stderr.write('The offline pinned-source evidence package could not be built. No private data was read.\n');process.exitCode=1;});
