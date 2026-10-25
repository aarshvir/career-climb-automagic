import { describe, expect, it } from 'vitest';
import { blankLoopCvAnswers, buildLoopCvText } from '../../lib/loop-cv-builder';

describe('first Automated Job Loop CV from personal answers', () => {
  const entry = 'Studied biology at Example College. Completed a class project recording local plant species.';
  it('creates independent blank answers without supplying any personal facts', () => {
    const first = blankLoopCvAnswers(), second = blankLoopCvAnswers();
    first.name = 'Alex Example';
    expect(second).toEqual({ name: '', contact: '', experience: '', education: '', skills: '', summary: '' });
  });
  it('lets someone with no work experience build from education alone', () => {
    const result = buildLoopCvText({ ...blankLoopCvAnswers(), name: 'Alex Example', education: entry });
    expect(result).toBe(`Alex Example\n\nEducation\n${entry}`);
    expect(result).not.toMatch(/Experience|Skills|Summary|Contact|graduate|degree|20\d\d/i);
  });
  it('preserves exact wording, uncertainty, Unicode and internal spacing in every answer', () => {
    const result = buildLoopCvText({
      name: '  Zoë Example  ', contact: '  example@example.test  ',
      summary: '  Exploring a first role.  ',
      experience: '  Volunteer project—not paid work.\nI helped  plan a survey; impact was not measured.  ',
      education: `  ${entry}  `, skills: '  SQL (introductory)\nالعربية  ',
    });
    expect(result).toBe(`Zoë Example\n\nexample@example.test\n\nSummary\nExploring a first role.\n\nExperience and projects\nVolunteer project—not paid work.\nI helped  plan a survey; impact was not measured.\n\nEducation\n${entry}\n\nSkills\nSQL (introductory)\nالعربية`);
  });
  it('does not treat skills or an introduction as evidence of education or experience', () => {
    expect(() => buildLoopCvText({ ...blankLoopCvAnswers(), name: 'Alex', skills: entry, summary: entry })).toThrow(/at least one experience, project or education/);
  });
  it('requires the name and enough real detail without filling in gaps', () => {
    expect(() => buildLoopCvText({ ...blankLoopCvAnswers(), education: entry })).toThrow(/name/);
    expect(() => buildLoopCvText({ ...blankLoopCvAnswers(), name: 'Alex', education: 'School' })).toThrow(/at least 80 characters/);
  });
  it('rejects oversized individual fields before assembling a CV', () => {
    for (const [key, limit] of [['name', 200], ['contact', 600], ['summary', 4000], ['experience', 30000], ['education', 15000], ['skills', 10000]] as const) {
      expect(() => buildLoopCvText({ ...blankLoopCvAnswers(), name: 'Alex Example', education: entry, [key]: 'x'.repeat(limit + 1) })).toThrow(/too long/);
    }
  });
  it('does not mutate the source answers and omits whitespace-only sections', () => {
    const answers = Object.freeze({ ...blankLoopCvAnswers(), name: ' Alex Example ', education: entry, skills: ' \n\t ' });
    expect(buildLoopCvText(answers)).toBe(`Alex Example\n\nEducation\n${entry}`);
    expect(answers.name).toBe(' Alex Example ');
  });
  it('rejects malformed runtime values instead of coercing them into personal facts', () => {
    expect(() => buildLoopCvText(null as never)).toThrow(/own experience/);
    expect(() => buildLoopCvText({ ...blankLoopCvAnswers(), name: 'Alex', education: entry, skills: 42 } as never)).toThrow(/Skills must be text/);
  });
});
