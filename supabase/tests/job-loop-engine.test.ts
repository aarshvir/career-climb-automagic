// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateProfile, validateClaim, validateOpportunity, validateAction, suggestClaims, assessOpportunity, composePacket, fingerprintLoopInputs } from '../functions/_shared/job-loop-engine.ts';
import { renderPacket } from '../functions/_shared/job-loop-render.ts';
import type { LoopProfile, LoopClaim, LoopOpportunity } from '../functions/_shared/job-loop-types.ts';
import { unzipSync, strFromU8 } from 'fflate';

const project = 'Helped design a procurement pilot across 5 units, with 8% projected savings.';
const internship = 'Created a tracker covering 6 workstreams.';
const education = 'MBA coursework in operations and business analysis.';
const source = ['Alex Morgan', 'ACADEMIC PROJECTS', 'Example University capstone', project, 'INTERNSHIPS', 'Example Advisory internship', internship, 'EDUCATION', 'Example University', education].join('\n');
const profile: LoopProfile = { audience: 'mba', name: 'Alex Morgan', contactLine: 'alex@example.com', targetTitles: ['Product Intern', 'Finance Graduate', 'Transformation Analyst'], locations: ['Remote'], experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true, sourceText: source, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null }, revision: 1, updatedAt: '2026-10-11T00:00:00Z' };
const claim = (id: string, phrasing: string, kind: LoopClaim['kind'], context: string, resultStatus: LoopClaim['resultStatus'] = 'not_measured'): LoopClaim => ({ id, revision: 1, status: 'active', createdAt: '2026-10-11T00:00:00Z', sourceKind: 'cv_passage', sourceQuote: phrasing, phrasing, context, kind, resultStatus, confirmed: true, shareable: true });
const claims = [claim('project', project, 'academic_project', 'Example University capstone', 'projected'), claim('internship', internship, 'internship', 'Example Advisory internship'), claim('education', education, 'education', 'Example University')];
const opportunity: LoopOpportunity = { id: 'opportunity-1', title: 'Product Intern', company: 'Example Group', location: 'Remote', url: 'https://example.com/careers/product-intern', description: 'Contribute to a procurement pilot and maintain a tracker covering workstreams. This internship includes business analysis and operations coursework projects.', contact: null, source: 'manual', sourceKey: 'manual-1', checkedAt: '2026-10-11T00:00:00Z', verification: 'user_provided', status: 'saved', followUpAt: null, notes: '' };
function claimInput(c: LoopClaim) { const { id: _id, revision: _revision, status: _status, createdAt: _date, ...input } = c; return input; }
function profileInput() { const { revision: _revision, updatedAt: _date, ...input } = profile; return input; }
function opportunityInput() { const { id: _id, source: _source, sourceKey: _key, checkedAt: _date, verification: _verification, status: _status, followUpAt: _follow, notes: _notes, ...input } = opportunity; return input; }

