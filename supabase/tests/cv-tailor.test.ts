import { describe, expect, it } from 'vitest';
import { assembleTailoredCv, bulletBlocks, numbers, parseProposal, sourceLines, tailorUserPrompt, validateRewrite, validateTailorRequest, TAILOR_SCHEMA } from '../functions/_shared/cv-tailor.ts';

const cv = `Priya Raman
Dubai, UAE | priya@example.com | +971 50 000 0000

PROFILE
Operations and strategy manager with 7 years in retail and e-commerce.

EXPERIENCE
Senior Manager, Strategy & Operations - Gulf Home Retail, Dubai | 2022 - present
- Led a 12-store replenishment redesign that cut stock-outs by 18% in 9 months
- Built the weekly KPI pack for the COO covering sales, margin and inventory
- Ran a vendor consolidation that saved AED 2.1M a year
- Supported the finance team with monthly reporting

Analyst - Northpoint Consulting, Mumbai | 2017 - 2019
- Supported market-entry studies for two consumer brands
- Built Excel models and slide decks for client workshops

EDUCATION
MBA, Indian School of Example, 2017

SKILLS
Excel, SQL, Power BI, stakeholder management`;

const line = (n: number) => sourceLines(cv).find(item => item.n === n)!.text.replace(/^\s*-\s+/u, '');

describe('source structure', () => {
  it('numbers every line and finds the editable bullet blocks', () => {
    const lines = sourceLines(cv);
    expect(lines[0]).toMatchObject({ n: 1, kind: 'name' });
    expect(lines.find(item => item.n === 8)!.kind).toBe('role');
    expect(bulletBlocks(lines)).toEqual([[9, 10, 11, 12], [15, 16]]);
  });
  it('extracts numeric facts in canonical form', () => {
    expect(numbers('cut stock-outs by 18% and saved AED 2.1M across 1,200 SKUs')).toEqual(['18%', '2.1m', '1200']);
  });
});

describe('rewrite validator rejects invented or inflated facts', () => {
  const src = 'Supported the finance team with monthly reporting';
  const cases: [string, string, string][] = [
    ['new number', src, 'Supported the finance team with monthly reporting for 40 stores'],
    ['new percentage', 'Built the weekly KPI pack for the COO', 'Built the weekly KPI pack for the COO, improving accuracy by 20%'],
    ['changed number', 'Ran a vendor consolidation that saved AED 2.1M a year', 'Ran a vendor consolidation that saved AED 3.1M a year'],
    ['inflated money unit', 'Saved AED 2.1M a year', 'Saved AED 2.1bn a year'],
    ['new year', 'Built Excel models for client workshops', 'Built Excel models for client workshops in 2021'],
    ['new employer', src, 'Supported the Example Retail Group finance team with monthly reporting'],
    ['new tool', 'Built Excel models and slide decks', 'Built Excel and Tableau models and slide decks'],
    ['new acronym', 'Built the weekly KPI pack', 'Built the weekly KPI pack in SAP'],
    ['new place', 'Supported market-entry studies for two consumer brands', 'Supported market-entry studies in Saudi Arabia for two consumer brands'],
    ['new certification word', src, 'Supported the finance team with monthly reporting as a certified analyst'],
    ['lean six sigma', 'Ran process improvement workshops', 'Ran Lean Six Sigma process improvement workshops'],
    ['pmp', 'Coordinated the project plan', 'Coordinated the project plan as a PMP'],
    ['degree', 'Supported market studies', 'Supported market studies using my MBA training'],
    ['led from supported', src, 'Led monthly reporting for the finance team'],
    ['managed from supported', src, 'Managed the monthly reporting cycle for finance'],
    ['owned from assisted', 'Assisted with the loyalty app launch', 'Owned the loyalty app launch'],
    ['spearheaded from helped', 'Helped prepare the budget', 'Spearheaded budget preparation'],
    ['headed from coordinated', 'Coordinated a cross-functional team', 'Headed a cross-functional team'],
    ['directed from participated', 'Participated in pricing reviews', 'Directed pricing reviews'],
    ['oversaw from contributed', 'Contributed to the store rollout', 'Oversaw the store rollout'],
    ['delivered from supported', 'Supported the store rollout', 'Delivered the store rollout'],
    ['multi-line', src, 'Supported the finance team\nLed reporting'],
    ['empty', src, '   '],
    ['far too long', 'Built models', 'Built models '.repeat(40)],
    ['new team size', 'Coordinated a cross-functional team', 'Coordinated a 6-person cross-functional team'],
    ['new count words as digits', 'Supported market-entry studies', 'Supported 3 market-entry studies'],
    ['new client name', 'Built slide decks for client workshops', 'Built slide decks for Unilever workshops'],
    ['new product name', 'Introduced a demand-forecasting pilot', 'Introduced a demand-forecasting pilot on Salesforce'],
    ['new chartered status', 'Prepared management accounts', 'Prepared management accounts as a Chartered Accountant'],
    ['new licence', 'Advised clients on tax', 'Advised clients on tax as a licensed adviser'],
    ['new black belt', 'Ran improvement workshops', 'Ran improvement workshops as a Green Belt'],
    ['new scrum master', 'Coordinated sprint planning', 'Coordinated sprint planning as Scrum Master'],
    ['new company opening a sentence', 'Supported market-entry studies for two consumer brands', 'Unilever market-entry studies supported for two consumer brands'],
    ['new product opening a later sentence', 'Introduced a demand-forecasting pilot', 'Introduced a forecasting pilot. Salesforce dashboards tracked it'],
    ['new acronym opening a sentence', 'Built the weekly KPI pack', 'SAP reporting pack built weekly'],
  ];
  it.each(cases)('rejects %s', (_label, source, after) => {
    expect(validateRewrite(after, [source])).not.toBeNull();
  });
});

