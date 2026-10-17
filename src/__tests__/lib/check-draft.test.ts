import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkReviewKey, clearRetainedCheck, readRetainedCheck, retainCheckForGoogle, takeCheckAuthReturn, takeRetainedCheck, validateCheckDraft, clearCheckRecovery, readCheckRecovery, rememberCheckRecovery, draftForAnotherVacancy, keepReviewedEditsInSource, checkSourceLines, removeSelectedSourceLines, CheckDraftValidationError, type CheckDraft } from '@/lib/check-draft';

const DRAFT_KEY = 'jobvance_check_oauth_draft_v1';
const RETURN_KEY = 'jobvance_check_oauth_return_v1';
const RECOVERY_KEY = 'jobvance_check_recovery_v1';
const TTL = 30 * 60 * 1000;
const NOW = 1800000000000;
const cv = 'Synthetic candidate. Built Python reports from generated data and documented internal QA processes. '.repeat(3).trim();
const draft: CheckDraft = { jobTitle: 'Data analyst', company: 'Fictional company', sourceText: cv, reviewedText: cv, jobDescription: 'A fictional role requires Python reporting, documentation and careful work with generated data. No application is submitted.' };
function putEnvelope(value: unknown) { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value)); sessionStorage.setItem(RETURN_KEY, '/check'); }

