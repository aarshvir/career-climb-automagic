import { describe, expect, it } from 'vitest';
import { copyLoopSourceDetails } from '@/lib/loop-source-intake';

describe('local source header copying', () => {
  it('copies only literal name and contact header details', () => {
    const source = 'Name: Fictional Casey\ncasey@example.test\n+971 50 000 0000\nAcademic projects\nBuilt a forecast from fictional data; the result was projected.';
    expect(copyLoopSourceDetails(source)).toEqual({ name: 'Fictional Casey', nameSource: 'Name: Fictional Casey', contactLine: 'casey@example.test · +971 50 000 0000', contactSources: ['casey@example.test', '+971 50 000 0000'] });
  });
  it('leaves ambiguous headings and short career statements as unknown names', () => {
    for (const heading of ['Business Development', 'Graduate Analyst', 'Prepared Stakeholder Reports', 'Built A Dashboard', 'Curriculum Vitae', 'Academic projects', 'Fictional Casey | MBA']) {
      expect(copyLoopSourceDetails(`${heading}\nSome accurate source text.`).name).toBe('');
    }
  });
  it('copies a plausible Unicode first-line name without changing its letters', () => {
    expect(copyLoopSourceDetails('Élodie D’Arcy\nFictional academic source.').name).toBe('Élodie D’Arcy');
  });
  it('does not pick a recruiter contact or a later employer address out of career text', () => {
    const source = 'Fictional Casey\nSummary\nProject A\nEducation\nCourse 1\nCourse 2\nCourse 3\nCourse 4\nEmployer contact recruiter@example.test';
    expect(copyLoopSourceDetails(source).contactLine).toBe('');
  });
  it('returns no extra career fields from dates, degrees or estimated results', () => {
    const details = copyLoopSourceDetails('Name: Fictional Casey\nMBA expected 2027\nEmployment 2020–2026\nForecast savings of 20%.');
    expect(Object.keys(details).sort()).toEqual(['contactLine', 'contactSources', 'name', 'nameSource']);
    expect(details.name).toBe('Fictional Casey');
  });
});
