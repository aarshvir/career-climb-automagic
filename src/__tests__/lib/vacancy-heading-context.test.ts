import { describe,it,expect } from 'vitest';
import { analyzeCvEvidence } from '@/lib/cv-evidence';

describe('listing context is not promoted into CV requirements',()=>{
  it('keeps the title and employer visible without asking for candidate-name evidence',()=>{
    const job='Graduate operations analyst\nEmployer: Fictional Example\nResponsibilities\nPrepare weekly operations reports.\nUse Excel for reporting.';
    const cv='Fictional Candidate\nINTERNSHIP\nPrepared weekly operations reports.\nSKILLS\nExcel';
    const report=analyzeCvEvidence(cv,job);
    expect(report.requirements.map(item=>item.vacancyQuote)).toEqual(['Prepare weekly operations reports.','Use Excel for reporting.']);
    expect(report.omittedSections.map(item=>item.vacancyQuote)).toContain('Graduate operations analyst');
    for(const item of [...report.requirements,...report.omittedSections])expect(job.slice(item.start,item.end)).toBe(item.vacancyQuote);
  });
  it.each(['Support a project manager','Must be a certified project manager','Have experience as a business analyst'])('preserves actual task/qualification: %s',value=>{
    expect(analyzeCvEvidence('Prepared reports.',`${value}\nPrepare reports.`).requirements.map(item=>item.vacancyQuote)).toContain(value);
  });
  it('does not strip a role-like phrase later in the actual requirements',()=>{
    const job='Requirements\nPrepare reports.\nDevelop forecasts.\nProject manager';
    expect(analyzeCvEvidence('Prepared reports.',job).requirements.map(item=>item.vacancyQuote)).toContain('Project manager');
  });
});
