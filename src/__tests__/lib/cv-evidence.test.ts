import { describe, expect, it } from 'vitest';
import { analyzeCvEvidence, prioritizeCvForVacancy } from '@/lib/cv-evidence';

const status = (cv: string, vacancy: string) => analyzeCvEvidence(cv, vacancy).requirements[0]?.status;

describe('literal CV evidence comparison', () => {
  it('returns only counts, with an explicit English and unverified-assertion scope', () => {
    const report = analyzeCvEvidence('Skills: SQL', 'SQL required.');
    expect(report.summary).toEqual({ total: 1, direct: 1, partial: 0, missing: 0, review: 0 });
    expect(report.scope).toMatch(/English/);
    expect(report.scope).toMatch(/not verified/);
    expect(report.methodVersion).toBeTruthy();
    expect(Object.keys(report)).not.toContain('score');
    expect(JSON.stringify(report)).not.toMatch(/"(?:score|percentage|percent)"\s*:/);
  });

  it('retains exact source slices and one-based lines across CRLF, bullets and punctuation', () => {
    const cv = 'Profile\r\nFictional candidate\r\nExperience\r\n• Developed SQL queries for monthly reports.\r\nEducation\r\nB.Sc. in Engineering';
    const vacancy = 'Requirements:\r\n• Develop SQL queries.\r\n• Bachelor degree in engineering.';
    const report = analyzeCvEvidence(cv, vacancy);
    expect(report.requirements).toHaveLength(2);
    expect(report.requirements.map(item => item.status)).toEqual(['direct', 'direct']);
    for (const requirement of report.requirements) {
      expect(vacancy.slice(requirement.start, requirement.end)).toBe(requirement.vacancyQuote);
      for (const evidence of requirement.evidence) {
        expect(cv.slice(evidence.start, evidence.end)).toBe(evidence.cvQuote);
        expect(evidence.line).toBe(cv.slice(0, evidence.start).split(/\r\n|\r|\n/).length);
      }
    }
    expect(report.requirements[1].evidence[0].cvQuote).toBe('B.Sc. in Engineering');
  });

  it.each([
    ['Java required.', 'Skills: JavaScript'],
    ['SQL required.', 'Skills: NoSQL'],
    ['Excel required.', 'Excellent stakeholder communication'],
    ['C required.', 'Skills: C++'],
    ['C++ required.', 'Skills: C'],
    ['Python required.', 'Skills: CPythonography'],
  ])('does not use substring matches for %s', (vacancy, cv) => {
    expect(status(cv, vacancy)).toBe('missing');
  });

  it('recognizes an explicit, limited alias while retaining its literal wording', () => {
    const report = analyzeCvEvidence('Technical skills\nMS Excel; JavaScript; Amazon Web Services', 'Microsoft Excel required.');
    expect(report.requirements[0].status).toBe('direct');
    expect(report.requirements[0].evidence[0].cvQuote).toBe('MS Excel;');
  });

  it('requires the requested task and object rather than stakeholders alone', () => {
    expect(status('Managed stakeholders across three teams.', 'Produce stakeholder reports.')).toBe('partial');
    expect(status('Prepared stakeholder reports each month.', 'Produce stakeholder reports.')).toBe('direct');
    expect(status('Prepared financial reports.', 'Produce stakeholder reports.')).toBe('partial');
  });

  it('does not promote a skills list into demonstrated work', () => {
    expect(status('Skills: SQL, queries', 'Develop SQL queries.')).toBe('partial');
    expect(status('Skills: SQL', 'Experience in SQL required.')).toBe('partial');
    expect(status('Developed SQL queries for a reporting dashboard.', 'Develop SQL queries.')).toBe('direct');
  });

  it('does not promote assisting into leading', () => {
    expect(status('Assisted in leading stakeholder reporting.', 'Lead stakeholder reporting.')).toBe('partial');
    expect(status('Supported the team that led stakeholder reporting.', 'Lead stakeholder reporting.')).toBe('partial');
    expect(status('Led stakeholder reporting.', 'Lead stakeholder reporting.')).toBe('direct');
    expect(status('Prepared reports for the finance leadership team.', 'Lead finance team.')).toBe('partial');
    expect(status('Prepared reports for the finance management team.', 'Manage finance team.')).toBe('partial');
    expect(status('Assisted the supervisor who managed the finance team.', 'Manage finance team.')).toBe('partial');
  });

  it('keeps compounds partial if a facet is absent or supported only in a separate passage', () => {
    expect(status('Developed SQL queries.', 'Develop SQL queries and Python services.')).toBe('partial');
    expect(status('Developed SQL queries.\nBuilt Python services.', 'Develop SQL queries and Python services.')).toBe('partial');
    expect(status('Developed SQL queries and Python services.', 'Develop SQL queries and Python services.')).toBe('direct');
  });

  it.each([
    ['No SQL experience.', 'SQL required.'],
    ['I have no experience in Java.', 'Java required.'],
    ['Never led stakeholder reporting.', 'Lead stakeholder reporting.'],
    ['Not certified in PMP.', 'PMP certification required.'],
    ['Uncertified PMP candidate.', 'PMP certification required.'],
    ['Skills: No AWS', 'AWS required.'],
    ['Certifications\nNo CPA', 'CPA required.'],
    ['Skills: learning AWS', 'AWS required.'],
    ['Certifications\nCPA candidate', 'CPA required.'],
  ])('does not label negated evidence direct: %s', (cv, vacancy) => {
    expect(status(cv, vacancy)).toBe('review');
  });

  it('keeps conflicting positive and negative assertions visible', () => {
    const report = analyzeCvEvidence('Skills: SQL\nNo SQL experience.', 'SQL required.');
    expect(report.requirements[0].status).toBe('review');
    expect(report.requirements[0].evidence.map(item => item.cvQuote)).toEqual(['No SQL experience.', 'Skills: SQL']);
  });

  it('limits a negative clause rather than applying it to a separate positive statement', () => {
    expect(status('No Java experience, but used SQL to produce reports.', 'SQL required.')).toBe('direct');
  });

  it.each([
    'Pursuing a Bachelor degree in Engineering.',
    'Studying for a Bachelor degree in Engineering.',
    'Bachelor degree in Engineering expected next year.',
    'Studied for a Bachelor degree in Engineering.',
    'Education\nBachelor degree in Engineering, incomplete.',
  ])('does not equate attendance or future completion with a completed credential: %s', cv => {
    expect(status(cv, 'Bachelor degree in Engineering required.')).toBe('review');
  });

  it('requires the credential subject and does not infer one degree from a higher degree', () => {
    expect(status('Education\nBachelor degree in Finance', 'Bachelor degree in Engineering required.')).toBe('partial');
    expect(status('Education\nMaster degree in Engineering', 'Bachelor degree in Engineering required.')).toBe('partial');
    expect(status('Education\nBachelor degree in Engineering', 'Bachelor degree in Engineering required.')).toBe('direct');
  });

  it('does not treat a credential in a skills list as confirmed completion', () => {
    expect(status('Skills: PMP certification', 'PMP certification required.')).toBe('partial');
    expect(status('Certifications\nPMP certification', 'PMP certification required.')).toBe('direct');
    expect(status('Certifications\nPMP certification scheduled next month', 'PMP certification required.')).toBe('review');
    expect(status('Used the PMP certification syllabus to prepare exercises.', 'PMP certification required.')).toBe('review');
    expect(status('Education\nMaster thesis in Engineering', 'Master degree in Engineering required.')).toBe('review');
  });

  it('retains validity qualifiers and expired credentials as manual review', () => {
    expect(status('Licences\nUAE driving licence', 'Valid UAE driving licence required.')).toBe('partial');
    expect(status('Licences\nExpired UAE driving licence', 'Valid UAE driving licence required.')).toBe('review');
    expect(status('Licences\nValid UAE driving licence', 'Valid UAE driving licence required.')).toBe('direct');
  });

  it('uses explicit years and matching field, without computing duration from dates', () => {
    expect(status('Java developer | 2018–2026', 'Five years experience in Java required.')).toBe('partial');
    expect(status('Seven years experience in Java.', 'Five years experience in Java required.')).toBe('direct');
    expect(status('Two years experience in Java.', 'Five years experience in Java required.')).toBe('partial');
    expect(status('Seven years experience in Finance.\nSkills: Java', 'Five years experience in Java required.')).toBe('partial');
    expect(status('Five years experience in Java.', 'More than five years experience in Java required.')).toBe('partial');
    expect(status('Bachelor degree in Engineering and seven years Finance experience.', 'Bachelor degree in Engineering and five years Engineering experience.')).toBe('partial');
    expect(status('Seven years experience in Java.', 'Two–five years experience in Java required.')).not.toBe('direct');
  });

  it('retains unfamiliar requirements and alternatives for manual review', () => {
    const report = analyzeCvEvidence('Worked under pressure.', 'Requirements\nResilience in ambiguous environments.\nJava or Python required.');
    expect(report.requirements).toHaveLength(2);
    expect(report.requirements.every(item => item.status === 'review')).toBe(true);
    expect(report.requirements[0].vacancyQuote).toBe('Resilience in ambiguous environments.');
  });

  it('keeps a wrapped vacancy bullet whole rather than labeling its first facet direct', () => {
    const vacancy = 'Requirements\n- Develop SQL queries and\n  Python services.';
    const report = analyzeCvEvidence('Developed SQL queries.', vacancy);
    expect(report.requirements).toHaveLength(1);
    expect(report.requirements[0].vacancyQuote).toBe('Develop SQL queries and\n  Python services.');
    expect(report.requirements[0].status).toBe('partial');
  });

  it('does not discard numeric hard constraints or label generic credential words direct', () => {
    expect(status('Led a team of 2 engineers.', 'Lead a team of 10 engineers.')).toBe('review');
    expect(status('Licences\nDriving licence class 1', 'Driving licence class 2 required.')).toBe('review');
    expect(status('Certifications\nCertificate', 'Certification required.')).toBe('review');
    expect(status('Licences\nValid licence', 'Valid licence required.')).toBe('review');
  });

  it('retains omitted sections and headings exactly, including mandatory text within other sections', () => {
    const vacancy = 'About us\nWe build fictional products.\nBenefits\nPrivate healthcare.\nApplicants must hold a PMP certification.\nRequirements: SQL required.';
    const report = analyzeCvEvidence('Certifications\nPMP certification\nSkills: SQL', vacancy);
    expect(report.requirements.map(item => item.vacancyQuote)).toEqual(['Applicants must hold a PMP certification.', 'SQL required.']);
    for (const span of report.omittedSections) expect(vacancy.slice(span.start, span.end)).toBe(span.vacancyQuote);
    expect(report.omittedSections.map(item => item.vacancyQuote)).toContain('We build fictional products.');
    expect(report.omittedSections.map(item => item.vacancyQuote)).toContain('Private healthcare.');
  });

  it('caps comparison at forty and preserves every overflow clause with a clear note', () => {
    const vacancy = 'Requirements\n' + Array.from({ length: 45 }, (_, i) => `• SQL required for item ${i + 1}.`).join('\n');
    const report = analyzeCvEvidence('Skills: SQL', vacancy);
    expect(report.requirements).toHaveLength(40);
    expect(report.summary.total).toBe(40);
    expect(report.unparsedNotes.join(' ')).toMatch(/5 additional clauses/);
    expect(report.omittedSections.map(item => item.vacancyQuote)).toContain('SQL required for item 45.');
    for (const span of report.omittedSections) expect(vacancy.slice(span.start, span.end)).toBe(span.vacancyQuote);
  });

  it('warns about unsupported scripts while preserving their original requirement', () => {
    const vacancy = 'Requirements\nإجادة اللغة العربية مطلوبة';
    const report = analyzeCvEvidence('Skills: SQL', vacancy);
    expect(report.requirements[0].status).toBe('review');
    expect(report.requirements[0].vacancyQuote).toBe('إجادة اللغة العربية مطلوبة');
    expect(report.warnings.join(' ')).toMatch(/English/);
  });

  it('handles empty inputs honestly and deterministically', () => {
    expect(analyzeCvEvidence('', '').requirements).toEqual([]);
    expect(analyzeCvEvidence('', '').warnings).toHaveLength(2);
    expect(status('', 'SQL required.')).toBe('missing');
    expect(analyzeCvEvidence('Skills: SQL', 'SQL required.')).toEqual(analyzeCvEvidence('Skills: SQL', 'SQL required.'));
  });

  it('reanalyzes a user addition without changing its unverified scope', () => {
    const before = analyzeCvEvidence('Skills: SQL', 'Develop SQL queries.');
    const after = analyzeCvEvidence('Skills: SQL\nDeveloped SQL queries.', 'Develop SQL queries.');
    expect(before.requirements[0].status).toBe('partial');
    expect(after.requirements[0].status).toBe('direct');
    expect(after.scope).toMatch(/user-provided/);
  });
});

