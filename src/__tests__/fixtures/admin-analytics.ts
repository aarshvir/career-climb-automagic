import type { AdminAnalytics, AdminContacts, AdminPerson, AdminVisit } from '@/lib/admin-analytics';

export const caseyId = '00000000-0000-4000-8000-000000000011';
export const adVisitId = '00000000-0000-4000-8000-0000000000b1';

export function adminAnalytics(days: 7 | 30 | 90 = 30): AdminAnalytics {
  return {
    window: { days, start: '2026-09-25T16:00:00.000Z', end: '2026-10-25T16:00:00.000Z' },
    totals: { visitors: 240, sessions: 300, pageViews: 910, avgSeconds: 95, signedIn: 18, newAccounts: 12, today: 14 },
    previous: { visitors: 120, sessions: 150, pageViews: 400 },
    daily: Array.from({ length: days }, (_, index) => ({ day: new Date(Date.UTC(2026, 9, 25) - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10), visitors: 5 + index % 7, sessions: 6 + index % 7, pageViews: 20 + index % 9 })),
    channels: [{ label: 'Meta ads (Instagram / Facebook)', sessions: 210, visitors: 190, newAccounts: 9 }, { label: 'Search engines', sessions: 60, visitors: 40, newAccounts: 2 }, { label: 'Direct / unknown', sessions: 30, visitors: 25, newAccounts: 1 }],
    campaigns: [{ source: 'instagram', campaign: 'us-cv', content: 'C-man', sessions: 120, newAccounts: 6 }],
    landings: [{ path: '/onboarding', sessions: 200, newAccounts: 10, avgSeconds: 80 }],
    pages: [{ path: '/job-loop', views: 300, visitors: 200, avgSeconds: 42 }],
    clicks: [{ label: 'Start Job Loop', path: '/job-loop', href: '/onboarding', count: 90, visitors: 80 }],
    sessions: [
      { id: adVisitId, visitorId: '00000000-0000-4000-8000-0000000000a1', userId: caseyId, startedAt: '2026-10-25T15:00:00.000Z', lastSeenAt: '2026-10-25T15:03:00.000Z', name: 'Casey Example', email: 'casey@work.org', phone: '+971501234567',
        channel: 'Meta ads (Instagram / Facebook)', campaign: 'us-cv · C-man', landing: '/onboarding', lastPage: '/loop', pages: 4, clicks: 3, seconds: 150, device: 'mobile', browser: 'Instagram', inApp: 'Instagram' },
      { id: '00000000-0000-4000-8000-0000000000b4', visitorId: '00000000-0000-4000-8000-0000000000a3', userId: null, startedAt: '2026-10-25T14:00:00.000Z', lastSeenAt: '2026-10-25T14:01:00.000Z', name: null, email: null, phone: null,
        channel: 'AI assistants', campaign: null, landing: '/pricing', lastPage: '/pricing', pages: 1, clicks: 0, seconds: 12, device: 'desktop', browser: 'Safari', inApp: null },
    ],
  };
}

export const adminVisit = (): AdminVisit => ({
  id: adVisitId, visitorId: '00000000-0000-4000-8000-0000000000a1', userId: caseyId, startedAt: '2026-10-25T15:00:00.000Z', lastSeenAt: '2026-10-25T15:03:00.000Z',
  channel: 'Meta ads (Instagram / Facebook)', context: { utm_source: 'instagram', utm_campaign: 'us-cv', utm_content: 'C-man', fbclid: true, landing: '/onboarding' },
  device: 'mobile', browser: 'Instagram', os: 'iOS', inApp: 'Instagram', country: 'US', otherVisits: 1,
  person: { userId: caseyId, name: 'Casey Example', email: 'casey@work.org', phone: '+971501234567', joinedAt: '2026-10-25T15:02:00.000Z' },
  events: [
    { at: '2026-10-25T15:00:00.000Z', kind: 'page_view', path: '/job-loop', title: 'Job Loop', seconds: 40, scroll: 75 },
    { at: '2026-10-25T15:00:30.000Z', kind: 'click', path: '/job-loop', label: 'Start Job Loop', href: '/onboarding' },
    { at: '2026-10-25T15:01:00.000Z', kind: 'form_submit', path: '/auth?mode=signup', label: 'Create your Jobvance account' },
    { at: '2026-10-25T15:02:00.000Z', kind: 'identify', path: '/auth?mode=signup', label: 'Signed in' },
  ],
});

export const adminPerson = (): AdminPerson => ({
  userId: caseyId, name: 'Casey Example', email: 'casey@work.org', phone: '+971501234567', joinedAt: '2026-10-25T15:02:00.000Z', lastSignInAt: '2026-10-25T15:02:00.000Z', paidUsd: 29,
  firstVisit: { at: '2026-10-25T15:00:00.000Z', channel: 'Meta ads (Instagram / Facebook)', campaign: 'us-cv · C-man', landing: '/onboarding', referrer: null },
  totals: { visits: 2, pageViews: 5, seconds: 180 },
  visits: [{ id: adVisitId, startedAt: '2026-10-25T15:00:00.000Z', channel: 'Meta ads (Instagram / Facebook)', landing: '/onboarding', pages: 4, clicks: 3, seconds: 150, device: 'mobile', inApp: 'Instagram' }],
});

export const adminContacts = (userIds: string[]): AdminContacts => userIds.map((userId, index) => ({ userId, name: index === 0 ? 'Payer Person' : null, phone: index === 0 ? '+971501234567' : null, visits: 3 - index, lastVisitAt: '2026-10-25T15:00:00.000Z', channel: 'Meta ads (Instagram / Facebook)' }));