describe('rewrite validator accepts truthful rewording', () => {
  const good: [string, string][] = [
    ['Built the weekly KPI pack for the COO covering sales, margin and inventory', 'Built the weekly KPI reporting pack for the COO, tracking sales, margin and inventory performance'],
    ['Ran a vendor consolidation that saved AED 2.1M a year', 'Delivered AED 2.1M in annual cost savings by running a vendor consolidation'],
    ['Led a 12-store replenishment redesign that cut stock-outs by 18% in 9 months', 'Led a 12-store replenishment process improvement that cut stock-outs by 18% in 9 months'],
    ['Supported the finance team with monthly reporting', 'Supported the finance team with monthly performance reporting'],
    ['Supported market-entry studies for two consumer brands', 'Supported market-entry analysis for two consumer brands'],
    ['Reduced late deliveries by 22% by redesigning the dispatch schedule', 'Redesigned the dispatch schedule, reducing late deliveries by 22%'],
    ['BSc Economics. Cleaned a survey dataset in Python. Presented findings to the tutor.', 'Economics undergraduate who cleaned a survey dataset in Python. Brings experience presenting findings.'],
  ];
  it.each(good)('accepts a rewrite of "%s"', (source, after) => {
    expect(validateRewrite(after, [source])).toBeNull();
  });
});

