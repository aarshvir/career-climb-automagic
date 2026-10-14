import { describe, expect, it } from 'vitest';
import { analyzeCvEvidence, prioritizeCvForVacancy } from '@/lib/cv-evidence';

// Synthetic fixtures supplied with the Claude customer-journey review. No real
// applicant, employer, contact address, CV or external provider is used here.
const cv = `Priya Raman (test fixture - invented person)
Dubai, UAE | priya.test@example.com | +971 50 000 0000

PROFILE
Operations and strategy manager with 7 years in retail and e-commerce. Led cost and process programmes across GCC stores.

EXPERIENCE
Senior Manager, Strategy & Operations - Gulf Home Retail (invented), Dubai | 2022 - present
- Led a 12-store replenishment redesign that cut stock-outs by 18% in 9 months
- Built the weekly KPI pack for the COO covering sales, margin and inventory
- Ran a vendor consolidation that saved AED 2.1M a year
- Coordinated a 6-person cross-functional team for the new loyalty app launch
- Introduced a demand-forecasting pilot with the data team for 300 SKUs

Manager, Business Analysis - Desert Mart Online (invented), Dubai | 2019 - 2022
- Analysed checkout funnel data and proposed 5 fixes; conversion rose 0.6 points
- Wrote SQL and Excel models for pricing reviews
- Presented monthly performance reviews to category heads

Analyst - Northpoint Consulting (invented), Mumbai | 2017 - 2019
- Supported market-entry studies for two consumer brands
- Built Excel models and slide decks for client workshops

EDUCATION
MBA, Indian School of Example (invented), 2017
B.Com, Example University, 2015

SKILLS
Excel, SQL, Power BI, stakeholder management, process improvement
`;
const vacancy = `Head of Operational Excellence - Example Retail Group (invented), Dubai

About the role
Example Retail Group is hiring a Head of Operational Excellence to lead continuous improvement across 40 stores and two distribution centres in the UAE.

Responsibilities
- Lead the operational excellence roadmap and a portfolio of improvement projects
- Use data and KPIs to identify cost, inventory and service-level opportunities
- Run lean and process-improvement workshops with store and supply chain teams
- Build business cases and track realised savings with Finance
- Partner with technology teams on automation and forecasting tools
- Report progress to the COO and the executive committee

Requirements
- 7+ years in operations, strategy or consulting, ideally in retail or e-commerce
- Proven record of delivering measurable cost savings
- Strong analytical skills: Excel, SQL or BI tools
- Experience leading cross-functional teams and change programmes
- Lean Six Sigma certification preferred
- Excellent stakeholder management with senior leaders
`;
const finding = (source: string, requirement: string) => analyzeCvEvidence(source, requirement).requirements[0];

