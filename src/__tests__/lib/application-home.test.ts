import { describe, expect, it } from 'vitest';
import { applicationHomeSource, buildApplicationHome, readApplicationHomeSelection } from '@/lib/application-home';
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