describe('assembly keeps the CV structure and every original line', () => {
  it('applies valid rewrites, rejects invalid ones and never drops lines', () => {
    const result = assembleTailoredCv(cv, {
      rewrites: [
        { n: 10, text: 'Built the weekly KPI reporting pack for the COO, tracking sales, margin and inventory performance' },
        { n: 12, text: 'Led monthly reporting for the finance team' },
        { n: 8, text: 'Head of Operations - Gulf Home Retail' },
        { n: 1, text: 'Dr Priya Raman' },
      ],
      orders: [[11, 9, 10, 12], [16, 15], [9, 15]],
      summary: { text: 'Operations and strategy manager with 7 years in retail and e-commerce, focused on cost and inventory improvement.', sources: [5, 9, 11] },
      questions: ['Did you run the lean workshops yourself, or support someone who did?', 'x'],
    });
    const out = result.text.split('\n');
    expect(out[0]).toBe('Priya Raman');
    expect(result.text).toContain('Senior Manager, Strategy & Operations - Gulf Home Retail, Dubai | 2022 - present');
    expect(result.text).toContain('- Built the weekly KPI reporting pack for the COO, tracking sales, margin and inventory performance');
    expect(result.text).toContain('- Supported the finance team with monthly reporting');
    expect(result.text).not.toContain('Led monthly reporting');
    expect(result.rejected.map(item => item.n)).toEqual(expect.arrayContaining([12, 8, 1]));
    const experience = out.slice(out.indexOf('EXPERIENCE'));
    expect(experience[2]).toBe('- Ran a vendor consolidation that saved AED 2.1M a year');
    expect(experience.indexOf('- Built Excel models and slide decks for client workshops')).toBeLessThan(experience.indexOf('- Supported market-entry studies for two consumer brands'));
    for (const n of [9, 11, 15, 16]) expect(result.text).toContain(line(n));
    expect(result.text).toContain('focused on cost and inventory improvement');
    expect(result.text).not.toContain('Operations and strategy manager with 7 years in retail and e-commerce.\n');
    expect(result.questions).toEqual(['Did you run the lean workshops yourself, or support someone who did?']);
    expect(result.changes.some(change => change.kind === 'summary' && change.before.includes('7 years'))).toBe(true);
  });
  it('rejects a summary that invents a number or cites nothing', () => {
    expect(assembleTailoredCv(cv, { summary: { text: 'Manager with 12 years in retail.', sources: [5] } }).rejected[0].reason).toMatch(/number/u);
    expect(assembleTailoredCv(cv, { summary: { text: 'Retail operations manager.', sources: [] } }).rejected[0].reason).toMatch(/cite/u);
  });
  it('inserts a profile after the header when the CV has none', () => {
    const plain = cv.replace('PROFILE\nOperations and strategy manager with 7 years in retail and e-commerce.\n\n', '');
    const result = assembleTailoredCv(plain, { summary: { text: 'Operations and strategy manager focused on retail cost improvement.', sources: [8] } });
    expect(result.text.split('\n').slice(0, 6)).toEqual(['Priya Raman', 'Dubai, UAE | priya@example.com | +971 50 000 0000', '', 'PROFILE', 'Operations and strategy manager focused on retail cost improvement.', '']);
  });
  it('ignores partial or foreign bullet orders', () => {
    const result = assembleTailoredCv(cv, { orders: [[9, 10], [9, 10, 11, 99], [15, 15]] });
    expect(result.text).toBe(cv);
    expect(result.changes).toEqual([]);
  });
  it('returns the original CV unchanged for an empty proposal', () => {
    expect(assembleTailoredCv(cv, {}).text).toBe(cv);
  });
});

describe('request and response handling', () => {
  it('accepts exactly the expected request shape with consent', () => {
    const ok = { requestId: '7d1f3a52-1b2c-4d3e-9f4a-5b6c7d8e9f01', cvText: cv, jobDescription: 'Head of Operational Excellence. Lead continuous improvement across 40 stores and two distribution centres.', jobTitle: 'Head of Operational Excellence', company: 'Example', consent: true };
    expect(validateTailorRequest(ok).jobTitle).toBe('Head of Operational Excellence');
    expect(() => validateTailorRequest({ ...ok, consent: false })).toThrow(/AI provider/u);
    expect(() => validateTailorRequest({ ...ok, extra: 1 })).toThrow();
    expect(() => validateTailorRequest({ ...ok, requestId: 'x' })).toThrow();
    expect(() => validateTailorRequest({ ...ok, cvText: 'short' })).toThrow(/CV/u);
    expect(() => validateTailorRequest({ ...ok, jobDescription: 'a'.repeat(20001) })).toThrow(/job description/u);
  });
  it('parses fenced or padded model JSON and drops malformed parts', () => {
    const proposal = parseProposal('```json\n{"rewrites":[{"n":11,"text":"x"},{"n":"bad"}],"orders":[[1,2],["a"]],"summary":{"text":"","sources":[]},"questions":["Q?",3]}\n```');
    expect(proposal.rewrites).toEqual([{ n: 11, text: 'x', facts: [] }]);
    expect(proposal.orders).toEqual([[1, 2]]);
    expect(proposal.summary).toBeNull();
    expect(proposal.questions).toEqual(['Q?']);
    expect(() => parseProposal('no json')).toThrow();
  });
  it('sends numbered, typed lines and a strict schema to the model', () => {
    const prompt = tailorUserPrompt(cv, 'Head of Ops', 'Example', 'Lead operational excellence.');
    expect(prompt).toContain('9 [bullet] - Led a 12-store replenishment redesign');
    expect(prompt).toContain('8 [role] Senior Manager');
    expect((TAILOR_SCHEMA as { required: string[] }).required).toEqual(['rewrites', 'orders', 'additions', 'summary', 'questions']);
  });
});

