import { describe, expect, it } from 'vitest';
import { accountRoleSuggestions, cvRoleSuggestions } from '@/lib/loop-role-suggestions';

describe('bounded local role suggestions', () => {
  it('ignores identity, malformed metadata, control characters and excessive titles', () => {
    expect(accountRoleSuggestions({ name: 'Software engineer', email: 'director@example.test' })).toEqual([]);
    expect(accountRoleSuggestions(['Software engineer'])).toEqual([]);
    expect(accountRoleSuggestions({ job_title: 'Director\nSales', occupation: 'x'.repeat(151) })).toEqual([]);
    expect(accountRoleSuggestions({ target_titles: ['Data analyst', 'data analyst', 'Product manager', 45, 'Operations manager', 'Marketing manager'] })).toEqual(['Data analyst', 'Product manager', 'Operations manager']);
  });
  it('keeps exact source heading seniority but ignores aspirations, skills and narrative mentions', () => {
    expect(cvRoleSuggestions('Alex Example\nSenior Data analyst | Acme\nWorked with a product manager.\nSeeking Marketing manager\nSkills: Project manager\nSoftware engineer\nOperations manager\nData scientist')).toEqual(['Senior Data analyst', 'Software engineer', 'Operations manager']);
  });
  it('does not invent a profession from an education-only CV', () => {
    expect(cvRoleSuggestions('Alex Example\nEducation\nBiology at Example University\nStudied Python and statistical analysis')).toEqual([]);
  });
});