describe('bounded evidence clarity regressions', () => {
  it('omits the role-section label while keeping its following requirements and exact spans', () => {
    const job = 'About the role\r\nDevelop SQL reports.\r\nResponsibilities\r\nProduce weekly reports.';
    const report = analyzeCvEvidence('EXPERIENCE\r\nDeveloped SQL reports.\r\nPrepared weekly reports.', job);
    expect(report.requirements.map(item => item.vacancyQuote)).toEqual(['Develop SQL reports.', 'Produce weekly reports.']);
    expect(report.requirements.map(item => item.status)).toEqual(['direct', 'direct']);
    expect(report.omittedSections.map(item => item.vacancyQuote)).toContain('About the role');
    for (const item of [...report.requirements, ...report.omittedSections]) expect(job.slice(item.start, item.end)).toBe(item.vacancyQuote);
  });

  it.each([
    'Dubai, UAE | priya.test@example.com | +971 50 000 0000',
    'Dubai, UAE | https://example.test/lead | +971 50 000 0000',
    'Email: test@example.com',
  ])('does not turn contact metadata into career evidence: %s', source => {
    const report = analyzeCvEvidence(source, 'Experience in UAE required.\nTest reports.');
    expect(report.requirements.every(item => item.status !== 'direct')).toBe(true);
    expect(report.requirements.flatMap(item => item.evidence)).toEqual([]);
  });

  it('retains a genuine work statement on a mixed contact line without changing its quote', () => {
    const source = 'Prepared monthly reports. Contact: colleague.test@example.com';
    const item = finding(source, 'Produce monthly reports.');
    expect(item.status).toBe('direct');
    expect(item.evidence[0].cvQuote).toBe(source);
    expect(source.slice(item.evidence[0].start, item.evidence[0].end)).toBe(source);
  });

  it('does not interpret skill and task words inside a portfolio URL as work', () => {
    const source = 'Portfolio: https://example.test/test?skill=SQL&work=queries';
    const item = finding(source, 'Test SQL queries.');
    expect(item.status).not.toBe('direct');
    expect(item.evidence).toEqual([]);
  });

  it.each(['Skills: SQL, Python | colleague.test@example.com', 'SKILLS\nSQL, Python | colleague.test@example.com'])('retains actual named skills next to contact details: %s', source => {
    const item = finding(source, 'SQL required.');
    expect(item.status).toBe('direct');
    expect(item.evidence[0].sourceKind).toBe('skills');
    expect(source.slice(item.evidence[0].start, item.evidence[0].end)).toBe(item.evidence[0].cvQuote);
  });

  it.each([
    ['Skills: Stakeholder management | alex@example.test', 'Stakeholder management required.'],
    ['SKILLS\nFinancial analysis | https://portfolio.example.test', 'Financial analysis required.'],
  ])('retains declared nontechnical skills alongside contact details without claiming demonstrated work: %s', (source, requirement) => {
    const item = finding(source, requirement);
    expect(item.status).toBe('partial');
    expect(item.evidence[0].sourceKind).toBe('skills');
    expect(source.slice(item.evidence[0].start, item.evidence[0].end)).toBe(item.evidence[0].cvQuote);
  });

  it.each([
    ['SKILLS\nEmail: alex@example.test', 'Email required.'],
    ['SKILLS\nPortfolio: https://portfolio.example.test/test?skill=SQL', 'SQL required.'],
  ])('does not elevate a contact-only label just because it follows a skills heading: %s', (source, requirement) => {
    expect(finding(source, requirement).evidence).toEqual([]);
  });

  it('compares a hyphenated responsibility using the same words without rewriting the source', () => {
    const source = 'EXPERIENCE\r\n- Developed demand-forecasting tools.';
    const item = finding(source, 'Develop demand forecasting tools.');
    expect(item.status).toBe('direct');
    expect(item.evidence[0].cvQuote).toBe('Developed demand-forecasting tools.');
    expect(source.slice(item.evidence[0].start, item.evidence[0].end)).toBe(item.evidence[0].cvQuote);
    const related = finding('Introduced a demand-forecasting pilot with the data team.', 'Partner with technology teams on automation and forecasting tools.');
    expect(related.status).toBe('partial');
    expect(related.evidence[0].cvQuote).toContain('demand-forecasting');
    expect(finding('Led a local event.', 'Lead forecasting tools.').status).toBe('missing');
  });

  it.each([
    ['Skills: NoSQL', 'SQL required.'],
    ['Skills: non-SQL databases', 'SQL required.'],
    ['Skills: anti-SQL databases', 'SQL required.'],
    ['Skills: contra-SQL databases', 'SQL required.'],
    ['Skills: Objective-C', 'C required.'],
    ['Skills: C++', 'C required.'],
  ])('does not gain an unsupported technology through compound splitting: %s', (source, requirement) => {
    expect(finding(source, requirement).status).not.toBe('direct');
  });

  it.each([
    ['Skills: .NET', '.NET required.'],
    ['Skills: Node.js', 'Node.js required.'],
    ['Skills: C++', 'C++ required.'],
  ])('keeps meaningful technology punctuation: %s', (source, requirement) => {
    expect(finding(source, requirement).status).toBe('direct');
  });

  it('shows literal saved/savings evidence without inventing delivery, cost or ownership facets', () => {
    const quote = 'Ran a vendor consolidation that saved AED 2.1M a year';
    const source = `EXPERIENCE\n- ${quote}`;
    const item = finding(source, 'Proven record of delivering measurable cost savings');
    expect(item.status).toBe('partial');
    expect(item.evidence[0]).toMatchObject({ cvQuote: quote, sourceKind: 'action' });
    expect(source.slice(item.evidence[0].start, item.evidence[0].end)).toBe(quote);
  });

  it.each([
    ['Never saved costs.', 'Save costs.', 'review'],
    ['Assisted in saving costs.', 'Save costs.', 'partial'],
    ['Projected cost savings; not implemented.', 'Delivered cost savings.', 'review'],
    ['Saved costs for a university project.', 'Professional experience saving costs.', 'partial'],
  ])('keeps contribution, negation, projected results and academic context: %s', (source, requirement, expected) => {
    expect(finding(source, requirement).status).toBe(expected);
  });

  it('does not reorder a role from weak partial overlap alone', () => {
    const source = 'EXPERIENCE\r\nLocal role\r\n- Saved costs through vendor consolidation.\r\n- Prepared reports.\r\n\r\nEDUCATION\r\nLocal course';
    const report = analyzeCvEvidence(source, 'Produce weekly reports.');
    expect(report.summary.partial).toBe(1);
    expect(report.summary.direct).toBe(0);
    expect(prioritizeCvForVacancy(source, report)).toBe(source);
  });

  it('does not nominate a team of six as evidence of a Lean Six Sigma qualification', () => {
    const source = `Alex Example
alex.test@example.invalid
Operations analyst | Example Manufacturing | 2021–2025
Built demand-forecasting tools in Excel for weekly production planning.
Delivered cost savings of 12% by reviewing supplier contracts.
Supported inventory reporting for a team of six analysts.
Skills: Excel, SQL, Power BI.
Education: Bachelor of Engineering, 2020.`;
    const item = finding(source, 'Lean Six Sigma certification required.');
    expect(item.status).toBe('missing');
    expect(item.evidence).toEqual([]);
    expect(item.matchedTerms).toEqual([]);
  });

  it.each([
    ['Completed First Aid certification.', 'PMP certification required.'],
    ['Managed a current, active project.', 'Current PMP certification required.'],
  ])('does not admit generic credential or status words without the named qualification: %s', (source, requirement) => {
    const item = finding(source, requirement);
    expect(item.status).toBe('missing');
    expect(item.evidence).toEqual([]);
  });

  it('retains exact named credential evidence and genuinely related qualification subjects', () => {
    expect(finding('CERTIFICATIONS\nLean Six Sigma certification', 'Lean Six Sigma certification required.').status).toBe('direct');
    expect(finding('EDUCATION\nMaster degree in Engineering', 'Bachelor degree in Engineering required.').status).toBe('partial');
  });

  it('repairs the supplied outcome evidence and preserves the existing role order without fabricating a qualification verdict', () => {
    const report = analyzeCvEvidence(cv, vacancy, 'Head of Operational Excellence');
    expect(report.requirements.some(item => item.vacancyQuote === 'About the role')).toBe(false);
    expect(report.requirements.flatMap(item => item.evidence).every(item => !item.cvQuote.includes('priya.test@example.com'))).toBe(true);
    const savings = report.requirements.find(item => item.vacancyQuote === 'Proven record of delivering measurable cost savings')!;
    expect(savings.status).toBe('partial');
    expect(savings.evidence.some(item => item.cvQuote === 'Ran a vendor consolidation that saved AED 2.1M a year')).toBe(true);
    const forecasting = report.requirements.find(item => item.vacancyQuote.startsWith('Partner with technology teams'))!;
    expect(forecasting.status).toBe('partial');
    expect(forecasting.evidence.some(item => item.cvQuote.includes('demand-forecasting pilot'))).toBe(true);
    expect(report.requirements.find(item => item.vacancyQuote === 'Lean Six Sigma certification preferred')?.status).toBe('missing');
    expect(report.requirements.find(item => item.vacancyQuote.startsWith('Experience leading cross-functional'))?.status).toBe('partial');
    expect(prioritizeCvForVacancy(cv, report)).toBe(cv);
    for (const item of report.requirements) {
      expect(vacancy.slice(item.start, item.end)).toBe(item.vacancyQuote);
      for (const passage of item.evidence) expect(cv.slice(passage.start, passage.end)).toBe(passage.cvQuote);
    }
    expect(report.scope).toMatch(/not verified/);
    expect(report).not.toHaveProperty('score');
  });
});
