import type { AdminDashboard } from '@/lib/admin-types';

const day = (offset: number) => new Date(Date.UTC(2026, 9, 25) - offset * 86_400_000).toISOString().slice(0, 10);

export function adminDashboard(days: 7 | 30 | 90 = 30): AdminDashboard {
  return {
    actor: { id: 'owner-a', role: 'owner' },
    generatedAt: '2026-10-25T16:00:00.000Z',
    window: { days, start: '2026-09-25T16:00:00.000Z', end: '2026-10-25T16:00:00.000Z' },
    coverage: { realUsers: 42, excludedTest: 35, excludedStaff: 1, notes: ['Test accounts (35) and admin staff (1) are left out of every figure except place occupancy.'] },
    today: [
      { key: 'signups', label: 'New accounts', today: 3, yesterday: 2, kind: 'count' },
      { key: 'revenue', label: 'Revenue', today: 29, yesterday: 0, kind: 'usd' },
    ],
    kpis: [
      { key: 'signups', label: 'New accounts', current: 30, previous: 20, kind: 'count', help: 'Real people who created an account.' },
      { key: 'revenue', label: 'Revenue', current: 107, previous: 0, kind: 'usd', help: 'After refunds, in US dollars.' },
      { key: 'runs', label: 'Job Loop runs', current: 12, previous: 15, kind: 'count', help: 'Runs that finished, fully or partly.' },
    ],
    daily: Array.from({ length: days }, (_, index) => ({ day: day(days - 1 - index), signups: index % 3, cvChecks: index % 4, runs: index % 2, paidOrders: index === days - 1 ? 1 : 0, revenueUsd: index === days - 1 ? 29 : 0 })),
    funnel: [
      { label: 'Created an account', count: 30, hint: 'Real people only.' },
      { label: 'Tried Jobvance', count: 18, hint: 'Tailored a CV or saved a Job Loop profile.' },
      { label: 'Saved a Job Loop profile', count: 6, hint: 'Finished the Job Loop set-up.' },
      { label: 'Got a Job Loop run', count: 5, hint: 'At least one search finished.' },
    ],
    cohorts: [{ week: '20 Oct', size: 12, weeks: [75] }, { week: '13 Oct', size: 9, weeks: [66.7, 22.2] }],
    revenue: {
      allTimeUsd: 107, allTimeOrders: 4, payingCustomers: 3, unknownUsdPayments: 0,
      subscriptions: { active: 2, cancelling: 1, pastDue: 0, ended: 0 },
      places: { paidUsed: 4, paidCapacity: 100, pilotUsed: 10, pilotCapacity: 10 },
      byPlan: [{ label: 'Job Loop Starter', usd: 58, orders: 2 }, { label: 'Job Search pass', usd: 19, orders: 1 }],
      byCurrency: [{ currency: 'USD', amountMinor: 7700, orders: 3 }, { currency: 'INR', amountMinor: 249900, orders: 1 }],
      recent: [{ at: '2026-10-25T10:00:00.000Z', userId: '00000000-0000-4000-8000-000000000011', emailDisplay: 'payer@work.org', plan: 'Job Loop Starter', amountMinor: 2900, currency: 'USD', usd: 29, status: 'paid' }],
      attention: [{ key: 'unfulfilled', label: 'Paid but given no place', count: 1, help: 'Give them a place or refund them in Dodo.' }, { key: 'refunds', label: 'Refunds in this range', count: 0, help: '' }],
    },
    users: [
      { id: '00000000-0000-4000-8000-000000000011', emailDisplay: 'payer@work.org', joinedAt: '2026-10-20T10:00:00.000Z', lastSignInAt: '2026-10-25T09:00:00.000Z', lastActiveAt: '2026-10-25T09:30:00.000Z', plan: 'Starter', paidUsd: 29, hasPaid: true, cvChecks: 3, runs: 4, failedRuns: 1, hasProfile: true, pilot: false },
      { id: '00000000-0000-4000-8000-000000000012', emailDisplay: 'free@mail.com', joinedAt: '2026-10-24T10:00:00.000Z', lastSignInAt: null, lastActiveAt: null, plan: null, paidUsd: 0, hasPaid: false, cvChecks: 1, runs: 0, failedRuns: 0, hasProfile: false, pilot: false },
    ],
    ops: {
      schedulerEnabled: true, lastDispatchAt: '2026-10-25T15:58:00.000Z',
      checks: [
        { key: 'failed_runs', label: 'Failed runs (7 days)', count: 2, danger: true, help: 'Job Loop runs that stopped with an error.' },
        { key: 'stuck_runs', label: 'Runs stuck over 30 min', count: 0, danger: true, help: 'Started but not finished after 30 minutes.' },
      ],
      problems: [{ kind: 'Failed run', at: '2026-10-25T08:00:00.000Z', userId: '00000000-0000-4000-8000-000000000011', emailDisplay: 'payer@work.org', detail: 'Employer sources did not answer.' }],
      budget: { month: '2026-10', capUsd: 50, committedUsd: 12.5, actualUsd: 9.1 },
    },
    support: [{ id: '00000000-0000-4000-8000-000000000051', userId: '00000000-0000-4000-8000-000000000011', emailDisplay: 'payer@work.org', category: 'bug', status: 'received', createdAt: '2026-10-24T10:00:00.000Z', version: 0 }],
  };
}
