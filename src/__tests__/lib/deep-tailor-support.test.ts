import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCvEvidence } from '@/lib/cv-evidence';
import { createFreeCheckReportText } from '@/lib/free-check-export';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { requestTailoredCv } from '@/lib/cv-tailor-api';

const input = { cvText: 'Alex Example\n- Prepared monthly reports in Excel.', jobDescription: 'Prepare monthly stakeholder reporting in Excel and Power BI.', jobTitle: 'Analyst', company: 'Example' };
const response = { tailored: { text: 'Alex Example\n- Prepared monthly reporting in Excel.', changes: [{ kind: 'rewrite', n: 2, before: '- Prepared monthly reports in Excel.', after: '- Prepared monthly reporting in Excel.', sources: [2] }], questions: [], rejectedCount: 0 }, model: 'test-model' };

describe('tailoring request', () => {
  beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: response, error: null }); });
  it('adds confirmed answers only when there are some', async () => {
    await requestTailoredCv(input);
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('facts');
    await requestTailoredCv({ ...input, facts: [] });
    expect(invoke.mock.calls[1][1].body).not.toHaveProperty('facts');
    await requestTailoredCv({ ...input, facts: ['I built the Power BI dashboard myself.'] });
    expect(invoke.mock.calls[2][1].body).toMatchObject({ facts: ['I built the Power BI dashboard myself.'], consent: true });
  });
  it('reads changes from servers that do not send answer numbers', async () => {
    const result = await requestTailoredCv(input);
    expect(result.changes[0].facts).toEqual([]);
  });
});

describe('requirement report', () => {
  it('records coverage before and after tailoring when given the original counts', () => {
    const vacancy = 'Responsibilities\n• Prepare monthly stakeholder reports using Excel.\n• Build Power BI dashboards.';
    const before = analyzeCvEvidence('Alex Example\n\nEXPERIENCE\nAnalyst - Example Co | 2021 - 2024\n- Prepared monthly reports.', vacancy, 'Analyst');
    const after = analyzeCvEvidence('Alex Example\n\nEXPERIENCE\nAnalyst - Example Co | 2021 - 2024\n- Prepared monthly stakeholder reports using Excel.', vacancy, 'Analyst');
    const text = createFreeCheckReportText(after, { sourceLabel: 'Current reviewed CV', jobTitle: 'Analyst', coverageBefore: before.summary });
    expect(text).toContain('COVERAGE BEFORE AND AFTER TAILORING');
    expect(text).toContain(`Covered: ${before.summary.direct} → ${after.summary.direct}`);
    expect(createFreeCheckReportText(after, { sourceLabel: 'Current reviewed CV', jobTitle: 'Analyst' })).not.toContain('COVERAGE BEFORE');
  });
});