beforeEach(() => { clearCheckRecovery(); sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

describe('a second vacancy has its own inputs and approval', () => {
  it('removes deliberately selected source spans and identical complete final lines while preserving every retained character', () => {
    const privateLine = '  FICTIONAL PRIVATE REF <PROJECT-ALPHA>  ';
    const sourceText = `  ${cv}\r\n\r\n${privateLine}\rVerified source wording.  \n\n\n\n`;
    const reviewedText = `Verified reviewed wording.  \r${privateLine}\n${cv}\r\n${privateLine}\r\n${privateLine} (edited passage to review)\n`;
    const original = { ...draft, sourceText, reviewedText }, snapshot = JSON.stringify(original), storage = vi.spyOn(Storage.prototype, 'setItem');
    const lines = checkSourceLines(sourceText);
    expect(lines[2]).toMatchObject({ number: 3, text: privateLine });
    const next = removeSelectedSourceLines(original, [3]);
    expect(next.sourceText).toBe(`  ${cv}\r\n\r\nVerified source wording.  \n\n\n\n`);
    expect(next.reviewedText).toBe(`Verified reviewed wording.  \r${cv}\r\n${privateLine} (edited passage to review)\n`);
    expect(next.reviewedText).toContain('(edited passage to review)');
    expect(draftForAnotherVacancy(next, 'source').sourceText).toBe(next.sourceText);
    expect(draftForAnotherVacancy(next, 'reviewed').sourceText).toBe(next.reviewedText);
    expect(checkReviewKey(next, 'method-v1')).not.toBe(checkReviewKey(original, 'method-v1'));
    expect(JSON.stringify(original)).toBe(snapshot); expect(storage).not.toHaveBeenCalled();
  });
  it('keeps source and reviewed CV text literal through validation, source adoption and reuse', () => {
    const text = `  ${cv}\r\n\tLiteral candidate wording.  \r\n\n\n\n`;
    const literal = { ...draft, sourceText: text, reviewedText: text };
    expect(validateCheckDraft(literal)).toEqual(literal);
    expect(keepReviewedEditsInSource({ ...literal, sourceText: cv }).sourceText).toBe(text);
    expect(draftForAnotherVacancy(literal, 'source').sourceText).toBe(text);
    expect(draftForAnotherVacancy(literal, 'reviewed').sourceText).toBe(text);
  });
  it.each([[], [0], [2], [1.5], [Number.NaN]].map(selected => ({ selected })))('rejects invalid source-line selections $selected', ({ selected }) => {
    expect(() => removeSelectedSourceLines(draft, selected)).toThrow('Choose source lines to remove.');
  });
  it('refuses removal that leaves unreadable source or current CV text without changing the input', () => {
    const original = { ...draft, sourceText: `${cv}\nPrivate fixture`, reviewedText: `Private fixture\nshort` }, snapshot = JSON.stringify(original);
    expect(() => removeSelectedSourceLines(original, [1])).toThrow(/Too little readable CV text/);
    expect(() => removeSelectedSourceLines(original, [2])).toThrow(/Too little readable CV text/);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
  it('copies reviewed removals to the reusable source while preserving surrounding facts and leaving the earlier record intact', () => {
    const original = { ...draft, sourceText: cv + '\nConfidential fictional reference PROJECT-ALPHA.', reviewedText: cv };
    const snapshot = JSON.stringify(original), storage = vi.spyOn(Storage.prototype, 'setItem');
    const updated = keepReviewedEditsInSource(original);
    expect(updated).toEqual({ ...draft, sourceText: cv, reviewedText: cv });
    expect(draftForAnotherVacancy(updated, 'source').sourceText).toBe(cv);
    expect(updated.sourceText).not.toContain('PROJECT-ALPHA'); expect(JSON.stringify(original)).toBe(snapshot);
    expect(storage).not.toHaveBeenCalled();
  });
  it.each(['jobTitle', 'company', 'sourceText', 'reviewedText', 'jobDescription'] as const)('identifies the actual invalid %s field', field => {
    const invalid = field === 'company' ? 'x'.repeat(201) : 'x';
    try { validateCheckDraft({ ...draft, [field]: invalid }); throw new Error('Expected invalid input to be rejected.'); }
    catch (failure) { expect(failure).toBeInstanceOf(CheckDraftValidationError); expect((failure as CheckDraftValidationError).field).toBe(field); }
  });
  it('keeps only the deliberately chosen CV text and leaves the earlier application unchanged', () => {
    const earlier = { ...draft, reviewedText: cv + '\nA later verified contribution.', approved: true, report: { score: 100 } };
    const snapshot = JSON.stringify(earlier), storage = vi.spyOn(Storage.prototype, 'setItem');
    expect(draftForAnotherVacancy(earlier, 'source')).toEqual({ jobTitle: '', company: '', sourceText: cv, reviewedText: '', jobDescription: '' });
    expect(draftForAnotherVacancy(earlier, 'reviewed').sourceText).toBe(earlier.reviewedText);
    expect(draftForAnotherVacancy(earlier, 'reviewed')).not.toHaveProperty('approved');
    expect(draftForAnotherVacancy(earlier, 'reviewed')).not.toHaveProperty('report');
    expect(JSON.stringify(earlier)).toBe(snapshot);
    expect(storage).not.toHaveBeenCalled();
  });
  it('rejects an unreadable selected CV instead of silently falling back to another version', () => {
    expect(() => draftForAnotherVacancy({ ...draft, reviewedText: 'short' }, 'reviewed')).toThrow(/Too little readable CV text/);
    expect(draftForAnotherVacancy({ ...draft, reviewedText: 'short' }, 'source').sourceText).toBe(cv);
  });
});

describe('guest checking defaults to no CV storage', () => {
  it('keeps only the explicitly selected audience with the owner-bound temporary draft', () => {
    const value = { draft, step: 5, cvReady: true, filename: '', ownerId: 'account-a', pageTarget: 2 as const, audience: 'student' as const };
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    rememberCheckRecovery(value, false, NOW);
    expect(readCheckRecovery('account-a', NOW + 1)?.value.audience).toBe('student');
    expect(storage).not.toHaveBeenCalled();
    rememberCheckRecovery(value, true, NOW);
    expect(JSON.parse(sessionStorage.getItem(RECOVERY_KEY)!).value.audience).toBe('student');
    expect(readCheckRecovery('account-b', NOW + 1)).toBeNull();
    clearCheckRecovery();
    expect(readCheckRecovery('account-a', NOW + 1)).toBeNull();
  });
  it.each(['administrator', 'Student', null, ['student']])('rejects unsupported recovered audience %s', audience => {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value: { draft, step: 1, cvReady: true, filename: '', ownerId: null, pageTarget: 2, audience }, expiresAt: NOW + TTL }));
    expect(readCheckRecovery(null, NOW + 1)).toBeNull();
  });
  it('preserves the explicit reuse path with owner-bound consent while stripping approval and undo data', () => {
    const value = { draft, step: 1, cvReady: true, filename: '', ownerId: 'account-a', pageTarget: 1 as const, reuseMode: true, approved: true, previousApplication: draft };
    rememberCheckRecovery(value, true, NOW);
    const recovered = readCheckRecovery('account-a', NOW + 1)!;
    expect(recovered.value).toEqual({ draft, step: 1, cvReady: true, filename: '', ownerId: 'account-a', pageTarget: 1, reuseMode: true });
    expect(sessionStorage.getItem(RECOVERY_KEY)).not.toContain('previousApplication');
    expect(readCheckRecovery('account-b', NOW + 1)).toBeNull();
  });
  it.each([{ step: 2, reuseMode: true }, { step: 3, reuseMode: true }, { step: 1, reuseMode: 'true' }, { step: 1, reuseMode: null }])('rejects malformed reuse recovery %j', fields => {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value: { draft, cvReady: true, filename: '', ownerId: null, pageTarget: 2, ...fields }, expiresAt: NOW + TTL }));
    expect(readCheckRecovery(null, NOW + 1)).toBeNull();
    expect(sessionStorage.getItem(RECOVERY_KEY)).toBeNull();
  });
  it('preserves an incomplete draft for route navigation without writing browser storage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const value = { draft: { ...draft, jobDescription: '' }, step: 3, cvReady: true, filename: 'fictional.txt', ownerId: null, pageTarget: 1 as const };
    rememberCheckRecovery(value, false, NOW);
    expect(readCheckRecovery(null, NOW + 1000)?.value).toEqual(value);
    expect(readCheckRecovery(null, NOW + 1000)?.storageConsented).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(readCheckRecovery('different-account', NOW + 1000)).toBeNull();
  });
  it('retains across refresh only with consent, expires and clears on explicit discard', () => {
    const value = { draft, step: 6, cvReady: true, filename: '', ownerId: null, pageTarget: 2 as const };
    rememberCheckRecovery(value, true, NOW);
    expect(readCheckRecovery(null, NOW + 1000)?.storageConsented).toBe(true);
    expect(readCheckRecovery(null, NOW + 1000)?.value).toEqual(value);
    expect(readCheckRecovery(null, NOW + TTL)).toBeNull();
    rememberCheckRecovery(value, true, NOW); clearCheckRecovery();
    expect(readCheckRecovery(null, NOW + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it('restores a consented page target only for its owner and never restores approval', () => {
    const value = { draft: { ...draft, approved: true }, step: 6, cvReady: true, filename: '', ownerId: 'account-a', pageTarget: 1, approved: true, report: { score: 100 } };
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value, expiresAt: NOW + TTL }));
    const recovered = readCheckRecovery('account-a', NOW + 1)!;
    expect(recovered.value.pageTarget).toBe(1);
    expect(recovered.value).not.toHaveProperty('approved');
    expect(recovered.value).not.toHaveProperty('report');
    expect(recovered.value.draft).not.toHaveProperty('approved');
    expect(readCheckRecovery('account-b', NOW + 1)).toBeNull();
    expect(sessionStorage.getItem(RECOVERY_KEY)).toBeNull();
  });
  it('accepts an existing recovery envelope with the original two-page default', () => {
    const legacy = { draft, step: 6, cvReady: true, filename: '', ownerId: null };
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value: legacy, expiresAt: NOW + TTL }));
    expect(readCheckRecovery(null, NOW + 1)?.value).toEqual({ ...legacy, pageTarget: 2 });
  });
  it.each([0, 3, '1', null])('rejects an invalid stored page target %s', pageTarget => {
    sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value: { draft, step: 6, cvReady: true, filename: '', ownerId: null, pageTarget }, expiresAt: NOW + TTL }));
    expect(readCheckRecovery(null, NOW + 1)).toBeNull();
    expect(sessionStorage.getItem(RECOVERY_KEY)).toBeNull();
  });
  it('validation and review-key construction do not read or write browser storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    validateCheckDraft(draft); checkReviewKey(draft, 'method-v1');
    expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });
  it('refuses Google retention without specific consent', () => {
    expect(() => retainCheckForGoogle(draft, false, NOW)).toThrow(/temporary browser-tab storage/i);
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });
  it('stores only a consented tab draft and consumes it once', () => {
    retainCheckForGoogle(draft, true, NOW);
    expect(localStorage.length).toBe(0);
    expect(takeCheckAuthReturn()).toBe('/check');
    expect(takeRetainedCheck(NOW + 1000)).toEqual(draft);
    expect(takeRetainedCheck(NOW + 1001)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it('allows a replayed or abandoned render to peek without consuming the consented draft', () => {
    retainCheckForGoogle(draft, true, NOW);
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(readRetainedCheck(NOW + 1000)).toEqual(draft);
    expect(readRetainedCheck(NOW + 1000)).toEqual(draft);
    expect(remove).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RETURN_KEY)).toBe('/check');
    expect(takeRetainedCheck(NOW + 1000)).toEqual(draft);
    expect(sessionStorage.length).toBe(0);
  });
  it('restores source inputs without restoring approval, user identity or persisted reports', () => {
    putEnvelope({ version: 1, expiresAt: NOW + TTL, approved: true, userId: 'previous-account', report: { score: 100 }, draft: { ...draft, approved: true, userId: 'previous-account', report: { score: 100 } } });
    const recovered = takeRetainedCheck(NOW);
    expect(recovered).toEqual(draft);
    expect(recovered).not.toHaveProperty('approved'); expect(recovered).not.toHaveProperty('userId'); expect(recovered).not.toHaveProperty('report');
  });
});

