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
