import { describe,expect,it } from 'vitest';
import { analyzeCvEvidence } from '@/lib/cv-evidence';

describe('complete evidence source context',()=>{
  it('retains team contribution and nonimplementation beside an estimated result',()=>{
    const passage='In a four-person university team, I built the Excel model. We estimated a possible 25% cost reduction; the proposal was not implemented.';
    const cv=`Academic projects\n${passage}`;
    const finding=analyzeCvEvidence(cv,'Deliver implemented cost reductions and present results to stakeholders.').requirements[0];
    expect(finding.status).toBe('review');
    expect(finding.explanation).toMatch(/estimate, forecast or proposal/);
    expect(finding.evidence.length).toBeGreaterThan(0);
    for(const evidence of finding.evidence){expect(evidence.cvQuote).toBe(passage);expect(cv.slice(evidence.start,evidence.end)).toBe(passage);expect(evidence.line).toBe(2);}
  });
  it('keeps an unrelated negation visible without applying it to another skill',()=>{
    const cv='No Java experience, but used SQL to produce reports.';
    const finding=analyzeCvEvidence(cv,'SQL required.').requirements[0];
    expect(finding.status).toBe('direct');expect(finding.evidence[0].cvQuote).toBe(cv);
  });
  it('does not turn forecasting work itself into an implemented-result requirement',()=>{
    const finding=analyzeCvEvidence('Built Excel forecasts for a university project.','Build Excel forecasts.').requirements[0];
    expect(finding.status).toBe('direct');
  });
  it('separates explicitly new comma-delimited tasks and retains literal vacancy offsets',()=>{
    const vacancy='Graduate Data Analyst.\nClean Excel data, build Power BI charts, prepare reports, work in a team, Basic SQL is required.';
    const cv='Academic projects\nBuilt Power BI charts for a university project.\nSkills: Excel, basic Power BI, written communication. No SQL experience.';
    const report=analyzeCvEvidence(cv,vacancy);
    expect(report.omittedSections[0].vacancyQuote).toBe('Graduate Data Analyst.');
    expect(report.requirements).toHaveLength(5);
    const sql=report.requirements.find(item=>item.vacancyQuote==='Basic SQL is required.')!;
    expect(sql.status).toBe('review');expect(sql.explanation).toMatch(/explicitly describes missing experience/);
    expect(new Set(sql.evidence.map(item=>`${item.start}:${item.end}`)).size).toBe(sql.evidence.length);
    for(const item of report.requirements)expect(vacancy.slice(item.start,item.end)).toBe(item.vacancyQuote);
  });
  it('does not split shared-object lists or qualifications into invented requirements',()=>{
    const report=analyzeCvEvidence('Prepared financial, risk and stakeholder reports.','Prepare financial, risk and stakeholder reports.');
    expect(report.requirements).toHaveLength(1);expect(report.requirements[0].status).toBe('direct');
  });
  it('does not relate another basic skill to SQL based only on the word basic',()=>{
    expect(analyzeCvEvidence('Skills: Basic Power BI.','Basic SQL is required.').requirements[0].status).toBe('missing');
  });
  it.each([['INTERNSHIP','internship'],['INTERNSHIPS','internship'],['VOLUNTEERING','volunteering'],['PERSONAL PROJECTS','personal_project']] as const)('does not carry academic context through a %s heading',(heading,kind)=>{
    const cv=`ACADEMIC PROJECTS\nBuilt Excel charts for a university project.\n${heading}\nAssisted in leading Python reporting at Fictional Example Analytics.`;
    const finding=analyzeCvEvidence(cv,'Lead Python reporting.').requirements[0];
    expect(finding.evidence[0].contextKind).toBe(kind);expect(finding.status).not.toBe('direct');
    expect(finding.evidence[0].cvQuote).toContain('Assisted');
  });
  it('uses the entered role to keep company/location title headers out of requirements without discarding actual criteria',()=>{
    const header='Graduate Data Analyst at Fictional Example Analytics, Dubai.';
    const vacancy=`${header}\nGraduate Data Analyst with SQL experience required.\nBuild Excel charts.`;
    const report=analyzeCvEvidence('Built Excel charts.\nSkills: SQL',vacancy,'Graduate Data Analyst');
    expect(report.omittedSections[0].vacancyQuote).toBe(header);
    expect(report.requirements).toHaveLength(2);
    expect(report.requirements[0].vacancyQuote).toContain('SQL experience required');
  });
  it('handles the independently audited one-paragraph vacancy without bundling required SQL into supported tools',()=>{
    const vacancy='Fictional Cedar Operations — Data Analyst Intern. Responsibilities: clean spreadsheet data, build Power BI dashboards, communicate findings in clear reports, collaborate in a team, and use SQL to query operational data. Requirements: current university student, Excel, Power BI, basic SQL, attention to detail and written communication. Coursework projects and internship experience are welcome.';
    const cv='EDUCATION\nCurrent university student.\nSKILLS\nExcel, basic Power BI, written communication. No SQL experience.';
    const report=analyzeCvEvidence(cv,vacancy,'Data Analyst Intern');
    expect(report.omittedSections.map(item=>item.vacancyQuote)).toContain('Fictional Cedar Operations — Data Analyst Intern.');
    expect(report.requirements.some(item=>item.vacancyQuote==='basic SQL' && item.status==='review')).toBe(true);
    expect(report.requirements.some(item=>item.vacancyQuote==='Excel' && item.status==='direct')).toBe(true);
    expect(report.requirements.some(item=>item.vacancyQuote==='Power BI' && item.status==='direct')).toBe(true);
    expect(report.requirements.some(item=>item.vacancyQuote==='communicate findings in clear reports')).toBe(true);
    expect(report.requirements.some(item=>item.vacancyQuote==='collaborate in a team')).toBe(true);
    for(const item of [...report.requirements,...report.omittedSections])expect(vacancy.slice(item.start,item.end)).toBe(item.vacancyQuote);
  });
});