describe('conservative CV prioritization', () => {
  it('reorders only bullets inside a role while preserving every original line and heading', () => {
    const cv = 'Experience\r\nAnalyst | Fictional A | 2022–2024\r\n- Managed inventories.\r\n- Prepared stakeholder reports.\r\n\r\nAnalyst | Fictional B | 2020–2022\r\n- Wrote SQL queries.\r\n- Led teams.\r\nEducation\r\nBachelor degree in Finance';
    const reordered = prioritizeCvForVacancy(cv, analyzeCvEvidence(cv, 'Produce stakeholder reports.'));
    expect(reordered).toContain('2022–2024\r\n- Prepared stakeholder reports.\r\n- Managed inventories.');
    expect(reordered).toContain('2020–2022\r\n- Wrote SQL queries.\r\n- Led teams.');
    expect(reordered.split('\r\n').sort()).toEqual(cv.split('\r\n').sort());
    expect(reordered.indexOf('Fictional A')).toBeLessThan(reordered.indexOf('Fictional B'));
  });

  it.each([
    'Experience\nAnalyst\n- Managed inventories.\n- Prepared stakeholder reports\n  for multiple teams.\nEducation',
    'Experience\nAnalyst\n1. Managed inventories.\n2. Prepared stakeholder reports.\nEducation',
    'Skills\n- Managed inventories.\n- Prepared stakeholder reports.',
    'Experience\nAnalyst\n- Managed inventories.\n- Prepared stakeholder reports\nin 2024 for multiple teams.\nEducation',
  ])('leaves ambiguous continuations, numbered lists and other sections unchanged', cv => {
    expect(prioritizeCvForVacancy(cv, analyzeCvEvidence(cv, 'Produce stakeholder reports.'))).toBe(cv);
  });

  it('does not use stale evidence offsets to reorder an edited CV', () => {
    const cv = 'Experience\n- Managed inventories.\n- Prepared stakeholder reports.';
    const report = analyzeCvEvidence(cv, 'Produce stakeholder reports.');
    const edited = 'Updated profile\n' + cv;
    expect(prioritizeCvForVacancy(edited, report)).toBe(edited);
  });

  it('does not rank uncertain or skills-only passages as achieved tasks', () => {
    const cv = 'Experience\n- Managed inventories.\n- Never led stakeholder reporting.';
    expect(prioritizeCvForVacancy(cv, analyzeCvEvidence(cv, 'Lead stakeholder reporting.'))).toBe(cv);
  });
});
