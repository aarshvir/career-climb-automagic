// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BASELINE_COMMIT, DIMENSIONS, buildIndependentReviewEvidence, canonicalEvidenceJson } from '../../../scripts/build-independent-review-evidence.mjs';
import { REVIEW_BASELINE_COMMIT, REVIEW_DIMENSIONS, REVIEW_SOURCE_PATHS, reviewSha256, canonicalReviewJson, validateReviewEvidence } from '../../../supabase/functions/_shared/jobvance-review-runtime';
import { prepareRouterRequest } from '../../../supabase/functions/_shared/jobvance-openrouter';

describe('neutral pinned-source evidence package',()=>{
  it('reads only allowlisted active source at the fixed commit and reuses identical input for every persona',()=>{
    const read=vi.fn((commit:string,path:string)=>Buffer.from(Array.from({length:400},(_,i)=>`${path}: fictional public source line ${i+1}.`).join('\n')));
    const first=buildIndependentReviewEvidence(read);expect(first.evidence.sourceCommit).toBe(REVIEW_BASELINE_COMMIT);expect(BASELINE_COMMIT).toBe(REVIEW_BASELINE_COMMIT);expect(DIMENSIONS).toEqual(REVIEW_DIMENSIONS);
    expect(read).toHaveBeenCalledTimes(first.manifest.sourceFiles);for(const [commit,path]of read.mock.calls){expect(commit).toBe(BASELINE_COMMIT);expect(REVIEW_SOURCE_PATHS).toContain(path);expect(path).not.toMatch(/(?:^\.|__tests__|docs\/audits|\.env|Index\.tsx|PricingPage\.tsx|FAQ\.tsx|HowItWorks\.tsx)/);}
    expect(first.manifest.paths).toEqual(expect.arrayContaining(['src/MvpApp.tsx','src/pages/ProductPage.tsx','src/pages/SubscriptionPricing.tsx','src/pages/PilotLanding.tsx']));
    expect(first.evidence).not.toHaveProperty('persona');expect(first.evidence).not.toHaveProperty('scores');expect(first.evidence).not.toHaveProperty('desiredScores');expect(first.manifest.utf8Bytes).toBeLessThanOrEqual(120000);
    const second=buildIndependentReviewEvidence((commit:string,path:string)=>Buffer.from(Array.from({length:400},(_,i)=>`${path}: fictional public source line ${i+1}.`).join('\n')));expect(second).toEqual(first);
  });
  it('hashes exact full source and cropped excerpts without inventing observations',()=>{
    const source=Buffer.from(('Public fictional illustration 🙂.\n').repeat(400));const built=buildIndependentReviewEvidence(()=>source);
    for(const excerpt of built.evidence.sources){expect(excerpt.sourceSha256).toBe(createHash('sha256').update(source).digest('hex'));expect(excerpt.excerptSha256).toBe(createHash('sha256').update(excerpt.excerpt).digest('hex'));expect(excerpt.endLine).toBe(excerpt.startLine+(excerpt.excerpt.match(/\n/g)?.length??0));expect(excerpt.excerpt).not.toContain('\uFFFD');}
    expect(built.evidence.coverageLimits.join(' ')).toMatch(/No live browser journey/);expect(built.evidence.coverageLimits.join(' ')).toMatch(/fictional illustrations/);
  });
  it('rejects credential-looking source instead of silently redacting its evidentiary content',()=>{
    expect(()=>buildIndependentReviewEvidence(()=>Buffer.from(('sk-or-'+ 'a'.repeat(40)+'\n').repeat(400)))).toThrow(/credential/);
  });
  it('validates the actual generated package, hashes and full router input boundary offline',async()=>{
    const evidence=JSON.parse(await readFile('docs/audits/2026-10-12/evidence/public-source-baseline.json','utf8'));const manifest=JSON.parse(await readFile('docs/audits/2026-10-12/evidence/manifest.json','utf8'));
    expect(validateReviewEvidence(evidence)).toEqual(evidence);expect(await reviewSha256(canonicalReviewJson(evidence))).toBe(manifest.evidenceSha256);
    expect(canonicalReviewJson(evidence)).toBe(canonicalEvidenceJson(evidence));
    for(const source of evidence.sources)expect(await reviewSha256(source.excerpt)).toBe(source.excerptSha256);
    for(const model of ['moonshotai/kimi-k3','meta/muse-spark-1.3'] as const){const request=prepareRouterRequest(()=> 'fictional-key',model,[{role:'system',content:'Neutral independent source-only review.'},{role:'user',content:JSON.stringify({persona:'fictional persona',evidence})}],{},16384,'max');expect(request.inputTokenBound).toBeLessThanOrEqual(150000);expect(request.reservedMicros).toBeLessThan(5000000/6);}
    expect(manifest.utf8Bytes).toBe(Buffer.byteLength(JSON.stringify(evidence)));expect(manifest.paths).not.toContain('src/pages/Index.tsx');
  });
  it('keeps package identity stable across JSONB object-key ordering but preserves excerpt array order',()=>{
    const a={sources:[{path:'first',excerpt:'one'},{path:'second',excerpt:'two'}],kind:'pinned_public_source'};
    const b={kind:'pinned_public_source',sources:[{excerpt:'one',path:'first'},{excerpt:'two',path:'second'}]};
    expect(canonicalEvidenceJson(a)).toBe(canonicalEvidenceJson(b));expect(canonicalReviewJson(a)).toBe(canonicalEvidenceJson(b));
    expect(canonicalReviewJson({...a,sources:[...a.sources].reverse()})).not.toBe(canonicalReviewJson(a));
  });
});
