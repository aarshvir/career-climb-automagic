import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApplicationsHome from '@/pages/ApplicationsHome';
import { buildApplicationHome } from '@/lib/application-home';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import type { ApplicationPack, TrackedApplication } from '@/lib/cv-database';
import type { FreeCvCheck } from '@/lib/free-check-api';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null, retryConnection: vi.fn() }, list: vi.fn(), loop: vi.fn(), table: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/cv-database', () => ({ mvpSupabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.loop }));

const id = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const text = 'LOCAL_SAVED_TEXT. Prepared monthly Excel reports, explained reporting definitions and coordinated reporting checklists. No actual candidate is used.';
function saved(overrides: Partial<FreeCvCheck> = {}): FreeCvCheck { return { id, user_id: 'owner-a', request_id: id, job_title: 'Exact saved role', company: 'Local company', job_description: 'SAVED_VACANCY_TEXT', original_text: text, reviewed_text: text, method_version: 'fixture', status: 'approved', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', ...overrides }; }
function pack(): ApplicationPack { return { id, user_id: 'owner-a', request_id: id, resume_id: null, job_title: 'Exact saved role', company: 'Local company', job_url: null, job_description: 'PACK_VACANCY_TEXT', original_text: text, tailored_text: text, matched_keywords: [], missing_keywords: [], status: 'approved', created_at: '2026-10-15T00:00:00Z' }; }
function tracker(rowId: string, packId: string | null): TrackedApplication { return { id: rowId, user_id: 'owner-a', pack_id: packId, job_title: 'Exact saved role', company: 'Local company', job_url: null, status: 'interview', notes: `NOTE_${rowId}`, applied_at: null, follow_up_at: null, created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(pass => { resolve = pass; }); return { promise, resolve }; }
function tree(path = '/applications') { return <HelmetProvider><MemoryRouter initialEntries={[path]}><ApplicationsHome /></MemoryRouter></HelmetProvider>; }
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockReset().mockResolvedValue([saved()]); mocks.loop.mockReset().mockResolvedValue({ existingState: 'absent' }); mocks.table.mockReset().mockResolvedValue({ data: [], error: null }); mocks.getUser.mockImplementation(async () => ({ data: { user: mocks.auth.user }, error: null })); mocks.from.mockImplementation(table => ({ select: () => ({ eq: (_field: string, owner: string) => ({ order: () => mocks.table(table, owner) }) }) })); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null; clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a'); });
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('independent shared Applications home boundaries', () => {
  it('rejects a foreign pack response without hiding the independently loaded saved check', async () => {
    mocks.table.mockImplementation(async table => ({ data: table === 'application_packs' ? [{ ...pack(), user_id: 'owner-b', job_title: 'FOREIGN_PRIVATE_TITLE' }] : [], error: null }));
    render(tree(`/applications?item=${encodeURIComponent(`pack:${id}`)}`));
    await screen.findByRole('heading', { name: "This application's source is unavailable" });
    expect(screen.getByRole('button', { name: /Saved CV check.*Exact saved role/ })).toBeInTheDocument();
    expect(screen.queryByText('FOREIGN_PRIVATE_TITLE')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open this application pack' })).not.toBeInTheDocument();
    expect(mocks.loop.mock.calls.every(([, action]) => action.action === 'get_existing')).toBe(true);
  });
  it('ignores an earlier A lifetime delayed list after an A to B to A confirmed transition', async () => {
    const old = deferred<FreeCvCheck[]>(); mocks.list.mockReturnValueOnce(old.promise).mockResolvedValue([saved({ job_title: 'NEW_A_LIFETIME_TITLE' })]);
    const view = render(tree());
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree()); });
    await screen.findByRole('button', { name: /NEW_A_LIFETIME_TITLE/ });
    await act(async () => { old.resolve([saved({ job_title: 'OLD_A_PRIVATE_TITLE' })]); });
    expect(screen.queryByText('OLD_A_PRIVATE_TITLE')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NEW_A_LIFETIME_TITLE/ })).toBeInTheDocument();
  });
  it('removes selected private details and its continuation when an authoritative refresh removes that item', async () => {
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: /Saved CV check.*Exact saved role/ }));
    expect(screen.getByRole('link', { name: 'Open and edit' })).toHaveAttribute('href', `/check?savedCheck=${id}`);
    mocks.list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' }));
    await screen.findByRole('heading', { name: 'This application is no longer available here' });
    expect(screen.queryByRole('link', { name: 'Open and edit' })).not.toBeInTheDocument();
    expect(screen.queryByText('SAVED_VACANCY_TEXT')).not.toBeInTheDocument();
  });
  it.each(['loading', 'authError'] as const)('hides loaded details while authentication is unresolved: %s', async field => {
    const view = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: /Saved CV check.*Exact saved role/ }));
    expect(screen.getByText('SAVED_VACANCY_TEXT')).toBeInTheDocument();
    if (field === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Local session failure';
    view.rerender(tree());
    expect(screen.queryByText('SAVED_VACANCY_TEXT')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open and edit' })).not.toBeInTheDocument();
  });
  it('preserves actual many-to-one tracker links and same-title independent records in the pure projection', () => {
    const rows = buildApplicationHome('owner-a', { checks: [saved()], packs: [pack()], trackers: [tracker(id, id), tracker(second, id), tracker('33333333-3333-4333-8333-333333333333', null)], loop: { existingState: 'absent' } });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    expect(rows.find(row => row.id === `pack:${id}`)?.progress.map(item => item.id)).toEqual([id, second]);
    expect(rows.find(row => row.id === `check:${id}`)?.progress).toEqual([]);
    expect(rows.find(row => row.source === 'trackers')?.progress).toHaveLength(1);
  });
});