describe('cloud loop literal evidence and approvals', () => {
  it('keeps student/MBA targeting with unknown experience and compensation, without senior defaults', () => {
    expect(validateProfile(profileInput())).toMatchObject({ audience: 'mba', experienceYears: null, compensation: { currency: '', minimum: null } });
    const assessment = assessOpportunity(profile, claims, opportunity);
    expect(assessment.claimIds).toContain('project');
    expect(assessment.flags).toContain('EXPERIENCE_UNKNOWN');
    expect(assessment.flags).toContain('PAY_NOT_ESTABLISHED');
    expect(assessment.flags).toContain('DISCREET_SEARCH_REVIEW');
    expect(assessment.method).toContain('heuristic');
    for (const title of ['Finance Graduate', 'Product Trainee', 'Software Intern']) expect(assessOpportunity({ ...profile, targetTitles: [title] }, claims, { ...opportunity, title }).components.role).toBeGreaterThan(0);
  });
  it('suggests literal unconfirmed, nonshareable source passages', () => {
    const suggestions = suggestClaims(profile);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const item of suggestions) { expect(profile.sourceText).toContain(item.sourceQuote); expect(item.sourceQuote).toContain(item.phrasing); expect(item.confirmed).toBe(false); expect(item.shareable).toBe(false); }
  });
  it('blocks support-to-lead, fabricated quantities, lost projection qualifiers and context drift', () => {
    expect(() => validateClaim({ ...claimInput(claims[0]), phrasing: 'Led a procurement pilot across 5 units, with 8% measured savings.' }, profile)).toThrow(/literal source/);
    expect(() => validateClaim({ ...claimInput(claims[0]), phrasing: project.replace('5 units', '12 units') }, profile)).toThrow(/literal source/);
    expect(() => validateClaim({ ...claimInput(claims[0]), resultStatus: 'measured' }, profile)).toThrow(/projection/);
    expect(() => validateClaim({ ...claimInput(claims[0]), phrasing: '8%', resultStatus: 'projected' }, profile)).toThrow();
    expect(() => validateClaim({ ...claimInput(claims[0]), kind: 'employment' }, profile)).toThrow(/context/);
    expect(() => validateClaim({ ...claimInput(claims[0]), context: 'Invented employer' }, profile)).toThrow(/context/);
    expect(() => validateClaim(claimInput(claims[0]), { ...profile, sourceText: source.replace(project, 'Changed source passage') })).toThrow(/no longer present/);
    const longInternship = { ...profile, sourceText: `INTERNSHIPS\nExample Advisory internship\n${Array.from({ length: 12 }, (_, i) => `Reviewed source note ${i + 1}.`).join('\n')}\n${internship}` };
    expect(() => validateClaim({ ...claimInput(claims[1]), kind: 'employment' }, longInternship)).toThrow(/context/);
  });
  it('rejects cropped phrasing and cropped quotes that remove negation or team/support attribution', () => {
    for (const [full, cropped] of [['I did not lead the migration; I supported the team that led it.', 'lead the migration'], ['Supported a team that led migration delivery.', 'led migration delivery']]) {
      const p = { ...profile, sourceText: `${profile.sourceText}\nEMPLOYMENT\nExample Team\n${full}` };
      const input = { ...claimInput(claims[1]), kind: 'employment' as const, context: 'Example Team', sourceQuote: full, phrasing: cropped };
      expect(() => validateClaim(input, p)).toThrow(/complete literal source/);
      expect(() => validateClaim({ ...input, sourceQuote: cropped }, p)).toThrow(/cropped quotes/);
      expect(validateClaim({ ...input, phrasing: full }, p).phrasing).toBe(full);
    }
  });
  it('labels explicit user answers while requiring their context and literal approved wording', () => {
    const input = { ...claimInput(claims[1]), sourceKind: 'user_answer' as const, sourceQuote: `Example Advisory internship: ${internship}` };
    expect(validateClaim(input, profile).sourceKind).toBe('user_answer');
    expect(() => validateClaim({ ...input, sourceQuote: internship }, profile)).toThrow(/explicitly identify/);
  });
  it('rejects privileged action fields, arbitrary endpoints, sending and traversal references', () => {
    expect(() => validateAction({ action: 'get', userId: 'actor' })).toThrow(/privileged/);
    expect(() => validateAction({ action: 'send_email' })).toThrow(/unsupported/i);
    expect(() => validateAction({ action: 'withdraw_claim', expectedVersion: 1, id: '../outside' })).toThrow(/reference/);
    expect(() => validateAction({ action: 'cancel_run' })).toThrow(/missing required/);
    for (const url of ['http://example.com', 'https://localhost/path', 'https://169.254.169.254/', 'https://user:password@example.com/', 'https://[::1]/']) expect(() => validateOpportunity({ ...opportunityInput(), url })).toThrow();
    expect(validateOpportunity(opportunityInput()).url).toBe(opportunity.url);
  });
  it('uses only approved shareable active facts; rejects repeated IDs and unsafe model choices', async () => {
    const blocked = [{ ...claims[0], confirmed: false }, { ...claims[1], shareable: false }, { ...claims[2], status: 'withdrawn' as const }];
    const packet = await composePacket({ profile, claims: blocked, opportunity, runId: 'run-1' });
    expect(packet.status).toBe('held'); expect(packet.cvText).not.toContain(project);
    await expect(composePacket({ profile, claims, opportunity, runId: 'run-1', selectedClaimIds: ['unknown'] })).rejects.toThrow(/selection/);
    await expect(composePacket({ profile, claims: [...claims, claims[0]], opportunity, runId: 'run-1' })).rejects.toThrow(/Repeated claim/);
  });
  it('bounds Gmail tickets without granting owner or mailbox confirmation authority', () => {
    expect(validateAction({ action: 'gmail_preview', ticket: 'fictional-encrypted-ticket' })).toEqual({ action: 'gmail_preview', ticket: 'fictional-encrypted-ticket' });
    expect(validateAction({ action: 'gmail_finalize', ticket: 'fictional-encrypted-ticket', confirmMailbox: false })).toEqual({ action: 'gmail_finalize', ticket: 'fictional-encrypted-ticket', confirmMailbox: false });
    for (const ticket of ['', '   ', 1, 'x'.repeat(16001)]) expect(() => validateAction({ action: 'gmail_preview', ticket })).toThrow();
    expect(() => validateAction({ action: 'gmail_finalize', ticket: 'fictional-encrypted-ticket', confirmMailbox: 'true' })).toThrow(/explicit true\/false/);
    expect(() => validateAction({ action: 'gmail_finalize', ticket: 'fictional-encrypted-ticket' })).toThrow(/missing required/);
    expect(() => validateAction({ action: 'gmail_preview', ticket: 'fictional-encrypted-ticket', userId: 'forged-owner' })).toThrow(/privileged/);
    expect(() => validateAction({ action: '../gmail_finalize', ticket: 'fictional-encrypted-ticket', confirmMailbox: true })).toThrow(/Unsupported/);
    expect(() => validateAction('{"action":"gmail_preview","ticket":"fictional-encrypted-ticket"}')).toThrow();
    expect(() => validateAction([{ action: 'gmail_preview', ticket: 'fictional-encrypted-ticket' }])).toThrow();
  });
  it('preserves quarantined/withdrawn source history without letting it block fresh approved claims', async () => {
    const changed = { ...profile, sourceText: source.replace(project, 'The former project source has been removed for review.') };
    for (const old of [{ ...claims[0], confirmed: false, shareable: false }, { ...claims[0], status: 'withdrawn' as const }]) {
      const packet = await composePacket({ profile: changed, claims: [old, ...claims.slice(1)], opportunity, runId: 'run-1' });
      expect(packet.status).toBe('review_required'); expect(packet.cvText).not.toContain(project); expect(packet.cvText).toContain(internship);
    }
  });
  it('preserves academic/internship labels, education and all approved work contexts', async () => {
    const packet = await composePacket({ profile, claims, opportunity, runId: 'run-1', selectedClaimIds: ['project'] });
    expect(packet.cvText).toContain('ACADEMIC PROJECTS'); expect(packet.cvText).toContain('INTERNSHIPS'); expect(packet.cvText).toContain('EDUCATION');
    for (const c of claims) expect(packet.cvText).toContain(c.phrasing);
    expect(packet.cvText).not.toMatch(/\bled\b|measured savings|realized savings/i);
    expect(packet.status).toBe('review_required'); expect(packet.approvedAt).toBeNull();
    expect(packet.messageText).toBe(''); expect(packet.emailBody).toBe(''); expect(packet.evidenceText).toContain('Outreach is held');
    expect(packet.evidenceText).toContain('review current-employer details');
  });
  it('retains literal employer/title/date headers from every approved work context even when the model omits them', async () => {
    const a = 'Supported preparation of operating plans for the project team.';
    const b = 'Prepared weekly analysis reports for a separate project team.';
    const p = { ...profile, sourceText: `${source}\nEMPLOYMENT\nExample Company A\nAnalyst\n2022–2023\n${a}\nEMPLOYMENT\nExample Company B\nConsultant\n2024–2025\n${b}` };
    const work = [claim('work-a', a, 'employment', 'Example Company A'), claim('work-b', b, 'employment', 'Example Company B')];
    const saved = validateClaim(claimInput(work[0]), p);
    expect(validateClaim(saved, p)).toEqual(saved);
    expect(() => validateClaim({ ...saved, context: saved.context.replace('Analyst', 'Director') }, p)).toThrow(/literal source title/);
    const packet = await composePacket({ profile: p, claims: [...claims, ...work], opportunity, runId: 'run-1', selectedClaimIds: ['project'] });
    expect(packet.cvText).toContain('Example Company A | Analyst | 2022–2023');
    expect(packet.cvText).toContain('Example Company B | Consultant | 2024–2025');
    expect(packet.cvText).toContain(a); expect(packet.cvText).toContain(b); expect(packet.cvText).toContain(education);
  });
  it('deduplicates repeated source passages and fingerprints revisions and content deterministically', async () => {
    const second = { ...claims[0], id: 'project-alternative' };
    const packet = await composePacket({ profile, claims: [...claims, second], opportunity, runId: 'run-1' });
    expect(packet.cvText.split(project)).toHaveLength(2);
    const first = await fingerprintLoopInputs(profile, claims, [opportunity]);
    expect(await fingerprintLoopInputs(profile, [...claims].reverse(), [opportunity])).toBe(first);
    expect(await fingerprintLoopInputs({ ...profile, revision: 2 } as LoopProfile, claims, [opportunity])).not.toBe(first);
    expect(await fingerprintLoopInputs(profile, claims.map(c => ({ ...c, revision: 2 })), [opportunity])).not.toBe(first);
  });
  it('never exports excluded phrases, even through source quotes or report passages', async () => {
    const restricted = { ...profile, excludedTerms: ['8%'] };
    const packet = await composePacket({ profile: restricted, claims, opportunity, runId: 'run-1' });
    for (const t of [packet.cvText, packet.evidenceText, packet.coverLetterText, packet.messageText, packet.emailBody]) expect(t).not.toContain('8%');
    const injected = await renderPacket({ profile: restricted, packet: { ...packet, cvText: `${packet.cvText}\n8%` } });
    expect(injected.artifacts).toEqual({}); expect(injected.holdReasons).toContain('EXCLUDED_CONTENT_IN_PACKET');
  });
  it('creates named reviewed drafts only from approved facts and a literal vacancy quote', async () => {
    const contact = { name: 'Jordan Example', title: 'Recruiter', email: 'recruiter@example.com', sourceUrl: 'https://example.com/team', sourceQuote: 'User confirmed Jordan Example is the contact for this vacancy.', confirmedByUser: true, inExistingThread: false };
    const packet = await composePacket({ profile, claims, opportunity: { ...opportunity, contact }, runId: 'run-1' });
    expect(packet.messageText).toContain('Hello Jordan Example'); expect(packet.emailBody).toContain(project);
    expect(opportunity.description).toContain(packet.coverLetterText.match(/highlights: “([^”]+)”/)![1]);
    expect(packet.coverLetterText).toContain('Academic project — Example University capstone');
    expect(packet.status).not.toBe('approved');
  });
  it('keeps a very long single-line vacancy out of letters and preserves factual context labels', async () => {
    const packet = await composePacket({ profile, claims, opportunity: { ...opportunity, description: 'Requires '.repeat(1500) }, runId: 'run-1' });
    expect(packet.coverLetterText.length).toBeLessThan(2500); expect(packet.coverLetterText).not.toContain('Requires '.repeat(100));
    expect(packet.coverLetterText).toContain('Academic project —'); expect(packet.coverLetterText).toContain('projected savings');
  });
});

