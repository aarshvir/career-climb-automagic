// @vitest-environment node
/** Synthetic deterministic acceptance. No hosted database, browser, model, or customer is used. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateProfile, composePacket } from '../functions/_shared/job-loop-engine';
import { renderPacket } from '../functions/_shared/job-loop-render';
import { controlLoop, processLoopPhase } from '../functions/_shared/job-loop-runtime';
import { digest } from '../functions/_shared/job-loop-providers';
import { extractCvText } from '../../src/lib/cv-extraction';
import { blankLoopCvAnswers, buildLoopCvText } from '../../src/lib/loop-cv-builder';
import type { LoopClaim, LoopOpportunity, LoopPacket, LoopProfile } from '../functions/_shared/job-loop-types';
import type { LoopRepository, RecordRow, RunRow, RunState } from '../functions/_shared/job-loop-repository';

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', async () => {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  return { default: pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href };
});
beforeAll(() => vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser));
const now = '2026-10-17T00:00:00Z';
const groups = [
  ['student-first-role', 'student', 'academic_project', 'ACADEMIC PROJECTS', 'University project', 'Graduate analyst', 0],
  ['mba-operations', 'mba', 'academic_project', 'ACADEMIC PROJECTS', 'MBA capstone', 'Operations analyst', 2],
  ['early-career-engineer', 'professional', 'employment', 'EMPLOYMENT', 'Example Engineering', 'Software engineer', 3],
  ['experienced-manager', 'professional', 'employment', 'EMPLOYMENT', 'Example Operations', 'Operations manager', 8],
  ['career-switcher', 'professional', 'personal_project', 'PERSONAL PROJECTS', 'Portfolio project', 'Data analyst', 6],
  ['career-returner', 'professional', 'volunteering', 'VOLUNTEERING', 'Community reporting', 'Project coordinator', 7],
  ['international-graduate', 'student', 'internship', 'INTERNSHIPS', 'Example placement', 'Finance graduate', 1],
  ['contractor', 'professional', 'employment', 'EMPLOYMENT', 'Example Contract', 'Business analyst', 5],
  ['senior-specialist', 'professional', 'employment', 'EMPLOYMENT', 'Example Research', 'Research specialist', 10],
  ['first-time-volunteer', 'student', 'volunteering', 'VOLUNTEERING', 'Community project', 'Programme assistant', 0],
] as const;
const conditions = ['ready', 'remote', 'unknown-pay', 'discreet', 'unconfirmed-fact', 'private-fact', 'no-existing-cv', 'missing-target', 'chinese-script', 'projected-result'] as const;
type Condition = typeof conditions[number];
type Case = { id: string; group: typeof groups[number]; condition: Condition };
const cases: Case[] = groups.flatMap((group, g) => conditions.map((condition, c) => ({ id: `SIM-${String(g * 10 + c + 1).padStart(3, '0')}`, group, condition })));
const observations: Record<string, unknown>[] = [];
function fixture(s: Case) {
  const [, audience, kind, section, context, title, years] = s.group;
  const phrase = s.condition === 'projected-result'
    ? 'Prepared a reporting proposal with 12% projected time savings; the result was not measured.'
    : 'Prepared weekly reporting dashboards and documented assumptions for the team across 4 workstreams.';
  const name = s.condition === 'chinese-script' ? `王明 ${s.id}` : `Alex Example ${s.id}`;
  const profile: LoopProfile = {
    audience, name, contactLine: '', targetTitles: s.condition === 'missing-target' ? [] : [title],
    locations: [s.condition === 'remote' ? 'Remote' : 'Dubai'], experienceYears: years, languages: s.condition === 'chinese-script' ? ['Chinese', 'English'] : ['English'],
    pageTarget: 2, discreetSearch: s.condition === 'discreet', sourceText: s.condition === 'no-existing-cv' ? '' : `${name}\n${section}\n${context}\n${phrase}`,
    excludedTerms: [], compensation: { currency: 'AED', period: 'monthly', minimum: s.condition === 'unknown-pay' ? 15000 : null }, revision: 1, updatedAt: now,
  };
  const claim: LoopClaim = { id: `${s.id}-fact`, revision: 1, status: 'active', createdAt: now, sourceKind: 'cv_passage', sourceQuote: phrase, phrasing: phrase, context, kind,
    resultStatus: s.condition === 'projected-result' ? 'projected' : 'not_measured', confirmed: s.condition !== 'unconfirmed-fact', shareable: s.condition !== 'private-fact' };
  const opportunity: LoopOpportunity = { id: crypto.randomUUID(), title, company: 'Example employer', location: profile.locations[0], url: 'https://careers.example.com/role',
    description: `We need a ${title} to prepare reporting dashboards, document assumptions, and explain team contributions. VacancyOnlySentinel is a requirement, not candidate experience.`,
    contact: null, source: 'manual', sourceKey: `manual:${s.id}`, checkedAt: now, verification: 'user_provided', status: 'saved', followUpAt: null, notes: '' };
  return { profile, claim, opportunity };
}

describe('100 synthetic customer kinds: executable source, consent, and export checks', () => {
  it.each(cases)('$id $group.0 / $condition', async s => {
    const { profile, claim, opportunity } = fixture(s);
    const { revision: _revision, updatedAt: _updated, ...input } = profile;
    if (s.condition === 'no-existing-cv') {
      expect(() => validateProfile(input)).toThrow();
      observations.push({ id: s.id, customerKind: s.group[0], condition: s.condition, outcome: 'blocked', reason: 'Current Loop profile requires 80 source characters; guided no-CV creation is a separate unmet customer requirement.' });
      return;
    }
    expect(validateProfile(input).sourceText).toBe(profile.sourceText);
    if (s.condition === 'missing-target') {
      // Characterization of an observed gap, not an assertion that an empty search target is acceptable UX.
      observations.push({ id: s.id, customerKind: s.group[0], condition: s.condition, outcome: 'gap', reason: 'Profile validation accepts zero target titles; broad discovery needs admission/guidance for a role query. Manual selected-vacancy preparation may reasonably omit general targets.' });
      return;
    }
    const packet = await composePacket({ profile, claims: [claim], opportunity, runId: crypto.randomUUID() });
    if (['unconfirmed-fact', 'private-fact'].includes(s.condition)) {
      expect(packet.status).toBe('held');
      expect(packet.cvText).not.toContain(claim.phrasing);
      observations.push({ id: s.id, customerKind: s.group[0], condition: s.condition, outcome: 'protected-hold', reason: 'Unconfirmed or private evidence cannot become an exportable factual CV.' });
      return;
    }
    expect(packet.status).toBe('review_required');
    expect(packet.approvedAt).toBeNull();
    expect(packet.cvText).toContain(claim.phrasing);
    expect(packet.cvText).not.toContain('VacancyOnlySentinel');
    if (s.condition === 'unknown-pay') expect(packet.assessment.flags).toContain('PAY_NOT_ESTABLISHED');
    if (s.condition === 'discreet') expect(packet.assessment.flags).toContain('DISCREET_SEARCH_REVIEW');
    const rendered = await renderPacket({ packet, profile });
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toBe(packet.cvText);
    const docx = await extractCvText(new File([rendered.artifacts.docx.bytes], 'candidate.docx'));
    expect(docx).toContain(profile.name); expect(docx).toContain(claim.phrasing); expect(docx).not.toContain('VacancyOnlySentinel');
    if (s.condition === 'chinese-script') {
      expect(rendered.packet.formatStatus?.pdf).toMatchObject({ ready: false, reason: 'PDF_FONT_UNSUPPORTED' });
      expect(rendered.artifacts.pdf).toBeUndefined();
    } else {
      const pdf = await extractCvText(new File([rendered.artifacts.pdf.bytes], 'candidate.pdf'));
      expect(pdf).toContain(profile.name); expect(pdf.replace(/\s+/g, ' ')).toContain(claim.phrasing); expect(pdf).not.toContain('VacancyOnlySentinel');
      expect(rendered.packet.formatStatus?.pdf?.ready).toBe(true);
    }
    observations.push({ id: s.id, customerKind: s.group[0], condition: s.condition, outcome: s.condition === 'chinese-script' ? 'format-limitation' : 'review-ready', pdfReady: rendered.packet.formatStatus?.pdf?.ready, docxParsed: true, txtExact: true });
  });
});

describe('additional no-existing-CV acceptance after guided builder implementation', () => {
  it.each(groups)('%s builds a truthful usable first source from explicit answers', (...group) => {
    const s = { id: 'BUILDER', group: group as unknown as typeof groups[number], condition: 'ready' as const };
    const f = fixture(s);
    const sourceText = buildLoopCvText({ ...blankLoopCvAnswers(), name: f.profile.name, experience: `${group[4]}\n${f.claim.phrasing}`, education: 'Example College: completed the stated programme.' });
    expect(sourceText).toContain(f.claim.phrasing);
    expect(sourceText).not.toMatch(/VacancyOnlySentinel|increased revenue|Harvard/);
    const { revision: _revision, updatedAt: _updated, ...input } = f.profile;
    expect(validateProfile({ ...input, sourceText }).sourceText).toBe(sourceText);
  });
});

function workerHarness() {
  const f = fixture(cases[0]);
  const owner = crypto.randomUUID();
  const record: RecordRow = { user_id: owner, lifecycle_generation: 0, version: 1, input_version: 1, updated_at: now,
    data: { profile: f.profile, claims: [f.claim], opportunities: [f.opportunity, { ...f.opportunity, id: crypto.randomUUID(), title: 'Reporting analyst', company: 'Second example employer', sourceKey: 'manual:second', description: f.opportunity.description.replace('VacancyOnlySentinel', 'SecondVacancyOnlySentinel') }], inbox: [] } };
  const runs: RunRow[] = [], packets: LoopPacket[] = [], artifacts = new Map<string, Uint8Array>();
  let active: RunRow;
  const network = vi.fn(() => { throw new Error('No provider or employer network is authorized in this local acceptance test.'); });
  const mock = {
    claimRun: vi.fn(async (runId: string) => { active = runs.find(r => r.id === runId)!; active.lease_token = crypto.randomUUID(); active.status = 'running'; return structuredClone(active); }),
    record: vi.fn(async (user: string) => { expect(user).toBe(owner); return structuredClone(record); }),
    assertGeneration: vi.fn(async (user: string, generation: number) => { expect(user).toBe(owner); expect(generation).toBe(0); }),
    collections: vi.fn(async () => ({ runs, packets: packets.map(data => ({ id: data.id, user_id: owner, input_version: record.input_version, status: data.status, data })), usage: [], connection: null })),
    operationalSnapshot: vi.fn(async () => ({ schedule: null, activity: [], support: [], scheduler: { ready: false }, budget: { month: '2026-10', capUsd: 50, committedUsd: 0, remainingUsd: 50, enrolled: true, activeUsers: 1 } })),
    commit: vi.fn(async (run: RunRow, phase: number, status: RunRow['status'], state: RunState, values: LoopPacket[] = [], opportunities: LoopOpportunity[] = []) => {
      expect(run.lease_token).toBe(active.lease_token); active.phase = phase; active.status = status; active.data = structuredClone(state); active.lease_token = null; packets.push(...structuredClone(values));
      for (const opportunity of opportunities) { const index = record.data.opportunities.findIndex(o => o.id === opportunity.id); if (index >= 0) record.data.opportunities[index] = structuredClone(opportunity); else record.data.opportunities.push(structuredClone(opportunity)); }
      return structuredClone(active);
    }),
    upload: vi.fn(async (run: RunRow, packet: string, key: string, bytes: Uint8Array) => { const path = `${run.user_id}/${packet}/${await digest(bytes)}/${key}`; artifacts.set(path, bytes); return path; }),
    packet: vi.fn(async (user: string, id: string) => { expect(user).toBe(owner); const data = packets.find(p => p.id === id)!; return { id, user_id: owner, input_version: record.input_version, status: data.status, data }; }),
    signedArtifact: vi.fn(async (user: string, packet: LoopPacket, format: string) => { expect(user).toBe(owner); return `https://storage.example.test/${packet.artifacts[format].path}`; }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'job_loop_add_activity') return null;
      // SQL authority is a local adapter here; the real routine has separate native/PGlite coverage.
      if (name !== 'job_loop_approve_packet') throw new Error(`Unexpected RPC ${name}`);
      const packet = packets.find(p => p.id === args.p_packet)!;
      if (packet.inputHash !== args.p_hash || packet.cvText !== args.p_text || packet.holdReasons.length) throw new Error('Exact artifact approval required.');
      packet.status = 'approved'; packet.approvedAt = now; return null;
    }),
    reserve: vi.fn(() => { throw new Error('Paid reservation forbidden.'); }),
  };
  const repo = mock as unknown as LoopRepository;
  function newRun(index: number) {
    const id = crypto.randomUUID();
    const run: RunRow = { id, user_id: owner, request_id: id, request_hash: 'a'.repeat(64), input_hash: 'b'.repeat(64), input_version: 1, lifecycle_generation: 0, selected_generation: 0,
      selected_opportunity_ids: record.data.opportunities[index] ? [record.data.opportunities[index].id] : [], snapshot: structuredClone(record.data), provider: 'rules', model: 'grounded-rules-v1', consents: { model: false, inbox: false }, data: {}, status: 'queued', phase: 0, lease_token: null, lease_until: null, created_at: now, finished_at: null };
    runs.push(run); return run;
  }
  async function drain(run: RunRow) { for (let i = 0; i < 12; i++) if (!await processLoopPhase(repo, run.id, () => undefined, network)) return; throw new Error('Worker failed to terminate.'); }
  return { owner, record, repo, mock, network, runs, packets, artifacts, newRun, drain };
}

describe('two consecutive actual selected-worker preparations through approval and parsed exports', () => {
  it('prepares distinct applications, requires explicit exact approval, and serves only their own rendered artifacts', async () => {
    const h = workerHarness();
    for (const index of [0, 1]) {
      const run = h.newRun(index); await h.drain(run);
      expect(run.status).toBe('completed'); expect(h.packets).toHaveLength(index + 1);
      const packet = h.packets[index];
      expect(packet.opportunityId).toBe(h.record.data.opportunities[index].id); expect(packet.runId).toBe(run.id);
      expect(packet.status).toBe('review_required'); expect(packet.approvedAt).toBeNull();
      const download = { action: 'download' as const, expectedGeneration: 0, packetId: packet.id, format: 'txt' as const };
      await expect(controlLoop(h.repo, h.owner, download, () => undefined, h.network)).rejects.toMatchObject({ code: 'LOOP_APPROVAL_REQUIRED' });
      const approve = { action: 'approve_packet' as const, expectedGeneration: 0, packetId: packet.id, inputHash: packet.inputHash, reviewedText: packet.cvText, confirmFacts: true, confirmDisclosure: true };
      await expect(controlLoop(h.repo, h.owner, { ...approve, confirmDisclosure: false }, () => undefined, h.network)).rejects.toMatchObject({ code: 'LOOP_APPROVAL_REQUIRED' });
      await expect(controlLoop(h.repo, h.owner, { ...approve, reviewedText: packet.cvText + '\nUnreviewed change' }, () => undefined, h.network)).rejects.toThrow('Exact artifact');
      await controlLoop(h.repo, h.owner, approve, () => undefined, h.network);
      expect(packet.status).toBe('approved');
      for (const format of ['pdf', 'docx', 'txt'] as const) {
        const response = await controlLoop(h.repo, h.owner, { ...download, format }, () => undefined, h.network);
        const artifact = packet.artifacts[format], bytes = h.artifacts.get(artifact.path)!;
        expect(response.url).toBe(`https://storage.example.test/${artifact.path}`); expect(await digest(bytes)).toBe(artifact.sha256);
        const parsed = await extractCvText(new File([bytes], `candidate.${format}`));
        expect(parsed).toContain(h.record.data.profile!.name); expect(parsed.replace(/\s+/g, ' ')).toContain(h.record.data.claims[0].phrasing);
        expect(parsed).not.toMatch(/(?:Second)?VacancyOnlySentinel/);
        if (format === 'txt') expect(parsed).toBe(packet.cvText);
      }
    }
    expect(h.packets[0].id).not.toBe(h.packets[1].id); expect(h.packets[0].inputHash).not.toBe(h.packets[1].inputHash);
    const original = structuredClone(h.packets); const retry = h.newRun(0); h.mock.upload.mockClear(); await h.drain(retry);
    expect(h.packets).toEqual(original); expect(retry.data.reusedPacketIds).toEqual([original[0].id]); expect(h.mock.upload).not.toHaveBeenCalled();
    expect(h.network).not.toHaveBeenCalled(); expect(h.mock.reserve).not.toHaveBeenCalled();
    if (process.env.LOOP_BROWSER_FIXTURE === '1') {
      const directory = '.tmp/loop-product-browser'; mkdirSync(`${directory}/artifacts`, { recursive: true });
      // Snapshot uses the same production projection as control responses; no hosted record exists.
      const approved = await controlLoop(h.repo, h.owner, { action: 'approve_packet', expectedGeneration: 0, packetId: h.packets[0].id, inputHash: h.packets[0].inputHash, reviewedText: h.packets[0].cvText, confirmFacts: true, confirmDisclosure: true }, () => undefined);
      writeFileSync(`${directory}/worker-fixture.json`, JSON.stringify({ owner: h.owner, snapshot: approved.snapshot, provenance: 'Actual local selected-worker and render output; repository, SQL approval and object storage adapters are in-memory. Browser actions replay these artifacts, not a hosted worker.' }, null, 2));
      for (const packet of h.packets) for (const [format, artifact] of Object.entries(packet.artifacts)) writeFileSync(`${directory}/artifacts/${packet.id}.${format}`, h.artifacts.get(artifact.path)!);
    }
  });
});

describe('actual discovery worker with intercepted employer HTTP fixtures', () => {
  it('finds a matching vacancy, rejects a wrong-location vacancy, renders its CV, and retains it next run', async () => {
    const h = workerHarness(); h.record.data.opportunities = [];
    const feed = JSON.stringify([{ provider: 'greenhouse', board: 'example', company: 'Example employer' }]);
    const env = (name: string) => name === 'JOB_LOOP_EMPLOYER_FEEDS' ? feed : undefined;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true');
      return new Response(JSON.stringify({ jobs: [
        { id: 101, title: 'Graduate analyst', location: { name: 'Dubai' }, absolute_url: 'https://careers.example.com/101', content: 'Prepare weekly reporting dashboards and explain documented assumptions for the team. VacancyOnlySentinel is not candidate experience.' },
        { id: 102, title: 'Graduate analyst', location: { name: 'London' }, absolute_url: 'https://careers.example.com/102', content: 'This position requires reporting dashboards and documentation but is based in London, not a remote vacancy.' },
      ] }), { headers: { 'Content-Type': 'application/json' } });
    });
    const run = h.newRun(0); delete run.selected_opportunity_ids; delete run.selected_generation;
    for (let i = 0; i < 12; i++) if (!await processLoopPhase(h.repo, run.id, env, fetcher)) break;
    expect(h.record.data.opportunities).toHaveLength(1); expect(h.packets).toHaveLength(1);
    expect(h.record.data.opportunities[0]).toMatchObject({ source: 'employer_api', location: 'Dubai', verification: 'listed_on_source' });
    expect(h.packets[0].cvText).toContain(h.record.data.claims[0].phrasing); expect(h.packets[0].cvText).not.toContain('VacancyOnlySentinel');
    const artifact = h.packets[0].artifacts.pdf;
    expect(await extractCvText(new File([h.artifacts.get(artifact.path)!], 'discovered.pdf'))).toContain(h.record.data.profile!.name);
    expect(run.status).toBe('completed'); // Only the configured, successfully read sources define completion.
    expect(run.data.lanes).toContainEqual(expect.objectContaining({ name: 'Broad web search', status: 'not_run' }));
    const second = h.newRun(0); delete second.selected_opportunity_ids; delete second.selected_generation; h.mock.upload.mockClear();
    for (let i = 0; i < 12; i++) if (!await processLoopPhase(h.repo, second.id, env, fetcher)) break;
    expect(h.packets).toHaveLength(1); expect(second.data.reusedPacketIds).toEqual([h.packets[0].id]); expect(h.mock.upload).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2); expect(h.mock.reserve).not.toHaveBeenCalled();
    // A later incomplete/failed source read is not evidence that the job closed,
    // but must not silently recycle it as a freshly discovered match either.
    const unavailable = h.newRun(0); delete unavailable.selected_opportunity_ids; delete unavailable.selected_generation;
    const failedFeed = vi.fn(async () => new Response('', {status:503}));
    for (let i = 0; i < 12; i++) if (!await processLoopPhase(h.repo, unavailable.id, env, failedFeed)) break;
    expect(h.record.data.opportunities[0].verification).toBe('unverified');
    expect(unavailable.data.reusedPacketIds).toEqual([]); expect(h.packets).toHaveLength(1); expect(h.mock.upload).not.toHaveBeenCalled();
    expect(unavailable.data.messages?.join(' ')).toContain('availability is unknown');
    // The same source can recover without duplicating rows or charging/preparing
    // unchanged packets again. Prior exports and application history survive.
    const recovered = h.newRun(0); delete recovered.selected_opportunity_ids; delete recovered.selected_generation;
    for (let i = 0; i < 12; i++) if (!await processLoopPhase(h.repo, recovered.id, env, fetcher)) break;
    expect(h.record.data.opportunities).toHaveLength(1); expect(h.record.data.opportunities[0].verification).toBe('listed_on_source');
    expect(recovered.data.reusedPacketIds).toEqual([h.packets[0].id]); expect(h.packets).toHaveLength(1); expect(h.mock.upload).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  if (process.env.LOOP_SIMULATION_REPORT !== '1') return;
  const directory = 'docs/audits/2026-10-17-loop-product-reset'; mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/customer-simulation.json`, JSON.stringify({
    generatedAt: new Date().toISOString(), method: '10 career contexts crossed with 10 distinct constraints; deterministic actual engine and renderer tests. No scored personas, paid models, real customers, browser sessions, hosted persistence, or unassisted acceptance.',
    intendedScenarios: 100, observedScenarios: observations.length, counts: observations.reduce<Record<string, number>>((out, r) => { const k = String(r.outcome); out[k] = (out[k] ?? 0) + 1; return out; }, {}),
    scenarios: observations.sort((a, b) => String(a.id).localeCompare(String(b.id))),
  }, null, 2) + '\n');
});