describe('answers the candidate confirmed (deep tailor)', () => {
  const facts = ['I ran the monthly reporting cycle for the finance team myself, covering 14 cost centres.', 'I trained 6 store managers to use the Power BI sales dashboard.'];
  const role = 'Senior Manager, Strategy & Operations - Gulf Home Retail, Dubai | 2022 - present';
  const rewrite = 'Ran the monthly reporting cycle for the finance team across 14 cost centres';
  it('lets a rewrite use an answer it cites, and only that answer', () => {
    const cited = assembleTailoredCv(cv, { rewrites: [{ n: 12, text: rewrite, facts: [1] }] }, facts, [12, 8]);
    expect(cited.rejected).toEqual([]);
    expect(cited.changes).toEqual([{ kind: 'rewrite', n: 12, before: '- Supported the finance team with monthly reporting', after: `- ${rewrite}`, sources: [12], facts: [1] }]);
    for (const facts_ of [[], [2], [7]]) {
      const result = assembleTailoredCv(cv, { rewrites: [{ n: 12, text: rewrite, facts: facts_ }] }, facts, [12, 8]);
      expect(result.changes).toEqual([]);
      expect(result.rejected[0].reason).toMatch(/number|different CV line/u);
    }
    expect(assembleTailoredCv(cv, { rewrites: [{ n: 12, text: rewrite, facts: [1] }] }).rejected).toHaveLength(1);
    expect(assembleTailoredCv(cv, { rewrites: [{ n: 12, text: 'Ran the monthly reporting cycle across 20 cost centres', facts: [1] }] }, facts, [12, 8]).rejected[0].reason).toMatch(/\(20\)/u);
  });
  it('adds a new bullet from an answer first under a role and keeps every original line', () => {
    const added = 'Trained 6 store managers to use the Power BI sales dashboard';
    const result = assembleTailoredCv(cv, { additions: [{ after: 8, text: added, facts: [2] }] }, facts, [12, 8]);
    expect(result.rejected).toEqual([]);
    const lines = result.text.split('\n');
    expect(lines[lines.indexOf(role) + 1]).toBe(`- ${added}`);
    expect(result.changes).toEqual([{ kind: 'addition', n: 8, before: '', after: `- ${added}`, sources: [8], facts: [2] }]);
    for (const original of cv.split('\n')) expect(lines).toContain(original);
  });
  it('places a new line after its bullet even when that bullet moves', () => {
    const added = 'Ran the monthly reporting cycle across 14 cost centres';
    const result = assembleTailoredCv(cv, { orders: [[12, 9, 10, 11]], additions: [{ after: 12, text: added, facts: [1] }] }, facts, [12, 8]);
    const lines = result.text.split('\n');
    expect(lines.slice(lines.indexOf(role) + 1, lines.indexOf(role) + 3)).toEqual(['- Supported the finance team with monthly reporting', `- ${added}`]);
  });
  it('rejects new lines that cite no answer, sit outside a role or go beyond the answer', () => {
    const reasons = (additions: { after: number; text: string; facts: number[] }[], given = facts) => assembleTailoredCv(cv, { additions }, given, [12, 8]).rejected.map(item => item.reason);
    expect(reasons([{ after: 8, text: 'Trained 6 store managers on Power BI', facts: [] }])[0]).toMatch(/answers/u);
    expect(reasons([{ after: 8, text: 'Trained 6 store managers on Power BI', facts: [2] }], [])[0]).toMatch(/answers/u);
    expect(reasons([{ after: 7, text: 'Trained 6 store managers on Power BI', facts: [2] }])[0]).toMatch(/role/u);
    expect(reasons([{ after: 8, text: 'Trained 8 store managers on Power BI', facts: [2] }])[0]).toMatch(/number/u);
    expect(reasons([{ after: 8, text: 'Trained 6 store managers on Tableau', facts: [2] }])[0]).toMatch(/Tableau/u);
    const many = Array.from({ length: 7 }, () => ({ after: 8, text: 'Trained 6 store managers on Power BI', facts: [2] }));
    const result = assembleTailoredCv(cv, { additions: many }, facts, [12, 8]);
    expect(result.changes).toHaveLength(5);
    expect(result.rejected).toHaveLength(2);
  });
  it('lets the summary cite answers as well as CV lines', () => {
    const text = 'Operations and strategy manager who ran monthly reporting for the finance team across 14 cost centres.';
    const result = assembleTailoredCv(cv, { summary: { text, sources: [5, 12], facts: [1] } }, facts, [12, 8]);
    expect(result.changes).toEqual([expect.objectContaining({ kind: 'summary', after: text, sources: [5, 12], facts: [1] })]);
    expect(assembleTailoredCv(cv, { summary: { text, sources: [5], facts: [] } }, facts, [12, 8]).rejected).toHaveLength(1);
  });
  it('accepts up to five answers of 10 to 400 characters and nothing else', () => {
    const ok = { requestId: '7d2c1a9e-3b4f-4c5d-8e6f-1a2b3c4d5e6f', cvText: cv, jobDescription: 'Lead operational excellence across retail operations, reporting and vendor management for a growing group.', jobTitle: 'Head of Ops', company: 'Example', consent: true };
    expect(validateTailorRequest(ok).facts).toEqual([]);
    expect(validateTailorRequest({ ...ok, facts: ['  I ran the   monthly reporting cycle myself.  '], factSources: [12] }).facts).toEqual(['I ran the monthly reporting cycle myself.']);
    for (const facts_ of [[], Array(6).fill('I ran the monthly reporting cycle.'), ['too short'], ['x'.repeat(401)], 'I ran the reporting cycle myself.', ['I ran it\0 myself, for a year.'], [42]]) {
      expect(() => validateTailorRequest({ ...ok, facts: facts_ })).toThrow();
    }
    expect(() => validateTailorRequest({ ...ok, facts: ['I ran the monthly reporting cycle.'], extra: true })).toThrow();
  });
  it('lists the confirmed answers in the prompt only when there are some', () => {
    expect(tailorUserPrompt(cv, 'Head of Ops', 'Example', 'Lead operational excellence.', facts, [12, 8])).toContain('A1 [CV line 12]: I ran the monthly reporting cycle');
    expect(tailorUserPrompt(cv, 'Head of Ops', 'Example', 'Lead operational excellence.')).not.toContain('ANSWERS');
    expect(parseProposal('{"rewrites":[],"orders":[],"additions":[{"after":8,"text":"x","facts":[2,"a"]},{"after":"no","text":"y"}],"summary":{"text":"s","sources":[5],"facts":[1]},"questions":[]}')).toMatchObject({ additions: [{ after: 8, text: 'x', facts: [2] }], summary: { facts: [1] } });
  });
});