describe('cloud loop portable document rendering', () => {
  it('renders actual PDF/DOCX/TXT without Office, preserves factual Unicode text and measures one page without padding', async () => {
    const packet = await composePacket({ profile: { ...profile, name: 'Zoë Morgan' }, claims, opportunity, runId: 'run-1' });
    const rendered = await renderPacket({ profile, packet });
    expect(rendered.pageCount).toBe(1); expect(rendered.holdReasons).toEqual([]);
    expect(Object.keys(rendered.artifacts)).toEqual(expect.arrayContaining(['pdf', 'docx', 'txt', 'report', 'letter']));
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
    const task = pdfjs.getDocument({ data: rendered.artifacts.pdf.bytes.slice(), useSystemFonts: false });
    const pdf = await task.promise; expect(pdf.numPages).toBe(1);
    const items = await (await pdf.getPage(1)).getTextContent();
    const pdfText = items.items.filter(i => 'str' in i).map(i => 'str' in i ? i.str : '').join(' ');
    expect(pdfText).toContain('Zoë Morgan'); expect(pdfText).toContain('projected savings'); expect(pdfText).toContain('ACADEMIC PROJECTS');
    await task.destroy();
    const xml = strFromU8(unzipSync(rendered.artifacts.docx.bytes)['word/document.xml']);
    expect(xml).toContain('Zoë Morgan'); expect(xml).toContain(project); expect(xml).toContain('INTERNSHIPS');
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toBe(packet.cvText);
    for (const a of Object.values(rendered.artifacts)) { expect(a.sha256).toMatch(/^[0-9a-f]{64}$/); expect(a.byteSize).toBe(a.bytes.length); expect(a.filename.includes('/')).toBe(false); expect(a.filename.includes('\\')).toBe(false); }
  });
  it('holds oversized PDFs using actual page count and never invents numbers or grants approval', async () => {
    const packet = await composePacket({ profile, claims, opportunity, runId: 'run-1' });
    const rendered = await renderPacket({ profile, packet: { ...packet, cvText: Array.from({ length: 130 }, () => project).join('\n') } });
    expect(rendered.pageCount).toBeGreaterThan(1); expect(rendered.packet.status).toBe('held'); expect(rendered.holdReasons).toContain('PAGE_TARGET_EXCEEDED');
    expect(rendered.packet.approvedAt).toBeNull();
  });
  it('reports unsupported PDF glyphs honestly while retaining Unicode in portable DOCX/TXT', async () => {
    const packet = await composePacket({ profile, claims, opportunity, runId: 'run-1' });
    const rendered = await renderPacket({ profile, packet: { ...packet, cvText: `${packet.cvText}\n工程师` } });
    expect(rendered.pageCount).toBeNull(); expect(rendered.holdReasons).toContain('PDF_FONT_UNSUPPORTED'); expect(rendered.packet.status).toBe('held');
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toContain('工程师');
  });
});
