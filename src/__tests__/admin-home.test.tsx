import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardSchema } from '@/lib/admin-dashboard';
import { adminDashboard } from './fixtures/admin-dashboard';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn(), marketing: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/lib/admin-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/admin-api')>(); return { ...original, callAdmin: mocks.call }; });
vi.mock('@/lib/marketing-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/marketing-api')>(); return { ...original, callMarketing: mocks.marketing }; });
import AdminHome from '@/pages/admin/home/AdminHome';
import { AdminApiError } from '@/lib/admin-api';

function Where() { const location = useLocation(); return <div>At: {location.pathname}{location.search}</div>; }
function tree(path = '/admin') {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin" element={<AdminHome />} /><Route path="/admin/:section" element={<AdminHome />} />
    <Route path="/auth" element={<Where />} /><Route path="/admin-original" element={<Where />} />
  </Routes></MemoryRouter></HelmetProvider>;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); mocks.user = { id: 'owner-a' };
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
    await user.type(screen.getByLabelText('Search users by email'), 'free');
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
});
