import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { savePreSignupAnswers, takePreSignupAnswers } from '../lib/pre-signup-quiz';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('does not restore an older handoff after replacement fails with readable storage', () => {
  savePreSignupAnswers({ targetTitles: ['Old role'], locations: ['Old city'] });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage quota reached', 'QuotaExceededError');
  });
  savePreSignupAnswers({ targetTitles: ['New role'], locations: ['New city'] });
  expect(takePreSignupAnswers()).toBeNull();
});

it('keeps answers for two hours, reads them once, and rejects malformed or future data', () => {
  savePreSignupAnswers({ targetTitles: ['Analyst'], locations: ['Boston'] }, 1_000);
  expect(takePreSignupAnswers(1_000 + 60 * 60 * 1000)).toEqual({ targetTitles: ['Analyst'], locations: ['Boston'] });
  expect(takePreSignupAnswers(1_000 + 60 * 60 * 1000)).toBeNull();
  savePreSignupAnswers({ targetTitles: ['Analyst'], locations: ['Boston'] }, 1_000);
  expect(takePreSignupAnswers(1_000 + 3 * 60 * 60 * 1000)).toBeNull();
  localStorage.setItem('jobvance:pre-signup-quiz', JSON.stringify({ v: 1, targetTitles: ['Analyst'], locations: ['Boston'], savedAt: Date.now() + 60_000 }));
  expect(takePreSignupAnswers()).toBeNull();
  localStorage.setItem('jobvance:pre-signup-quiz', '{not json');
  expect(takePreSignupAnswers()).toBeNull();
  expect(localStorage.length).toBe(0);
});
