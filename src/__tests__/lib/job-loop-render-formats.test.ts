// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderPacket } from '../../../supabase/functions/_shared/job-loop-render';
import type { LoopPacket, LoopProfileInput } from '../../../supabase/functions/_shared/job-loop-types';

const cv = 'محمد أحمد / Mohamed Ahmed\nFictional analyst. Prepared Excel reports and documented the limits of a university project. All data in this fixture is synthetic.';
const profile: LoopProfileInput = { audience: 'student', name: 'محمد أحمد / Mohamed Ahmed', contactLine: '', targetTitles: ['Analyst'], locations: ['Dubai'], experienceYears: null, languages: ['English', 'Arabic'], pageTarget: 2, discreetSearch: false, sourceText: cv, excludedTerms: [], compensation: { currency: 'AED', period: 'monthly', minimum: null } };
const packet: LoopPacket = { id: 'fictional-packet', runId: 'fictional-run', opportunityId: 'fictional-job', title: 'Analyst', company: 'Fictional company', inputHash: 'fictional-input', profileRevision: 1, claimVersions: {}, cvText: cv, evidenceText: 'Fictional source-linked review.', coverLetterText: '', connectionNote: '', messageText: '', emailSubject: '', emailBody: '', contact: null, assessment: { score: 50, method: 'Fixture', components: { role: 20, evidence: 20, constraints: 10 }, gaps: [], flags: [], claimIds: [] }, status: 'review_required', holdReasons: [], pageCount: null, createdAt: '2026-10-11T00:00:00Z', approvedAt: null, model: { provider: 'rules', model: 'fictional-rules', method: 'fixture' }, artifacts: {} };

describe('cloud document format isolation', () => {
  it('renders mixed Arabic and Latin names without preventing the review', async () => {
    const result = await renderPacket({ packet, profile });
    expect(result.packet.formatStatus?.pdf).toEqual({ ready: true, pageCount: 1 });
    expect(result.packet.status).toBe('review_required');
    expect(result.holdReasons).toEqual([]);
    expect(result.artifacts.pdf.bytes.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(result.artifacts.txt.bytes)).toBe(cv);
  });
  it('preserves ready DOCX and exact TXT when the PDF cannot display another script', async () => {
    const result = await renderPacket({ packet: { ...packet, cvText: cv + '\n工程师' }, profile });
    expect(result.packet.formatStatus?.pdf).toEqual({ ready: false, reason: 'PDF_FONT_UNSUPPORTED', pageCount: null });
    expect(result.packet.formatStatus?.docx?.ready).toBe(true);
    expect(result.packet.formatStatus?.txt?.ready).toBe(true);
    expect(result.packet.status).toBe('review_required');
    expect(result.artifacts.pdf).toBeUndefined();
    expect(new TextDecoder().decode(result.artifacts.txt.bytes)).toContain('工程师');
  });
  it('retains an overlong PDF for exact preview but blocks that format rather than all formats', async () => {
    const result = await renderPacket({ packet: { ...packet, cvText: Array.from({ length: 90 }, () => cv).join('\n') }, profile, pageTarget: 1 });
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.packet.formatStatus?.pdf?.reason).toBe('PAGE_TARGET_EXCEEDED');
    expect(result.packet.formatStatus?.pdf?.ready).toBe(false);
    expect(result.artifacts.pdf).toBeDefined();
    expect(result.packet.formatStatus?.txt?.ready).toBe(true);
    expect(result.packet.status).toBe('review_required');
  });
  it('keeps genuine factual and disclosure holds blocking the complete packet', async () => {
    const result = await renderPacket({ packet: { ...packet, holdReasons: ['UNCONFIRMED_CLAIM'] }, profile });
    expect(result.packet.status).toBe('held');
    expect(result.packet.holdReasons).toContain('UNCONFIRMED_CLAIM');
    const excluded = await renderPacket({ packet, profile: { ...profile, excludedTerms: ['synthetic'] } });
    expect(excluded.packet.status).toBe('held');
    expect(excluded.artifacts).toEqual({});
  });
});
