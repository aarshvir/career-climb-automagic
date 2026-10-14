import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Workspace from '@/pages/Workspace';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import type { TrackedApplication } from '@/lib/cv-database';

vi.unmock('react-router-dom');
vi.unmock('@tanstack/react-query');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null },
  load: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: {} }));
vi.mock('@/lib/workspace-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/workspace-api')>()), loadWorkspace: mocks.load, updateApplication: mocks.update, deleteApplication: mocks.remove }));
vi.mock('@/lib/cv-legacy', () => ({ listLegacyCvs: vi.fn(async () => []), downloadLegacyCv: vi.fn() }));
vi.mock('@/lib/payment-checkout', () => ({ isPaddleClientReady: () => false, openPaymentCheckout: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}
function application(owner: string): TrackedApplication {
  return { id: `application-${owner}`, user_id: owner, pack_id: null, job_title: owner === 'owner-a' ? 'Owner A analyst fixture' : 'Owner B analyst fixture',
    company: 'Local tracker fixture', job_url: null, status: 'saved', notes: '', follow_up_at: null, applied_at: null,
    created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z' };
}
let client: QueryClient;
function tree() { return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard?tab=tracker']}><Workspace /></MemoryRouter></QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.update.mockReset(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.load.mockImplementation(async owner => ({ cvs: [], packs: [], applications: [application(owner)], entitlementError: null,
    entitlement: { creditsRemaining: 0, expiresAt: null, billingConfigured: false, billingMode: null } }));
});
afterEach(() => { cleanup(); client.clear(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('independent full workspace tracking operation ownership', () => {
  it('rebases an untouched status to a newer server status while preserving and saving the candidate’s unsaved note', async () => {
    const server = application('owner-a');
    mocks.load.mockImplementation(async () => ({ cvs: [], packs: [], applications: [{ ...server }], entitlementError: null,
      entitlement: { creditsRemaining: 0, expiresAt: null, billingConfigured: false, billingMode: null } }));
    mocks.update.mockImplementation(async (_item, patch) => { Object.assign(server, patch); });
    render(tree());
    await screen.findByLabelText('Status for Owner A analyst fixture');
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'UNSAVED_NOTE_TO_KEEP_AFTER_SERVER_REFRESH' } });
    server.status = 'interview';
    await act(async () => { await client.invalidateQueries({ queryKey: ['workspace', 'owner-a'] }); });

    expect(screen.getByLabelText('Notes')).toHaveValue('UNSAVED_NOTE_TO_KEEP_AFTER_SERVER_REFRESH');
    await waitFor(() => expect(screen.getByLabelText('Status for Owner A analyst fixture')).toHaveValue('interview'));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ notes: 'UNSAVED_NOTE_TO_KEEP_AFTER_SERVER_REFRESH' });
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(server.status).toBe('interview');
  });

  it('rebases untouched status and date on route recovery, retaining only the candidate’s pending note', async () => {
    const server = application('owner-a');
    mocks.load.mockImplementation(async () => ({ cvs: [], packs: [], applications: [{ ...server }], entitlementError: null,
      entitlement: { creditsRemaining: 0, expiresAt: null, billingConfigured: false, billingMode: null } }));
    mocks.update.mockImplementation(async (_item, patch) => { Object.assign(server, patch); });
    const first = render(tree());
    await screen.findByLabelText('Status for Owner A analyst fixture');
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'LOCAL_NOTE_SURVIVES_ROUTE_RETURN' } });
    first.unmount();
    client.clear();
    server.status = 'interview'; server.follow_up_at = '2026-10-20T12:00:00.000Z';
    render(tree());

    expect(await screen.findByLabelText('Notes')).toHaveValue('LOCAL_NOTE_SURVIVES_ROUTE_RETURN');
    expect(screen.getByLabelText('Status for Owner A analyst fixture')).toHaveValue('interview');
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-10-20');
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ notes: 'LOCAL_NOTE_SURVIVES_ROUTE_RETURN', follow_up_at: '2026-10-20T12:00:00.000Z' });
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(server.status).toBe('interview');
  });

  it('requires a fresh status attestation after recovering a failed candidate-reported change against a newer server row', async () => {
    const server = application('owner-a');
    mocks.load.mockImplementation(async () => ({ cvs: [], packs: [], applications: [{ ...server }], entitlementError: null,
      entitlement: { creditsRemaining: 0, expiresAt: null, billingConfigured: false, billingMode: null } }));
    mocks.update.mockRejectedValueOnce(new Error('LOCAL_STATUS_RETRY_FIXTURE')).mockImplementation(async (_item, patch) => { Object.assign(server, patch); });
    const first = render(tree());
    fireEvent.change(await screen.findByLabelText('Status for Owner A analyst fixture'), { target: { value: 'applied' } });
    await screen.findByText('LOCAL_STATUS_RETRY_FIXTURE');
    first.unmount(); client.clear(); server.status = 'interview';
    render(tree());

    expect(await screen.findByLabelText('Status for Owner A analyst fixture')).toHaveValue('applied');
    const confirmation = screen.getByRole('checkbox', { name: /I report this status myself/ });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save tracking update' })).toBeDisabled();
    expect(mocks.update).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'EXPLICIT_RETRY_NOTE' } });
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls[1][1]).toMatchObject({ status: 'applied', notes: 'EXPLICIT_RETRY_NOTE' });
  });

  it.each(['resolve', 'reject'] as const)('does not let owner A’s pending tracking %s block or release owner B’s newer operation', async outcome => {
    const first = deferred<void>(), second = deferred<void>();
    mocks.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(tree());
    fireEvent.change(await screen.findByLabelText('Status for Owner A analyst fixture'), { target: { value: 'applied' } });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());

    await act(async () => {
      // The real AuthProvider changes this authority synchronously before the
      // old row unmounts; this integration fixture supplies that same boundary.
      setTrackingDraftOwner('owner-b'); mocks.auth.user = { id: 'owner-b' }; view.rerender(tree());
    });
    fireEvent.change(await screen.findByLabelText('Status for Owner B analyst fixture'), { target: { value: 'interview' } });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls.map(([item]) => item.user_id)).toEqual(['owner-a', 'owner-b']);

    await act(async () => {
      if (outcome === 'resolve') first.resolve();
      else first.reject(new Error('OLD_OWNER_TRACKING_ERROR'));
    });
    expect(screen.queryByText('OLD_OWNER_TRACKING_ERROR')).not.toBeInTheDocument();
    expect(screen.queryByText('Application status saved.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status for Owner B analyst fixture'), { target: { value: 'offer' } });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Status for Owner B analyst fixture')).toHaveValue('offer');
    await act(async () => { second.resolve(); });
    expect(screen.queryByText('OLD_OWNER_TRACKING_ERROR')).not.toBeInTheDocument();
  });
});
