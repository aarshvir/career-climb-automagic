import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardSchema } from '@/lib/admin-dashboard';
import { adminDashboard } from './fixtures/admin-dashboard';
import { adminAnalytics, adminContacts, adminPerson, adminVisit, adVisitId, caseyId } from './fixtures/admin-analytics';
import { analyticsSchema, personSchema, sessionSchema } from '@/lib/admin-analytics';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, token: 'session-a', call: vi.fn(), marketing: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: mocks.user ? { user: mocks.user, access_token: mocks.token } : null, loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } } }));
vi.mock('@/lib/admin-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/admin-api')>(); return { ...original, callAdmin: mocks.call }; });
vi.mock('@/lib/marketing-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/marketing-api')>(); return { ...original, callMarketing: mocks.marketing }; });
import AdminHome from '@/pages/admin/home/AdminHome';
import { AdminApiError } from '@/lib/admin-api';

function Where() { const location = useLocation(); return <div>At: {location.pathname}{location.search}</div>; }
function tree(path = '/admin') {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin" element={<AdminHome />} /><Route path="/admin/:section" element={<AdminHome />} /><Route path="/admin/:section/:id" element={<AdminHome />} />
    <Route path="/auth" element={<Where />} /><Route path="/admin-original" element={<Where />} />
  </Routes></MemoryRouter></HelmetProvider>;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); mocks.user = { id: 'owner-a' }; mocks.token = 'session-a';
  mocks.call.mockImplementation(async (_id, action) => action.action === 'dashboard' ? { dashboard: adminDashboard(action.days) } : action.action === 'guest_support_list' ? { guestSupport: [] } : {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('new admin', () => {
  it('uses a fixture the browser contract accepts', () => { expect(() => dashboardSchema.parse(adminDashboard())).not.toThrow(); });

  it('sends signed-out visitors to sign in and back to the same page', async () => {
    mocks.user = null; render(tree('/admin/revenue?days=7'));
    expect(await screen.findByText('At: /auth?next=%2Fadmin%2Frevenue%3Fdays%3D7')).toBeInTheDocument();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('shows a plain denial and no navigation to accounts without admin access', async () => {
    mocks.call.mockRejectedValue(new AdminApiError('forbidden', 'Denied')); render(tree());
    expect(await screen.findByRole('heading', { name: 'No admin access' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it('shows the overview with comparisons and reloads for a new range', async () => {
    render(tree()); const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('$107.00')).toBeInTheDocument();
    expect(screen.getAllByText('▲ 50%')[0]).toBeInTheDocument();
    expect(screen.getByText('▼ 20%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '7d' }));
    expect(mocks.call).toHaveBeenLastCalledWith('owner-a', { action: 'dashboard', days: 7 });
  });

  it('shows revenue, places and anything that needs a look', async () => {
    render(tree('/admin/revenue'));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 paid but given no place');
    expect(screen.getByText('of 100 paid places taken')).toBeInTheDocument();
    expect(screen.getByText('₹2,499.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'payer@work.org' })).toHaveAttribute('href', '/admin/users?focus=00000000-0000-4000-8000-000000000011');
  });

  it('filters users by email and paid status', async () => {
    render(tree('/admin/users')); const user = userEvent.setup();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByLabelText('Paying customers only'));
    expect(within(table).queryByText('free@mail.com')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Paying customers only'));
    await user.type(screen.getByLabelText('Search users'), 'free');
    expect(within(table).getByText('free@mail.com')).toBeInTheDocument();
    expect(within(table).queryByText('payer@work.org')).not.toBeInTheDocument();
  });

  it('marks problems on the ops page', async () => {
    render(tree('/admin/operations'));
    expect(await screen.findByText('Employer sources did not answer.')).toBeInTheDocument();
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('opens and closes a user support message', async () => {
    mocks.call.mockImplementation(async (_id, action) => {
      if (action.action === 'dashboard') return { dashboard: adminDashboard(action.days) };
      if (action.action === 'guest_support_list') return { guestSupport: [] };
      if (action.action === 'support_detail') return { supportDetail: { id: action.id, message: 'The download button does nothing.' } };
      if (action.action === 'update_support') return { support: { id: action.id, status: action.status, version: 1 } };
      return {};
    });
    render(tree('/admin/support')); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText('The download button does nothing.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'update_support', id: '00000000-0000-4000-8000-000000000051', expectedVersion: 0, status: 'resolved' });
    expect(await screen.findByText(/Saved\. No email was sent/)).toBeInTheDocument();
  });

  it('explains when Meta figures cannot load', async () => {
    mocks.marketing.mockRejectedValue(new Error('Meta is not connected.')); render(tree('/admin/marketing'));
    expect(await screen.findByText('Meta is not connected.', { exact: false })).toBeInTheDocument();
  });

  it('sends unknown pages back to the overview', async () => {
    render(tree('/admin/nope'));
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });

  it('uses analytics fixtures the browser contract accepts', () => {
    expect(() => analyticsSchema.parse(adminAnalytics())).not.toThrow();
    expect(() => sessionSchema.parse(adminVisit())).not.toThrow();
    expect(() => personSchema.parse(adminPerson())).not.toThrow();
  });

  it('shows visitors, sources, campaigns, pages and clicks', async () => {
    mocks.call.mockImplementation(async (_id, action) => action.action === 'dashboard' ? { dashboard: adminDashboard(action.days) } : action.action === 'analytics' ? { analytics: adminAnalytics(action.days) } : {});
    render(tree('/admin/acquisition'));
    expect(await screen.findByText('240')).toBeInTheDocument();
    expect(screen.getAllByText('▲ 100%').length).toBeGreaterThan(0);
    expect(screen.getByText('Meta ads (Instagram / Facebook)')).toBeInTheDocument();
    expect(screen.getByText('us-cv')).toBeInTheDocument();
    expect(screen.getByText('Start Job Loop')).toBeInTheDocument();
    expect(screen.getByText('1 min 35 s')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'analytics', days: 30 });
  });

  it('lists every visit with the person, phone and source, and opens one step by step', async () => {
    mocks.call.mockImplementation(async (_id, action) => action.action === 'dashboard' ? { dashboard: adminDashboard(action.days) } : action.action === 'analytics' ? { analytics: adminAnalytics(action.days) } : action.action === 'visit' ? { visit: adminVisit() } : {});
    render(tree('/admin/journeys')); const user = userEvent.setup();
    const link = await screen.findByRole('link', { name: 'Casey Example' });
    expect(link).toHaveAttribute('href', `/admin/journeys/${adVisitId}`);
    expect(screen.getByRole('link', { name: '+971501234567' })).toHaveAttribute('href', 'tel:+971501234567');
    expect(screen.getByText('Visitor 000000')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Only visits linked to an account'));
    expect(screen.queryByText('Visitor 000000')).not.toBeInTheDocument();
    await user.click(link);
    expect(await screen.findByText('Clicked “Start Job Loop” → /onboarding')).toBeInTheDocument();
    expect(screen.getByText('Opened /job-loop')).toBeInTheDocument();
    expect(screen.getByText(/40 s on screen · scrolled 75%/)).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'visit', id: adVisitId });
  });

  it('shows names and phone numbers on Users and a page per person', async () => {
    const dashboard = adminDashboard();
    mocks.call.mockImplementation(async (_id, action) => action.action === 'dashboard' ? { dashboard } : action.action === 'contacts' ? { contacts: adminContacts(dashboard.users.map(row => row.id)) } : action.action === 'person' ? { person: adminPerson() } : {});
    render(tree('/admin/users')); const user = userEvent.setup();
    const person = await screen.findByRole('link', { name: 'Payer Person' });
    expect(screen.getByRole('link', { name: '+971501234567' })).toHaveAttribute('href', 'tel:+971501234567');
    expect(screen.getAllByText('not given').length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Search users'), '+97150');
    expect(screen.getByRole('link', { name: 'Payer Person' })).toBeInTheDocument();
    mocks.call.mockClear();
    await user.click(person);
    expect(await screen.findByText('Where they came from')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call +971501234567' })).toHaveAttribute('href', 'tel:+971501234567');
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'person', id: dashboard.users[0].id });
    expect(caseyId).toBeTruthy();
  });

  it('explains when no visits are recorded yet', async () => {
    const empty = { ...adminAnalytics(), totals: { visitors: 0, sessions: 0, pageViews: 0, avgSeconds: 0, signedIn: 0, newAccounts: 0, today: 0 }, previous: { visitors: 0, sessions: 0, pageViews: 0 }, sessions: [] };
    mocks.call.mockImplementation(async (_id, action) => action.action === 'dashboard' ? { dashboard: adminDashboard(action.days) } : action.action === 'analytics' ? { analytics: empty } : {});
    render(tree('/admin/acquisition'));
    expect(await screen.findByText('No visits recorded yet.')).toBeInTheDocument();
  });
});
