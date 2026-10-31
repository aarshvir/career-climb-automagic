import { describe, it, expect } from 'vitest';
import { analyzeCvEvidence } from '@/lib/cv-evidence';

// Fictional listings that copy the structure of whole pasted public job ads: a company
// blurb, emoji and upper-case headings, a salary block, legal boilerplate and perks.
// Nothing here is third-party text. The CV is a small analyst CV.
const CV = 'Alex Example\nEXPERIENCE\nData analyst, Example Co\n- Built weekly dashboards in Tableau and wrote SQL queries for finance reports.\n- Prepared monthly KPI packs for stakeholders.\nSKILLS\nSQL, Excel, Python, Tableau';

const quotes = (job: string) => analyzeCvEvidence(CV, job, 'Data Analyst II').requirements.map(item => item.vacancyQuote);
const omitted = (job: string) => analyzeCvEvidence(CV, job, 'Data Analyst II').omittedSections.map(item => item.vacancyQuote);

const COMPANY_FIRST = [
  'Data Analyst II',
  '',
  'About us',
  '',
  'Acme Pay is a global leader in bank payments. Over 100,000 businesses use Acme Pay to send payments.',
  '',
  'Payment Intelligence',
  '',
  'Our mission is to make Acme Pay the best way to pay. You will need to own our understanding of these products. Our existing products are already one of the key reasons why customers choose Acme Pay. These include Shield, which defends customers from fraud.',
  '',
  "What You'll Do",
  '',
  'At Acme Pay analytics is at the core of everything we do and drives business performance. You will play a critical role partnering with stakeholders across the business. The role is focussed on identifying value. Your insights will be turned into actions that help drive the future of Acme Pay.',
  '',
  '- Own and iterate on experiments to generate user insight',
  '',
  '- Define how we evaluate success, setting KPIs',
  '',
  'What Excites You',
  '',
  '- Translate complex technical findings into clear narratives.',
  '',
  'What Excites us',
  '',
  '- You have advanced SQL skills and intermediate Python skills',
  '',
  'Salary range: the expected base salary range for this position is between €32,000 - €48,000 .',
  '',
  'Base salary ranges are based on role, job level, location, and market data.',
  '',
  '(some of) The good stuff',
  '',
  '- Wellbeing - stay healthy with dedicated support',
  '',
  '- Lunch - a paid lunch when working from the office',
].join('\n');

describe('a whole pasted ad: company blurb, headings and perks are context, not requirements', () => {
  it('keeps the duties and criteria and nothing else', () => {
    expect(quotes(COMPANY_FIRST)).toEqual([
      'You will need to own our understanding of these products.',
      'You will play a critical role partnering with stakeholders across the business.',
      'Own and iterate on experiments to generate user insight',
      'Define how we evaluate success, setting KPIs',
      'Translate complex technical findings into clear narratives.',
      'You have advanced SQL skills and intermediate Python skills',
    ]);
  });

  it('keeps every dropped line available verbatim in the omitted sections', () => {
    const job = COMPANY_FIRST;
    const report = analyzeCvEvidence(CV, job, 'Data Analyst II');
    const covered = [...report.requirements, ...report.omittedSections];
    for (const item of covered) expect(job.slice(item.start, item.end)).toBe(item.vacancyQuote);
    const dropped = omitted(job);
    for (const text of ['What Excites You', 'What Excites us', '(some of) The good stuff', 'Our existing products are already one of the key reasons why customers choose Acme Pay.', 'These include Shield, which defends customers from fraud.', 'At Acme Pay analytics is at the core of everything we do and drives business performance.', 'The role is focussed on identifying value.', 'Wellbeing - stay healthy with dedicated support']) {
      expect(dropped.some(value => value.includes(text))).toBe(true);
    }
  });

  it('is deterministic and reports the context in its notes', () => {
    const a = analyzeCvEvidence(CV, COMPANY_FIRST, 'Data Analyst II');
    expect(JSON.stringify(a)).toBe(JSON.stringify(analyzeCvEvidence(CV, COMPANY_FIRST, 'Data Analyst II')));
    expect(a.unparsedNotes.join(' ')).toMatch(/remaining job description is shown below/);
  });
});

describe('emoji, upper-case and trailing-ellipsis headings are headings', () => {
  const job = [
    'Marketing Analytics Manager',
    '',
    'About the role...',
    'We are building a world-class marketing organization with the goal to make a significant impact.',
    '🧠 You will...',
    'Create data-driven insights about the impact of campaigns',
    '✅ You have...',
    "Minimum of a Bachelor's degree in Statistics",
    'Strong expertise using SQL to extract, clean, and transform data in large databases',
    '⭐ Exceptional candidates will have...',
    'Expertise working with R, Python, or other statistical software',
    '',
    "WHAT YOU'LL ACHIEVE:",
    'Manage and reconcile all bi-weekly payrolls using Workday',
    'SKILLS YOU\'LL NEED TO BRING:',
    '4+ years of payroll processing experience',
    'NICE TO HAVES:',
    'Experience with NetSuite;',
  ].join('\n');

  it('never turns a heading into a requirement', () => {
    const found = quotes(job);
    for (const heading of ['About the role...', '🧠 You will...', '✅ You have...', '⭐ Exceptional candidates will have...', "WHAT YOU'LL ACHIEVE:", "SKILLS YOU'LL NEED TO BRING:", 'NICE TO HAVES:']) {
      expect(found).not.toContain(heading);
      expect(omitted(job)).toContain(heading);
    }
  });

  it('still reads the criteria under those headings', () => {
    const found = quotes(job);
    expect(found).toContain('Create data-driven insights about the impact of campaigns');
    expect(found).toContain("Minimum of a Bachelor's degree in Statistics");
    expect(found).toContain('Expertise working with R, Python, or other statistical software');
    expect(found).toContain('Manage and reconcile all bi-weekly payrolls using Workday');
    expect(found).toContain('4+ years of payroll processing experience');
    expect(found).toContain('Experience with NetSuite;');
  });

  it('keeps a list of verbs that share one object in a single requirement', () => {
    const found = quotes(job);
    expect(found).toContain('Strong expertise using SQL to extract, clean, and transform data in large databases');
    expect(found.some(value => /^clean, and transform/i.test(value))).toBe(false);
  });
});