describe('retained drafts expire and discard malformed or oversized data', () => {
  it.each([NOW - 1, NOW, NOW + TTL + 1, null, String(NOW + TTL)])('rejects an invalid expiry and clears both keys', expiresAt => {
    putEnvelope({ version: 1, expiresAt, draft });
    expect(takeRetainedCheck(NOW)).toBeNull();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull(); expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });
  it('expires at the exact thirty-minute boundary', () => {
    retainCheckForGoogle(draft, true, NOW);
    expect(takeRetainedCheck(NOW + TTL)).toBeNull(); expect(sessionStorage.length).toBe(0);
  });
  it.each([null, [], { version: 2, expiresAt: NOW + TTL, draft }, { version: 1, expiresAt: NOW + TTL }, { version: 1, expiresAt: NOW + TTL, draft: { ...draft, sourceText: 123 } }])('discards malformed stored input without exposing it', envelope => {
    putEnvelope(envelope);
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(sessionStorage.length).toBe(0);
  });
  it('discards malformed JSON and non-finite numeric expiration', () => {
    sessionStorage.setItem(DRAFT_KEY, '{not-json');
    expect(takeRetainedCheck(NOW)).toBeNull();
    sessionStorage.setItem(DRAFT_KEY, `{"version":1,"expiresAt":1e309,"draft":${JSON.stringify(draft)}}`);
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(sessionStorage.length).toBe(0);
  });
  it.each(['sourceText', 'reviewedText', 'jobDescription'] as const)('rejects oversized %s', field => {
    putEnvelope({ version: 1, expiresAt: NOW + TTL, draft: { ...draft, [field]: 'x'.repeat(field === 'jobDescription' ? 20001 : 60001) } });
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(sessionStorage.length).toBe(0);
  });
  it('rejects an oversized raw envelope even when its visible fields are individually valid', () => {
    putEnvelope({ version: 1, expiresAt: NOW + TTL, draft, unrelatedPadding: 'x'.repeat(2000000) });
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(sessionStorage.length).toBe(0);
  });
});

