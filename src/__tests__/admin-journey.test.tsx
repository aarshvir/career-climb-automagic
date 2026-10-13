import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSnapshot } from '@/lib/admin-types';
import { adminSnapshot } from './fixtures/admin-snapshot';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/lib/admin-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/admin-api')>(); return { ...original, callAdmin: mocks.call }; });
import AdminPortal from '@/pages/admin/AdminPortal';
import { AdminApiError } from '@/lib/admin-api';
function AccountRoute() { const location = useLocation(); return <div>Sign-in route: {location.search}</div>; }
function tree(path = '/admin2?days=30') { return <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/admin" element={<AdminPortal view="operations" />} /><Route path="/admin2" element={<AdminPortal view="founder" />} /><Route path="/auth" element={<AccountRoute />} /></Routes></MemoryRouter></HelmetProvider>; }
let current: AdminSnapshot;
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); mocks.user = { id: 'owner-a' }; current = adminSnapshot(); mocks.call.mockImplementation(async (_id, action) => ({ snapshot: { ...current, window: { ...current.window, days: action.days ?? 30 } } })); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('private owner portals', () => {
  it('redirects an anonymous request to sign-in with only the fixed return route and range', async () => {
    mocks.user = null; render(tree('/admin?days=90'));
    expect(await screen.findByText('Sign-in route: ?next=%2Fadmin%3Fdays%3D90')).toBeInTheDocument(); expect(mocks.call).not.toHaveBeenCalled();
  });
  it('shows a helpful denial without private data or administration navigation', async () => {
    mocks.call.mockRejectedValue(new AdminApiError('forbidden', 'Denied')); render(tree());
    expect(await screen.findByRole('heading', { name: 'Administration access required' })).toBeInTheDocument(); expect(screen.queryByRole('navigation', { name: 'Administration workspaces' })).not.toBeInTheDocument(); expect(screen.queryByText('Guest visits')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Save controls' })).not.toBeInTheDocument();
  });
  it('redirects a server-rejected expired session without retaining private navigation', async () => {
    mocks.call.mockRejectedValue(new AdminApiError('unauthenticated', 'Session expired')); render(tree('/admin2?days=7'));
    expect(await screen.findByText('Sign-in route: ?next=%2Fadmin2%3Fdays%3D7')).toBeInTheDocument(); expect(screen.queryByRole('navigation', { name: 'Administration workspaces' })).not.toBeInTheDocument();
  });
  it('keeps no-denominator rates unavailable, unknown visits untracked and payment state truthful', async () => {
    current.analytics.milestones[0].percent = 100; render(tree());
    await screen.findByRole('heading', { name: 'Observed milestones' });
    expect(screen.getByText('Untracked')).toBeInTheDocument(); expect(screen.getAllByText('0 of 0 · rate unavailable')).toHaveLength(2); expect(screen.queryByText('100.0% · 0 of 0')).not.toBeInTheDocument();
    const revenue = document.querySelector('#revenue') as HTMLElement;
    expect(within(revenue).getByText('Unavailable')).toBeInTheDocument(); expect(within(revenue).getByText('Checkout disabled')).toBeInTheDocument(); expect(within(revenue).queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText(/Saving does not purchase credits/)).toBeInTheDocument(); expect(screen.getAllByText(/2026-09-12 12:00 UTC/).length).toBeGreaterThan(2); expect(screen.getAllByText(/Source:/).length).toBeGreaterThan(5);
  });
  it('preserves the selected range between workspaces and refreshes its evidence', async () => {
    render(tree('/admin?days=7')); const user = userEvent.setup(); await screen.findByRole('heading', { name: 'Support receipts' });
    expect(screen.getByRole('link', { name: 'Founder' })).toHaveAttribute('href', '/admin2?days=7');
    await user.click(screen.getByRole('button', { name: '90 days' })); await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'snapshot', days: 90 }));
    expect(await screen.findByRole('link', { name: 'Founder' })).toHaveAttribute('href', '/admin2?days=90'); expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('link', { name: 'Founder' })); await screen.findByRole('heading', { name: 'Observed milestones' }); expect(mocks.call).toHaveBeenCalledTimes(3); expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
  it('requires an explicit versioned save and locks stale controls until a fresh snapshot', async () => {
    mocks.call.mockImplementation(async (_id, action) => { if (action.action === 'update_config') throw new AdminApiError('conflict', 'Refresh to review the newer version.'); return { snapshot: current }; });
    render(tree()); const user = userEvent.setup(); const ceiling = await screen.findByLabelText('Shared monthly ceiling (USD)');
    await user.clear(ceiling); await user.type(ceiling, '40'); expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'update_config')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Save controls' })); expect(await screen.findByText('Save stopped: a newer version exists.')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'update_config', expectedVersion: 3, config: { schedulerEnabled: false, routerEnabled: false, monthlyCapUsd: 40, defaultModel: 'openai/gpt-6.1-sol', reasoning: 'medium' } });
    expect(screen.getByRole('button', { name: 'Refresh before saving' })).toBeDisabled(); expect(screen.getByLabelText('Shared monthly ceiling (USD)')).toBeDisabled();
    current = { ...current, config: { ...current.config, version: 4, monthlyCapUsd: 35 } }; await user.click(screen.getByRole('button', { name: 'Refresh current data' }));
    expect(await screen.findByLabelText('Shared monthly ceiling (USD)')).toHaveValue(35); expect(screen.getByRole('button', { name: 'Save controls' })).toBeDisabled();
  });
  it('returns no configuration controls to an operator', async () => {
    current.actor.role = 'operator'; render(tree()); expect(await screen.findByText('Owner access required')).toBeInTheDocument(); expect(screen.queryByLabelText('Shared monthly ceiling (USD)')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Save controls' })).not.toBeInTheDocument();
  });
  it('clears private records if membership is revoked before a support status save', async () => {
    current.operations.support = [{ id: '00000000-0000-4000-8000-000000000001', userId: 'candidate-a', emailDisplay: 'f***@example.invalid', category: 'help', status: 'received', createdAt: current.generatedAt, version: 2, messageAvailable: true }];
    mocks.call.mockImplementation(async (_id, action) => { if (action.action === 'update_support') throw new AdminApiError('forbidden', 'Membership revoked'); return { snapshot: current }; });
    render(tree('/admin?days=30')); const user = userEvent.setup(); const status = await screen.findByLabelText('Status for support 00000000-0000-4000-8000-000000000001'); await user.selectOptions(status, 'in_review');
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'update_support')).toHaveLength(0); await user.click(screen.getByRole('button', { name: 'Save status' }));
    expect(await screen.findByRole('heading', { name: 'Administration access required' })).toBeInTheDocument(); expect(screen.queryByText('f***@example.invalid')).not.toBeInTheDocument(); expect(screen.queryByRole('navigation', { name: 'Administration workspaces' })).not.toBeInTheDocument();
  });
  it('discards delayed old-account snapshots after sign-out', async () => {
    let finish: (value: unknown) => void; mocks.call.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const rendered = render(tree()); await waitFor(() => expect(mocks.call).toHaveBeenCalledOnce());
    mocks.user = null; rendered.rerender(tree()); await act(async () => { finish({ snapshot: current }); }); expect(screen.queryByText('Guest visits')).not.toBeInTheDocument(); expect(screen.getByText(/Sign-in route:/)).toBeInTheDocument();
  });
  it('checks masked provider status without requesting a key or starting a model call', async () => {
    const providerStatus = { configured: true, valid: null, status: 'unavailable', checkedAt: current.generatedAt, message: 'Provider unreachable; validity unknown.' };
    mocks.call.mockImplementation(async (_id, action) => action.action === 'provider_status' ? { providerStatus } : { snapshot: current }); render(tree()); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Check connection status' }));
    expect(await screen.findByText('Secret configured · ••••••••')).toBeInTheDocument(); expect(screen.getByText('Unverified')).toBeInTheDocument(); expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument(); expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'provider_status' });
  });
  it('opens only the selected saved support message on explicit click, renders text safely and clears it on close', async () => {
    const id = '00000000-0000-4000-8000-000000000001', message = 'Fictional private request <img src=x onerror=alert(1)>.';
    current.operations.support = [{ id, userId: 'candidate-a', emailDisplay: 'f***@example.invalid', category: 'help', status: 'received', createdAt: current.generatedAt, version: 2, messageAvailable: true }];
    mocks.call.mockImplementation(async (_id, action) => action.action === 'support_detail' ? { supportDetail: { id, message } } : { snapshot: current });
    render(tree('/admin?days=30')); const user = userEvent.setup(); const trigger = await screen.findByRole('button', { name: 'View saved message' });
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'support_detail')).toBe(false); expect(screen.queryByText(message)).not.toBeInTheDocument(); await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Saved support message' }); expect(await within(dialog).findByText(message)).toBeInTheDocument(); expect(within(dialog).queryByRole('img')).not.toBeInTheDocument(); expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'support_detail', id });
    await user.click(within(dialog).getByRole('button', { name: 'Close message' })); expect(screen.queryByText(message)).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it('discards a saved message that arrives after its private view was closed', async () => {
    const id = '00000000-0000-4000-8000-000000000001'; let finish: (value: unknown) => void;
    current.operations.support = [{ id, userId: 'candidate-a', emailDisplay: 'f***@example.invalid', category: 'help', status: 'received', createdAt: current.generatedAt, version: 2, messageAvailable: true }];
    mocks.call.mockImplementation(async (_id, action) => action.action === 'support_detail' ? await new Promise(resolve => { finish = resolve; }) : { snapshot: current });
    render(tree('/admin?days=30')); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'View saved message' }));
    const dialog = await screen.findByRole('dialog'); expect(within(dialog).getByRole('status')).toHaveTextContent('Verifying access'); await user.click(within(dialog).getByRole('button', { name: 'Close message' }));
    await act(async () => { finish({ supportDetail: { id, message: 'Fictional late private message' } }); }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByText('Fictional late private message')).not.toBeInTheDocument();
  });
  it('removes an open support message immediately when the account signs out', async () => {
    const id = '00000000-0000-4000-8000-000000000001', message = 'Fictional account-bound private message';
    current.operations.support = [{ id, userId: 'candidate-a', emailDisplay: 'f***@example.invalid', category: 'help', status: 'received', createdAt: current.generatedAt, version: 2, messageAvailable: true }]; mocks.call.mockImplementation(async (_id, action) => action.action === 'support_detail' ? { supportDetail: { id, message } } : { snapshot: current });
    const rendered = render(tree('/admin?days=30')); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'View saved message' })); await screen.findByText(message);
    mocks.user = null; rendered.rerender(tree('/admin?days=30')); expect(screen.queryByText(message)).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