describe('deep tailoring answer placement authority', () => {
  const facts = ['I trained 6 store managers to use the Power BI sales dashboard.'];
  const addition = { additions: [{ after: 14, text: 'Trained 6 store managers to use the Power BI sales dashboard', facts: [1] }] };
  it('rejects an answer transferred into another employer even when its words are all authorized', () => {
    const result = assembleTailoredCv(cv, addition, facts, [8]);
    expect(result.text).toBe(cv); expect(result.changes).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/different CV line/);
  });
  it('does not let a fact strengthen an unrelated bullet within the same employer', () => {
    const result = assembleTailoredCv(cv, { rewrites: [{ n: 12, text: 'Trained 6 store managers to use the Power BI sales dashboard', facts: [1] }] }, facts, [8]);
    expect(result.changes).toEqual([]); expect(result.rejected[0].reason).toMatch(/different CV line/);
  });
  it('requires the summary to carry the actual answer source citation', () => {
    const result = assembleTailoredCv(cv, { summary: { text: facts[0], sources: [14], facts: [1] } }, facts, [8]);
    expect(result.changes).toEqual([]); expect(result.rejected[0].reason).toMatch(/chosen CV line/);
  });
  it('does not promote a negated ownership answer or a forecast into a result', () => {
    for (const answer of ['I did not lead reporting for 14 cost centres.', 'I projected reporting savings for 14 cost centres.']) {
      const result = assembleTailoredCv(cv, { rewrites: [{ n: 12, text: 'Led reporting for 14 cost centres', facts: [1] }] }, [answer], [12]);
      expect(result.changes).toEqual([]); expect(result.rejected[0].reason).toMatch(/negative, uncertain or projected/);
    }
  });
  it('rejects answers without a chosen source, mismatched counts, headers and non-existent lines', () => {
    const request = { requestId: '7d2c1a9e-3b4f-4c5d-8e6f-1a2b3c4d5e6f', cvText: cv, jobDescription: 'Lead operational excellence across retail operations, reporting and vendor management for a growing group.', jobTitle: 'Head of Ops', company: 'Example', consent: true, facts };
    for (const factSources of [undefined, [], [8, 14], [1], [7], [999], ['8']]) expect(() => validateTailorRequest({ ...request, ...(factSources === undefined ? {} : { factSources }) })).toThrow();
    expect(validateTailorRequest({ ...request, factSources: [8] }).factSources).toEqual([8]);
  });
});