describe('closing boilerplate is context', () => {
  const job = [
    'Payroll Analyst',
    '',
    'WHAT YOU\'LL ACHIEVE:',
    'Process all leave amounts, fringe benefits, equity transactions, and 401(k) contributions',
    'Ability to generate payroll reports using Workday',
    '',
    'Salary Range:',
    '$154,700 — $209,300 USD',
    'The offered salary is dependent upon several factors, including work experience and skills.',
    'For this role, base salary is supplemented by equity compensation.',
    'We encourage you to talk with your recruiter for more information.',
    '',
    'Acme is committed to providing highly competitive compensation, equity, and benefits.',
    'By clicking “Submit Application”, I understand and agree that Acme and its affiliates and subsidiaries will process my data.',
    '#LI-Onsite',
    '',
    'A NOTE ON AI',
    'People who thrive here treat AI as a tool.',
    '',
    'EQUAL OPPORTUNITY & ACCOMMODATIONS',
    'Acme is an equal opportunity employer. We do not discriminate on any protected basis.',
  ].join('\n');

  it('drops pay, legal and hashtag lines from the requirements and keeps the duties', () => {
    expect(quotes(job)).toEqual([
      'Process all leave amounts, fringe benefits, equity transactions, and 401(k) contributions',
      'Ability to generate payroll reports using Workday',
    ]);
  });
});

describe('employer sentences that reuse requirement words are still context', () => {
  const job = [
    'Analyst',
    '',
    'Requirements',
    'Prepare weekly reports.',
    "At Acme, you'll join a team that cares about learners and experiments with big ideas.",
    "You'll have limitless learning opportunities and daily collaboration with great people.",
    '',
    'Our values',
    "We care deeply about what we do and we know it's essential that we be humble.",
    '',
    'Salary range',
    'Please note that we pay between the minimum and the mid-point of the range until performance can be assessed.',
    '',
    'The good stuff',
    '- Time off - a generous holiday allowance and one day off if you need to move house',
  ].join('\n');
  it('drops them and keeps the real duty', () => {
    expect(quotes(job)).toEqual(['Prepare weekly reports.']);
  });
  it('still keeps an applicant-facing "you will have" and "you need to"', () => {
    const real = ['Requirements', 'Prepare weekly reports.', "You'll have strong stakeholder management skills.", 'You need to be able to explain findings to executives.'].join('\n');
    expect(quotes(`Analyst\n${real}`)).toEqual(["Prepare weekly reports.", "You'll have strong stakeholder management skills.", 'You need to be able to explain findings to executives.']);
  });
});

describe('guards: real requirements that look like context stay requirements', () => {
  const keep = (value: string, heading = 'Requirements') => {
    const job = `Analyst\n${heading}\nPrepare reports.\n${value}`;
    expect(quotes(job)).toContain(value);
  };
  it.each([
    'Must have a valid driver licence',
    'This role requires 5 years of Python',
    "We are looking for an analyst with strong SQL",
    'We need someone who can work onsite three days a week',
    'Manage budgets over $5M',
    'Experience negotiating salary and compensation packages',
    'Knowledge of equal opportunity legislation',
    'Support the compensation team and manage salary reviews',
    'The role requires relocation to Dubai',
    'At least 3 years of experience with Salesforce',
    'Follow established procedures and escalate exceptions',
    'Learn new systems quickly',
  ])('keeps: %s', value => keep(value));

  it('keeps a mandatory criterion inside a company section', () => {
    const job = 'About us\nWe are a payments company. Candidates must have a valid right to work. We offer free lunch.\nRequirements\nPrepare reports.';
    const found = quotes(job);
    expect(found).toContain('Candidates must have a valid right to work.');
    expect(found).not.toContain('We offer free lunch.');
    expect(found).not.toContain('We are a payments company.');
  });

  it('does not turn a short unlabelled requirement line into a heading', () => {
    const job = 'Requirements\nPrepare reports.\nDevelop forecasts.\nProject manager\nStrong Excel skills\nSQL';
    expect(quotes(job)).toEqual(['Prepare reports.', 'Develop forecasts.', 'Project manager', 'Strong Excel skills', 'SQL']);
  });
});

describe('result on the whole ad', () => {
  it('no longer sends company text to "Needs your judgment"', () => {
    const report = analyzeCvEvidence(CV, COMPANY_FIRST, 'Data Analyst II');
    const unreadable = report.requirements.filter(item => item.status === 'review' && /cannot interpret this requirement reliably/.test(item.explanation));
    expect(unreadable.map(item => item.vacancyQuote)).not.toContain('Our existing products are already one of the key reasons why customers choose Acme Pay.');
    expect(report.summary.total).toBe(report.requirements.length);
    // The same ad used to produce 28 items; six real duties and criteria remain.
    expect(report.summary.total).toBe(6);
    expect(report.methodVersion).toBe('english-literal-evidence-v6');
  });
});
