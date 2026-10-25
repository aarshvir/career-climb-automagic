import { describe, expect, it } from 'vitest';
import { applicationHomeSource, buildApplicationHome, readApplicationHomeSelection, resolveApplicationHomeSelection } from '@/lib/application-home';
import type { ApplicationPack, TrackedApplication } from '@/lib/cv-database';
import type { FreeCvCheck } from '@/lib/free-check-api';
import type { LoopPacket, LoopSnapshot } from '../../../supabase/functions/_shared/job-loop-types';

const id = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222', third = '33333333-3333-4333-8333-333333333333';
const date = '2026-10-15T10:00:00Z';
function check(extra: Partial<FreeCvCheck> = {}): FreeCvCheck { return { id, user_id: 'owner', request_id: id, job_title: 'Analyst', company: 'Acme', job_description: 'Exact saved vacancy', original_text: 'Original private input', reviewed_text: 'Exact reviewed final wording', method_version: 'test', status: 'approved', created_at: date, updated_at: date, ...extra }; }
function pack(extra: Partial<ApplicationPack> = {}): ApplicationPack { return { id, user_id: 'owner', request_id: id, resume_id: null, job_title: 'Analyst', company: 'Acme', job_description: 'Exact pack vacancy', original_text: 'Pack original', tailored_text: 'Pack final', job_url: 'https://employer.example.invalid/job', matched_keywords: [], missing_keywords: [], status: 'approved', created_at: date, ...extra }; }
function tracker(extra: Partial<TrackedApplication> = {}): TrackedApplication { return { id: second, user_id: 'owner', pack_id: null, job_title: 'Analyst', company: 'Acme', job_url: null, status: 'interview', notes: 'Exact notes', applied_at: date, follow_up_at: '2026-10-20', created_at: date, updated_at: date, ...extra }; }
function snapshot(): LoopSnapshot { return { lifecycleGeneration: 7, recordVersion: 2, profile: { revision: 2, pageTarget: 2 }, claims: [{ id: 'claim', revision: 1, status: 'active', confirmed: true, shareable: true }], opportunities: [{ id, title: 'Analyst', company: 'Acme', description: 'Exact Loop vacancy', url: 'https://employer.example.invalid/job', status: 'saved', notes: 'Loop notes', followUpAt: null, checkedAt: date }], packets: [], runs: [] } as unknown as LoopSnapshot; }
function packet(extra: Partial<LoopPacket> = {}): LoopPacket { return { id: second, opportunityId: id, status: 'approved', profileRevision: 2, claimVersions: { claim: 1 }, pageCount: 1, holdReasons: [], cvText: 'Exact packet wording', evidenceText: 'Source evidence', createdAt: date, ...extra } as LoopPacket; }
const empty = () => ({ checks: [], packs: [], trackers: [], loop: null });
function linkedLoop() { const loop = snapshot(); Object.assign(loop.opportunities[0], { source: 'manual', sourceKey: `saved-check:${id}`, sourceCheckId: id }); return loop; }