describe('OAuth return paths are canonical and fail closed', () => {
  it.each(['https://attacker.invalid', '//attacker.invalid', '/check?next=https://attacker.invalid', '/dashboard?secret=fixture', '/auth', 'javascript:alert(1)', ''])('does not accept unsafe or arbitrary return value %s', value => {
    sessionStorage.setItem(RETURN_KEY, value);
    expect(takeCheckAuthReturn()).toBe('/loop'); expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });
  it('accepts only the exact check path and consumes it once', () => {
    sessionStorage.setItem(RETURN_KEY, '/check');
    expect(takeCheckAuthReturn()).toBe('/check'); expect(takeCheckAuthReturn()).toBe('/loop');
  });
});

describe('storage failures are honest and do not leave a half-retained draft', () => {
  it('shows an actionable failure if writing the draft fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); });
    expect(() => retainCheckForGoogle(draft, true, NOW)).toThrow(/cannot retain.*use email/i);
    expect(sessionStorage.length).toBe(0);
  });
  it('removes a successfully written draft when the return-key write fails', () => {
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === RETURN_KEY) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return set.call(this, key, value);
    });
    expect(() => retainCheckForGoogle(draft, true, NOW)).toThrow(/cannot retain.*use email/i);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
  it('falls back safely when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError'); });
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(takeCheckAuthReturn()).toBe('/loop');
  });
  it('allows cleanup without throwing when storage is inaccessible', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError'); });
    expect(() => clearRetainedCheck()).not.toThrow();
  });
});

describe('approval is bound to all five inputs and the analysis method', () => {
  it.each(['jobTitle', 'company', 'sourceText', 'reviewedText', 'jobDescription'] as const)('invalidates a previous review if %s changes', field => {
    expect(checkReviewKey({ ...draft, [field]: draft[field] + ' changed' }, 'method-v1')).not.toBe(checkReviewKey(draft, 'method-v1'));
  });
  it('invalidates a previous review when the analysis method changes', () => {
    expect(checkReviewKey(draft, 'method-v2')).not.toBe(checkReviewKey(draft, 'method-v1'));
  });
  it('binds exact text, including semantic qualifiers and redactions', () => {
    expect(checkReviewKey({ ...draft, reviewedText: cv.replace('Built', 'Helped build') }, 'method-v1')).not.toBe(checkReviewKey(draft, 'method-v1'));
    expect(checkReviewKey({ ...draft, sourceText: cv.replace('Python', '[redacted]') }, 'method-v1')).not.toBe(checkReviewKey(draft, 'method-v1'));
  });
});
