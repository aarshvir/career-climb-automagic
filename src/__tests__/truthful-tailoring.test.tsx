import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TruthfulTailoring from '@/pages/TruthfulTailoring';
import CvCheckLanding from '@/pages/CvCheckLanding';
import { cvCheckCostText, cvCheckFaqs } from '@/lib/cv-check-faqs';
import { AI_SENT_TEXT, checkedExamples, exampleResult, slipThroughExamples, tailoringFaqs, truthfulTailoringStructuredNodes } from '@/lib/truthful-tailoring';
import { staticPageMeta } from '@/lib/public-site-meta';
import { assembleTailoredCv, sourceLines, validateRewrite } from '../../supabase/functions/_shared/cv-tailor';

vi.unmock('react-router-dom');
afterEach(cleanup);
const renderPage = () => render(<HelmetProvider><MemoryRouter initialEntries={['/truthful-cv-tailoring']}><TruthfulTailoring /></MemoryRouter></HelmetProvider>);

describe('public AI tailoring page', () => {
  it('has one h1, starts the check at /check, and states the account requirement beside "free"', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI CV tailoring: how the AI’s suggestions are checked');
    for (const link of screen.getAllByRole('link', { name: /Start the free CV check/ })) expect(link).toHaveAttribute('href', '/check');
    expect(screen.getByText(/Free account\. AI tailoring is optional/)).toBeInTheDocument();
  });

  it('shows the result the product check returns for each invented suggestion, never a typed-in result', () => {
    renderPage();
    const tables = screen.getAllByRole('table');
    const [checks, worked, slips] = tables;
    expect(within(checks).getAllByRole('row').slice(1)).toHaveLength(9);
    const workedRows = within(worked).getAllByRole('row').slice(1);
    expect(workedRows).toHaveLength(checkedExamples.length);
    checkedExamples.forEach((example, index) => {
      expect(workedRows[index]).toHaveTextContent(example.suggestion);
      expect(workedRows[index]).toHaveTextContent(exampleResult(example) === 'kept' ? 'Kept' : 'Left out');
    });
    const slipRows = within(slips).getAllByRole('row').slice(1);
    expect(slipRows).toHaveLength(slipThroughExamples.length);
    slipRows.forEach(row => expect(row).toHaveTextContent('Passes the checks'));
    expect(screen.getAllByText(/Invented example for illustration\. Not a customer result\./)).toHaveLength(2);
  });

  it('pins the outcome of every example so a change to the checks forces a change to the page', () => {
    expect(checkedExamples.map(exampleResult)).toEqual(['kept', 'left-out', 'left-out', 'left-out', 'left-out', 'left-out']);
    expect(slipThroughExamples.map(exampleResult)).toEqual(['kept', 'kept', 'kept']);
    expect(validateRewrite(checkedExamples[1].suggestion, [checkedExamples[1].source])).toMatch(/Adds a number .*40/);
    expect(validateRewrite(checkedExamples[2].suggestion, [checkedExamples[2].source])).toMatch(/Tableau/);
    expect(validateRewrite(checkedExamples[3].suggestion, [checkedExamples[3].source])).toMatch(/qualification/);
    expect(validateRewrite(checkedExamples[4].suggestion, [checkedExamples[4].source])).toMatch(/stronger ownership/);
    expect(validateRewrite(checkedExamples[5].suggestion, [checkedExamples[5].source])).toMatch(/exact wording/);
  });

  it('describes only checks the product code really makes', () => {
    const reject = (source: string, after: string) => validateRewrite(after, [source]);
    // Numbers: a changed amount counts as an added number.
    expect(reject('Saved AED 2.1M a year', 'Saved AED 3.1M a year')).toMatch(/number/);
    // Qualifications named on the page.
    for (const word of ['certified', 'licensed', 'chartered', 'degree', 'MBA', 'PMP']) expect(reject('Prepared the budget', `Prepared the budget as a ${word} analyst`), word).toMatch(/qualification|name or term/);
    // Ownership verbs named on the page, when the line has none from the list.
    for (const verb of ['Led', 'Managed', 'Owned', 'Built', 'Launched', 'Delivered']) expect(reject('Supported the store rollout', `${verb} the store rollout`), verb).toMatch(/ownership/);
    // Cautious wording named on the page must be kept exactly.
    for (const word of ['projected', 'estimated', 'planned', 'expected', 'not', 'never', 'would', 'might']) expect(reject(`Savings ${word} from the pilot`, 'Savings from the pilot'), word).toMatch(/exact wording/);
    // Length: the larger of 260 characters or 1.8 times the line; one line only.
    const words = (count: number) => Array(count).fill('prepared').join(' ');
    expect(words(29)).toHaveLength(260);
    expect(reject('prepared reports', words(29))).toBeNull();
    expect(reject('prepared reports', `${words(29)}s`)).toMatch(/longer/);
    expect(reject('prepared reports', 'prepared\nreports')).toMatch(/one line/);
  });

  it('lists as not checked only what the code really does not catch', () => {
    const accepts = (source: string, after: string) => expect(validateRewrite(after, [source]), after).toBeNull();
    accepts('Prepared monthly reports', 'Prepared monthly reports for forty stores');
    accepts('Prepared monthly reports', 'Prepared monthly reports using python and tableau');
    accepts('Supported the finance team', 'Supported the finance team as a qualified accountant');
    accepts('Supported the store rollout', 'Developed the store rollout');
    accepts('Supported the store rollout', 'Implemented the store rollout');
    accepts('Led the weekly KPI pack and supported the COO', 'Led the weekly KPI pack and ran the COO review');
    // Digits are caught even when the source wrote the number as a word.
    expect(validateRewrite('Prepared monthly reports for 12 stores', ['Prepared monthly reports for forty stores'])).toMatch(/number/);
  });

  it('states the remaining gaps exactly as the code has them', () => {
    const accepts = (source: string, after: string) => expect(validateRewrite(after, [source]), after).toBeNull();
    // A listed noun switches the ownership check off for the whole line.
    accepts('Supported the Head of Finance with reports', 'Led monthly reporting for finance');
    accepts('Supported the team lead with reports', 'Managed reports for the team');
    // Hedges that are not on the list are not caught; the listed ones, including the month May, are.
    accepts('Aimed to cut stock-outs', 'Cut stock-outs');
    accepts('Approximately 200 stores supported', '200 stores supported');
    accepts('Ran a pilot of the loyalty app', 'Ran the loyalty app');
    expect(validateRewrite('Prepared reports', ['Reports prepared in May 2023'])).toMatch(/exact wording/);
    // Common title words are exempt from the new-name check; unusual capitalised words are not.
    accepts('Analyst on the finance team', 'Senior Analyst on the finance team');
    accepts('Analyst on the finance team', 'Executive Analyst on the finance team');
    expect(validateRewrite('Analyst on the finance team Zorbex', ['Analyst on the finance team'])).toMatch(/name or term/);
    // Numbers are matched by value anywhere in the line, so a swap passes.
    accepts('Cut costs by 18% and late deliveries by 5%', 'Cut costs by 5% and late deliveries by 18%');
    // The length base is the line plus any answer used.
    const line = 'Prepared monthly reports for the finance team';
    const answer = 'I prepared monthly reports for the finance team across all regions and presented the results to the board every month for several years in a row';
    const long = `${line} ${answer}`.slice(0, 300);
    expect(validateRewrite(long, [line])).toBeNull();
    expect(validateRewrite(`${long} ${long}`.slice(0, 700), [line, answer])).toMatch(/longer/);
  });

  it('profile headings: only Profile, Summary or Objective (with an optional Professional or Career prefix) are replaced', () => {
    const profileCv = (heading: string) => ['Jane Doe', 'Dubai | jane@example.com', '', heading, 'Analyst with reporting experience.', '', 'EXPERIENCE', 'Analyst, Acme', '- Prepared monthly reports'].join('\n');
    const run = (heading: string) => assembleTailoredCv(profileCv(heading), { summary: { text: 'Analyst with reporting experience and monthly reports.', sources: [5, 9] } });
    for (const heading of ['PROFILE', 'Professional Summary', 'Career Objective']) {
      const result = run(heading);
      expect(result.text, heading).not.toContain('Analyst with reporting experience.');
      expect(result.changes.find(change => change.kind === 'summary')?.before, heading).toBe('Analyst with reporting experience.');
    }
    for (const heading of ['Executive Summary', 'About Me']) {
      const result = run(heading);
      expect(result.text, heading).toContain('Analyst with reporting experience.');
      expect(result.text, heading).toContain('PROFILE');
      expect(result.changes.find(change => change.kind === 'summary')?.before, heading).toBe('');
    }
  });

  it('checks a profile against all the lines it cites together, so figures and verbs can sit beside other roles', () => {
    const cv = ['Jane Doe', 'Dubai | jane@example.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Supported the finance team', 'Intern, Globex', '- Led a 12-store rollout that cut costs by 18%'].join('\n');
    const result = assembleTailoredCv(cv, { summary: { text: 'Supported the finance team and led a rollout that cut costs by 18%.', sources: [6, 8] } });
    expect(result.rejected).toEqual([]);
    expect(result.changes.some(change => change.kind === 'summary')).toBe(true);
  });

  it('states the layout, number, language and answer limits as the code has them', () => {
    const nl = '\n';
    // Numbers compare as written with the following % or unit letter, so months and millions look alike.
    expect(validateRewrite('Managed a budget of 12 million', ['Managed a budget of 12 months'])).toBeNull();
    expect(validateRewrite('Cut costs by 18 percent', ['Cut costs by 18%'])).toMatch(/number/);
    // Word lists are English.
    expect(validateRewrite('soutenu les rapports mensuels et dirigi les ateliers', ['soutenu les rapports mensuels'])).toBeNull();
    // A line with a listed word anywhere switches the ownership check off.
    expect(validateRewrite('Oversaw reporting run rate', ['Supported reporting run rate'])).toBeNull();
    // An all-capitals name reads as a heading, so the contact line under it is plain text and can be reworded.
    const caps = ['AARSH GUPTA', 'Dubai | a@b.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Prepared monthly reports'].join(nl);
    expect(sourceLines(caps).map(line => line.kind).slice(0, 2)).toEqual(['heading', 'text']);
    expect(assembleTailoredCv(caps, { rewrites: [{ n: 2, text: 'Dubai | a@b.com | open to relocation' }] }).changes.map(change => change.kind)).toEqual(['rewrite']);
    // With no recognised name or contact line and no profile heading, a valid profile is dropped without a note.
    const noName = ['EXPERIENCE', 'Analyst, Acme', '- Prepared monthly reports'].join(nl);
    const dropped = assembleTailoredCv(noName, { summary: { text: 'Prepared monthly reports.', sources: [3] } });
    expect(dropped.changes).toHaveLength(0);
    expect(dropped.rejected).toHaveLength(0);
    expect(dropped.text).not.toContain('PROFILE');
    // A profile can use an answer whenever it cites that answer's line, next to lines from another role.
    const roles = ['Jane Doe', 'Dubai | j@x.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Prepared weekly budgets', 'Intern, Beta', '- Prepared slide decks'].join(nl);
    const used = assembleTailoredCv(roles, { summary: { text: 'Prepared weekly budgets and ran the weekly budget workshop for 12 managers, and prepared slide decks.', sources: [6, 8], facts: [1] } }, ['I ran the weekly budget workshop for 12 managers'], [6]);
    expect(used.rejected).toEqual([]);
    expect(used.changes.some(change => change.kind === 'summary' && change.facts.length === 1)).toBe(true);
    // A reworded line cannot use an answer tied to a different line.
    const wrong = assembleTailoredCv(roles, { rewrites: [{ n: 8, text: 'Prepared slide decks and ran the weekly budget workshop for 12 managers', facts: [1] }] }, ['I ran the weekly budget workshop for 12 managers'], [6]);
    expect(wrong.rejected.map(item => item.reason)).toContain('An answer belongs to a different CV line.');
  });

  it('states which lines stay unchanged and how profiles are checked, as the code has it', () => {
    const nl = '\n';
    // An all-capitals name is read as a heading and is not editable; the contact line under it becomes plain text.
    const caps = ['JOHN SMITH', 'Dubai | j@x.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Prepared monthly reports'].join(nl);
    expect(assembleTailoredCv(caps, { rewrites: [{ n: 1, text: 'John Smith, analyst' }] }).rejected.map(item => item.reason)).toEqual(['Not an editable line.']);
    expect(sourceLines(caps)[1].kind).toBe('text');
    // An unusual mixed-case heading is plain text unless it sits directly above a bullet.
    const odd = ['Jane Doe', 'Dubai | j@x.com', '', 'Work History', 'Analyst, Acme', '- Prepared monthly reports'].join(nl);
    expect(sourceLines(odd)[3].kind).toBe('text');
    // One listed ownership verb in any cited line turns the ownership check off for the whole profile.
    const cv = ['Jane Doe', 'Dubai | j@x.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Led the weekly pack', 'Intern, Beta', '- Supported the finance team'].join(nl);
    const managed = assembleTailoredCv(cv, { summary: { text: 'Managed the finance team.', sources: [6, 8] } });
    expect(managed.rejected).toEqual([]);
    // One cautious-wording word in any cited line drops the whole profile.
    const hedged = ['Jane Doe', 'Dubai | j@x.com', '', 'EXPERIENCE', 'Analyst, Acme', '- Projected savings from the pilot', 'Intern, Beta', '- Supported the finance team'].join(nl);
    const dropped = assembleTailoredCv(hedged, { summary: { text: 'Supported the finance team.', sources: [6, 8] } });
    expect(dropped.rejected.map(item => item.reason)).toEqual(['Keep the exact wording of negative, uncertain or projected evidence.']);
  });

  it('describes the profile, reorder and role-line behaviour as the code has it', () => {
    const cv = ['Jane Doe', 'Dubai, UAE | jane@example.com', '', 'PROFILE', 'Analyst with experience in monthly reporting.', 'Works closely with finance teams.', '', 'EXPERIENCE', 'Senior Analyst, Acme Retail', '2022 - present', '- Prepared monthly reports', '- Maintained the KPI pack', '- Supported the finance team'].join('\n');
    const kinds = Object.fromEntries(sourceLines(cv).map(line => [line.n, line.kind]));
    // Only the single line directly above a bullet is a role line; a title above a separate dates line is plain text.
    expect(kinds[10]).toBe('role');
    expect(kinds[9]).toBe('text');
    const reworded = assembleTailoredCv(cv, { rewrites: [{ n: 9, text: 'Senior Analyst, Acme Retail group' }] });
    expect(reworded.changes.map(change => change.kind)).toEqual(['rewrite']);
    // A reorder that does not match is dropped without being counted; a rewrite that fails is counted.
    const badOrder = assembleTailoredCv(cv, { orders: [[12, 11, 99], [11, 12]] });
    expect(badOrder.rejected).toHaveLength(0);
    expect(badOrder.changes).toHaveLength(0);
    const badRewrite = assembleTailoredCv(cv, { rewrites: [{ n: 11, text: 'Prepared monthly reports for 40 stores' }] });
    expect(badRewrite.rejected).toHaveLength(1);
    // A new profile replaces the text under an existing profile heading, and the replaced text is kept as the original.
    const profiled = assembleTailoredCv(cv, { summary: { text: 'Analyst with experience in monthly reporting and finance teams.', sources: [5, 6] } });
    const summary = profiled.changes.find(change => change.kind === 'summary');
    expect(summary?.before).toContain('Analyst with experience in monthly reporting.');
    expect(profiled.text).not.toContain('Works closely with finance teams.');
  });

  it('keeps the stated limits on profiles, new lines and questions', () => {
    const lines = ['Jane Doe', 'Dubai | jane@example.com', '', 'EXPERIENCE', 'Analyst, Example Ltd | 2022 - present', ...[1, 2, 3, 4, 5, 6].map(n => `- Prepared monthly reports number ${n} for the finance team and the wider business every month`)];
    const cv = lines.join('\n');
    const longSource = 'prepared monthly reports for the finance team '.repeat(8).trim();
    const summaryCv = `${cv}\n- ${longSource}`;
    const sourceLine = summaryCv.split('\n').length;
    const body = (length: number) => (longSource + ' ').repeat(2).slice(0, length).trim();
    const ok = assembleTailoredCv(summaryCv, { summary: { text: body(420), sources: [sourceLine] } });
    expect(ok.rejected.filter(item => item.reason === 'Summary too long.')).toHaveLength(0);
    const tooLong = assembleTailoredCv(summaryCv, { summary: { text: `${body(420)}x`.padEnd(421, 'x'), sources: [sourceLine] } });
    expect(tooLong.rejected.map(item => item.reason)).toContain('Summary too long.');

    const facts = [1, 2, 3, 4, 5, 6].map(n => `I prepared the monthly report number ${n} for the finance team`);
    const anchor = 5; // the role line
    const added = assembleTailoredCv(cv, { additions: facts.map((text, index) => ({ after: anchor, text, facts: [index + 1] })) }, facts, facts.map(() => anchor));
    expect(added.changes.filter(change => change.kind === 'addition')).toHaveLength(5);
    expect(added.rejected.map(item => item.reason)).toContain('Too many new lines.');

    const asked = assembleTailoredCv(cv, { questions: ['Did you run the workshops yourself?', 'Did you prepare the forecast yourself?', 'Did you present to the board?', 'Did you train anyone on the process?', 'Did you set the budget for the team?', 'Did you choose the vendor for the work?'] });
    expect(asked.questions).toHaveLength(5);
  });

  it('never edits a name, contact line, heading or role line', () => {
    const cv = ['Jane Doe', 'Dubai | jane@example.com', '', 'EXPERIENCE', 'Analyst, Example Ltd | 2022 - present', '- Prepared monthly reports for the finance team', '- Built the weekly KPI pack for the COO'].join('\n');
    const result = assembleTailoredCv(cv, { rewrites: [1, 2, 4, 5].map(n => ({ n, text: 'Prepared monthly reports for the finance team' })) });
    expect(result.rejected.map(item => item.reason)).toEqual(Array(4).fill('Not an editable line.'));
    expect(result.text).toBe(cv);
  });

  it('prints every FAQ answer, and the FAQPage data says exactly the same', () => {
    renderPage();
    for (const [question, answer] of tailoringFaqs) {
      expect(screen.getByText(question)).toBeInTheDocument();
      expect(screen.getAllByText(answer, { exact: false }).length).toBeGreaterThan(0);
    }
    const nodes = truthfulTailoringStructuredNodes() as Record<string, unknown>[];
    expect(nodes).toHaveLength(1);
    const faq = nodes[0] as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity.map(item => [item.name, item.acceptedAnswer.text])).toEqual(tailoringFaqs);
  });

  it('says what leaves the device in the same words as the CV Check page, and prices from the price files', () => {
    expect(cvCheckFaqs.find(([question]) => question === 'Does my CV leave my device?')?.[1]).toBe(AI_SENT_TEXT);
    expect(tailoringFaqs.find(([question]) => question === 'How much does AI tailoring cost?')?.[1]).toBe(cvCheckCostText);
    expect(tailoringFaqs.find(([question]) => question === 'Is my CV sent to an AI provider?')?.[1]).toBe(`Only if you choose AI tailoring. ${AI_SENT_TEXT}`);
    renderPage();
    expect(document.body).toHaveTextContent('through OpenRouter to the AI model provider');
    expect(document.body).toHaveTextContent('3 AI-tailored CVs a month');
  });

  it('claims no ratings, reviews, user counts, guarantees or outcomes in its text or structured data', () => {
    expect(JSON.stringify(truthfulTailoringStructuredNodes())).not.toMatch(/aggregateRating|"review"|ratingValue|award/);
    renderPage();
    expect(document.body.textContent ?? '').not.toMatch(/cannot invent|never invents|no sign-?up|without an account|ATS match|\b\d+\s*%\s*(?:of|more|higher|faster|better|success)|\busers\b|reviews from|guarantee|100% accurate/i);
  });

  it('has a title and description inside the search display limits', () => {
    const meta = staticPageMeta('/truthful-cv-tailoring');
    expect(meta?.kind).toBe('landing');
    expect(meta!.title.length).toBeLessThanOrEqual(60);
    expect(meta!.description.length).toBeLessThanOrEqual(160);
    expect(meta!.description.length).toBeGreaterThan(100);
  });

  it('is linked from the CV Check page and links back to it, to privacy, pricing and the without-AI guide', () => {
    renderPage();
    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    for (const href of ['/check', '/privacy', '/pricing', '/cv-check', '/guides/cv-check-without-ai', '/guides/resume-privacy-before-upload']) expect(hrefs).toContain(href);
    cleanup();
    render(<HelmetProvider><MemoryRouter initialEntries={['/cv-check']}><CvCheckLanding /></MemoryRouter></HelmetProvider>);
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href') === '/truthful-cv-tailoring').length).toBeGreaterThanOrEqual(2);
  });
});