describe('exact check and Loop home relationship', () => {
  it('joins only exact provenance while preserving both wordings, actions, progress and output attempts', () => {
    const loop = linkedLoop(); loop.packets = [packet({ status: 'held', holdReasons: ['Confirm source'] }), packet({ id: third, status: 'revoked' })];
    const input = { ...empty(), checks: [check()], trackers: [tracker({ id, cv_check_id: id })], loop: { existingState: 'active' as const, snapshot: loop } };
    const before = JSON.stringify(input), rows = buildApplicationHome('owner', input), [row] = rows;
    expect(rows).toHaveLength(1); expect(row.id).toBe(`check:${id}`); expect(row.sourceLabel).toBe('Saved application');
    expect(row.vacancy).toBe('Exact saved vacancy'); expect(row.relatedSources?.[0]).toMatchObject({ id: `loop:7:${id}`, vacancy: 'Exact Loop vacancy', href: `/loop?opportunity=${id}&generation=7` });
    expect(row.documents.map(item => item.text)).toEqual(['Exact reviewed final wording', 'Original private input', 'Exact packet wording', 'Exact packet wording']);
    expect(row.documents.slice(2).map(item => item.state)).toEqual(['Held for review', 'Revoked output']);
    expect(row.progress.map(item => [item.sourceLabel, item.status, item.notes])).toEqual([['Saved-check tracking', 'interview', 'Exact notes'], ['Automated Job Loop progress', 'saved', 'Loop notes']]);
    expect(row.progress.map(item => item.href)).toEqual([`/dashboard?tracked=${id}`, `/loop?opportunity=${id}&generation=7`]);
    expect(resolveApplicationHomeSelection(rows, `loop:7:${id}`)).toBe(row);
    expect(resolveApplicationHomeSelection(rows, `loop:6:${id}`)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  });
  it('retains unrelated checks, packs and manual vacancies with identical wording', () => {
    const loop = linkedLoop(); loop.opportunities.push({ ...loop.opportunities[0], id: second, sourceCheckId: undefined, sourceKey: 'url:separate' });
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check(), check({ id: third })], packs: [pack()], loop: { existingState: 'active', snapshot: loop } });
    expect(new Set(rows.map(row => row.id))).toEqual(new Set([`check:${id}`, `check:${third}`, `pack:${id}`, `loop:7:${second}`]));
  });
  it.each([{ checks: [] }, { checks: [check({ user_id: 'other' })] }])('retains a linked vacancy when its owned check is not loaded', ({ checks }) => {
    const [row] = buildApplicationHome('owner', { ...empty(), checks, loop: { existingState: 'active', snapshot: linkedLoop() } });
    expect(row.id).toBe(`loop:7:${id}`); expect(row.note).toContain('not in the currently loaded check list');
    expect(row.progress[0].notes).toBe('Loop notes'); expect(row.relatedSources).toBeUndefined(); expect(row.documents).toEqual([]);
  });
  it.each([{ source: 'web_search' }, { sourceKey: 'url:wrong' }, { sourceCheckId: '' }, { sourceCheckId: '../bad' }])('keeps malformed provenance separate: %j', patch => {
    const loop = linkedLoop(); Object.assign(loop.opportunities[0], patch);
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], loop: { existingState: 'active', snapshot: loop } });
    expect(rows).toHaveLength(2); expect(rows.find(row => row.source === 'loop')?.note).toContain('conflicting');
    expect(rows.find(row => row.source === 'checks')?.relatedSources).toBeUndefined();
  });
  it('does not hide either vacancy when two links point at the same check', () => {
    const loop = linkedLoop(); loop.opportunities.push({ ...loop.opportunities[0], id: second, notes: 'Second record' });
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], loop: { existingState: 'active', snapshot: loop } });
    expect(rows).toHaveLength(3); expect(rows.filter(row => row.source === 'loop').every(row => row.note.includes('conflicting'))).toBe(true);
    expect(rows.find(row => row.source === 'checks')?.progress).toEqual([]);
  });
  it('never matches a previous-lifetime bookmark to a fresh relationship', () => {
    const loop = linkedLoop(); loop.lifecycleGeneration = 9;
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], loop: { existingState: 'active', snapshot: loop } });
    expect(resolveApplicationHomeSelection(rows, `loop:7:${id}`)).toBeUndefined();
    expect(resolveApplicationHomeSelection(rows, `loop:9:${id}`)?.id).toBe(`check:${id}`);
  });
  it('keeps two applications independent even when all their titles and employers are the same', () => {
    const loop = linkedLoop(); loop.opportunities.push({ ...loop.opportunities[0], id: second, sourceCheckId: third, sourceKey: `saved-check:${third}`, notes: 'Second vacancy notes' });
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check(), check({ id: third, reviewed_text: 'Second CV wording' })], loop: { existingState: 'active', snapshot: loop } });
    expect(rows).toHaveLength(2);
    expect(resolveApplicationHomeSelection(rows, `loop:7:${id}`)?.documents[0].text).toBe('Exact reviewed final wording');
    expect(resolveApplicationHomeSelection(rows, `loop:7:${second}`)?.documents[0].text).toBe('Second CV wording');
    expect(resolveApplicationHomeSelection(rows, `loop:7:${second}`)?.progress[0].notes).toBe('Second vacancy notes');
  });
  it('does not join two conflicting copies of the same opportunity identifier', () => {
    const loop = linkedLoop(); loop.opportunities.push({ ...loop.opportunities[0], sourceCheckId: third, sourceKey: `saved-check:${third}` });
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check(), check({ id: third })], loop: { existingState: 'active', snapshot: loop } });
    expect(rows).toHaveLength(4); expect(rows.every(row => !row.relatedSources)).toBe(true);
    expect(resolveApplicationHomeSelection(rows, `loop:7:${id}`)).toBeUndefined();
  });
  it('does not let an ambiguous source alias select the first record', () => {
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], loop: { existingState: 'active', snapshot: linkedLoop() } });
    expect(resolveApplicationHomeSelection([...rows, { ...rows[0], id: `check:${second}` }], `loop:7:${id}`)).toBeUndefined();
  });
});

