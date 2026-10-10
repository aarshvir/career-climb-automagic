import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkReviewKey, clearRetainedCheck, readRetainedCheck, retainCheckForGoogle, takeCheckAuthReturn, takeRetainedCheck, validateCheckDraft, type CheckDraft } from '@/lib/check-draft';

const DRAFT_KEY = 'jobvance_check_oauth_draft_v1';
const RETURN_KEY = 'jobvance_check_oauth_return_v1';
const TTL = 30 * 60 * 1000;
const NOW = 1800000000000;
const cv = 'Synthetic candidate. Built Python reports from generated data and documented internal QA processes. '.repeat(3).trim();
const draft: CheckDraft = { jobTitle: 'Data analyst', company: 'Fictional company', sourceText: cv, reviewedText: cv, jobDescription: 'A fictional role requires Python reporting, documentation and careful work with generated data. No application is submitted.' };
function putEnvelope(value: unknown) { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value)); sessionStorage.setItem(RETURN_KEY, '/check'); }

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

describe('guest checking defaults to no CV storage', () => {
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
    expect(takeCheckAuthReturn()).toBe('/dashboard'); expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });
  it('accepts only the exact check path and consumes it once', () => {
    sessionStorage.setItem(RETURN_KEY, '/check');
    expect(takeCheckAuthReturn()).toBe('/check'); expect(takeCheckAuthReturn()).toBe('/dashboard');
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
    expect(takeRetainedCheck(NOW)).toBeNull(); expect(takeCheckAuthReturn()).toBe('/dashboard');
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