describe('Applications home read-only projection', () => {
  it('keeps identical titles and raw IDs distinct across their actual sources', () => {
    const rows = buildApplicationHome('owner', { checks: [check()], packs: [pack()], trackers: [tracker({ id })], loop: { existingState: 'active', snapshot: snapshot() } });
    expect(new Set(rows.map(row => row.id))).toEqual(new Set([`check:${id}`, `pack:${id}`, `tracker:${id}`, `loop:7:${id}`]));
    expect(rows.map(row => row.href)).toEqual(expect.arrayContaining([`/check?savedCheck=${id}`, `/dashboard?pack=${id}`, `/dashboard?tracked=${id}`, `/loop?opportunity=${id}&generation=7`]));
  });
  it('retains every actual pack-linked tracking entry and keeps manual/orphan records separate', () => {
    const rows = buildApplicationHome('owner', { ...empty(), packs: [pack()], trackers: [tracker({ pack_id: id }), tracker({ id: third, pack_id: id, status: 'offer', notes: 'Second attempt' }), tracker({ id, pack_id: 'unresolved' }), tracker({ id: 'manual', pack_id: null })] });
    const packed = rows.find(row => row.source === 'packs')!;
    expect(packed.progress.map(row => [row.id, row.status, row.notes])).toEqual([[second, 'interview', 'Exact notes'], [third, 'offer', 'Second attempt']]);
    expect(rows.filter(row => row.source === 'trackers').map(row => row.id)).toEqual(expect.arrayContaining([`tracker:${id}`, 'tracker:manual']));
  });
  it('groups progress only by an exact owned saved check link, retaining unrelated same-title work', () => {
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], packs: [pack()], trackers: [tracker({ cv_check_id: id, updated_at: '2026-10-17T12:00:00Z' }), tracker({ id: third }), tracker({ id: 'pack-tracker', pack_id: id })] });
    expect(rows).toHaveLength(3);
    const checked = rows.find(row => row.id === `check:${id}`)!;
    expect(checked.progress).toEqual([expect.objectContaining({ id: second, status: 'interview', notes: 'Exact notes', appliedAt: date, followUpAt: '2026-10-20', href: `/dashboard?tracked=${second}` })]);
    expect(checked.lastRecordedAt).toBe('2026-10-17T12:00:00Z');
    expect(rows[0].id).toBe(`check:${id}`);
    expect(rows.find(row => row.id === `pack:${id}`)?.progress.map(row => row.id)).toEqual(['pack-tracker']);
    expect(rows.find(row => row.id === `tracker:${third}`)).toBeDefined();
  });
  it('retains tracker notes and exact destination when the linked check is unavailable or deleted', () => {
    for (const checks of [[], [check({ user_id: 'other' })]]) {
      const [row] = buildApplicationHome('owner', { ...empty(), checks, trackers: [tracker({ cv_check_id: id })] });
      expect(row.id).toBe(`tracker:${second}`);
      expect(row.progress[0].notes).toBe('Exact notes');
      expect(row.href).toBe(`/dashboard?tracked=${second}`);
      expect(row.documents).toEqual([]);
      expect(row.note).toContain('linked saved check is not in');
    }
    const [detached] = buildApplicationHome('owner', { ...empty(), trackers: [tracker({ cv_check_id: null })] });
    expect(detached.progress[0].status).toBe('interview');
  });
  it('never attributes foreign-owner or unlinked tracking to an owned saved check', () => {
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], trackers: [tracker({ user_id: 'other', cv_check_id: id }), tracker({ id: third, cv_check_id: second })] });
    expect(rows.find(row => row.source === 'checks')?.progress).toEqual([]);
    expect(rows.find(row => row.source === 'trackers')?.id).toBe(`tracker:${third}`);
  });
  it('keeps contradictory check and pack links separate instead of attributing progress twice', () => {
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check()], packs: [pack()], trackers: [tracker({ pack_id: id, cv_check_id: id })] });
    expect(rows).toHaveLength(3);
    expect(rows.filter(row => row.source !== 'trackers').every(row => row.progress.length === 0)).toBe(true);
    expect(rows.find(row => row.source === 'trackers')?.note).toContain('conflicting');
  });
  it('never makes an approved check into a submitted application or revives approval', () => {
    const [row] = buildApplicationHome('owner', { ...empty(), checks: [check()] });
    expect(row.progress).toEqual([]); expect(row.note).toContain('fresh review');
    expect(row.documents.map(document => document.text)).toEqual(['Exact reviewed final wording', 'Original private input']);
    expect(row.href).toBe(`/check?savedCheck=${id}`);
  });
  it('keeps all exact-opportunity packet attempts and distinguishes held, revoked, stale and current', () => {
    const loop = snapshot(); loop.packets = [packet(), packet({ id: 'held', status: 'held', holdReasons: ['Review a fact'] }), packet({ id: 'revoked', status: 'revoked' }), packet({ id: 'stale', profileRevision: 1 }), packet({ id: 'other', opportunityId: third })];
    const [row] = buildApplicationHome('owner', { ...empty(), loop: { existingState: 'active', snapshot: loop } });
    expect(row.documents).toHaveLength(4); expect(row.documents.map(document => document.state)).toEqual(['Approved output saved — reopen to review formats', 'Held for review', 'Revoked output', 'Source facts changed — review needed']);
    expect(row.note).toContain('recent loaded');
  });
  it('requires current source facts and usable format even for an approved packet', () => {
    const loop = snapshot(); loop.packets = [packet({ formatStatus: { pdf: { ready: false } } }), packet({ id: 'withdrawn', claimVersions: { missing: 1 } }), packet({ id: 'unreviewed', status: 'review_required' })];
    const [row] = buildApplicationHome('owner', { ...empty(), loop: { existingState: 'active', snapshot: loop } });
    expect(row.documents.map(document => document.state)).toEqual(['Approved text — format check needed', 'Source facts changed — review needed', 'Review required']);
  });
  it('does not expose another owner or absent/erasing/unknown generation documents', () => {
    expect(buildApplicationHome('owner', { ...empty(), checks: [check({ user_id: 'other' })], packs: [pack({ user_id: 'other' })], trackers: [tracker({ user_id: 'other' })] })).toEqual([]);
    for (const loop of [{ existingState: 'absent' }, { existingState: 'erasing', erasureGeneration: 8 }, { existingState: 'active', snapshot: { ...snapshot(), lifecycleGeneration: undefined } }] as const) expect(buildApplicationHome('owner', { ...empty(), loop })).toEqual([]);
  });
  it('does not invent a continuation for malformed IDs or unsafe employer URLs', () => {
    const [row] = buildApplicationHome('owner', { ...empty(), packs: [pack({ id: '../other', job_url: 'https://user:secret@example.invalid' })] });
    expect(row.href).toBeNull(); expect(row.employerUrl).toBeNull();
  });
  it('sorts known dates without treating an invalid date as recent', () => {
    const rows = buildApplicationHome('owner', { ...empty(), checks: [check({ id: second, created_at: 'invalid', updated_at: '' }), check()] });
    expect(rows.map(row => row.id)).toEqual([`check:${id}`, `check:${second}`]); expect(rows[1].lastRecordedAt).toBeNull();
  });
  it('bounds local selection to one exact source identity and never selects a fallback', () => {
    expect(readApplicationHomeSelection(`?item=${encodeURIComponent(`loop:7:${id}`)}`)).toEqual({ id: `loop:7:${id}`, invalid: false });
    for (const value of [`?item=check:${id}&item=pack:${id}`, `?item=loop:-1:${id}`, `?item=loop:99999999999999999999:${id}`, '?item=anything', '?other=x']) expect(readApplicationHomeSelection(value)).toEqual({ id: null, invalid: true });
    expect(readApplicationHomeSelection('')).toEqual({ id: null, invalid: false });
    expect(readApplicationHomeSelection('?item=check:AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA').id).toBe('check:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(applicationHomeSource(`tracker:${id}`)).toBe('trackers');
  });
});
