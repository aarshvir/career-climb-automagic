import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTrackingDraftMemory, recoverTrackingDraft, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftIdentity, trackingDraftScope } from '@/lib/tracking-draft-memory';
import type { TrackedApplication } from '@/lib/cv-database';
import type { LoopOpportunity } from '../../supabase/functions/_shared/job-loop-types';
const calls = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {}, configurationError: null }));
vi.mock('@/lib/workspace-api', () => ({ updateApplication: calls.update, deleteApplication: calls.remove, applicationStatuses: ['saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'], safeEmployerUrl: () => null }));
vi.mock('@/lib/payment-checkout', () => ({ isPaddleClientReady: () => false, openPaymentCheckout: vi.fn() }));
import { TrackerRow } from '@/pages/Workspace';
import { OpportunityRow } from '@/pages/JobLoop';

const tracked = (): TrackedApplication => ({ id: 'application-a', user_id: 'owner-a', pack_id: null, job_title: 'Fictional analyst', company: 'Fictional employer', job_url: null, status: 'saved', notes: 'Saved note', applied_at: null, follow_up_at: null, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z' });
const opportunity = (): LoopOpportunity => ({ id: 'application-a', title: 'Fictional analyst', company: 'Fictional employer', location: '', url: '', description: 'Synthetic vacancy, no real employer or candidate data.', contact: null, source: 'manual', sourceKey: 'manual:a', checkedAt: '2026-10-14T00:00:00Z', verification: 'user_provided', status: 'saved', followUpAt: null, notes: 'Saved note' });
const run = async (task: () => Promise<unknown>) => { try { await task(); return true; } catch { return false; } };
function workspaceRow(item: TrackedApplication) { const scope = trackingDraftScope('workspace', item.user_id, item.id); return <TrackerRow key={trackingDraftIdentity(scope)} scope={scope} item={item} run={run} />; }
function loopRow(item: LoopOpportunity, save = vi.fn(async () => false), owner = 'owner-a', generation = 7) { const scope = trackingDraftScope('loop', owner, item.id, generation); return <OpportunityRow key={trackingDraftIdentity(scope)} scope={scope} opportunity={item} busy={false} onSave={save} />; }
beforeEach(() => { clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a'); setTrackingLoopGeneration('owner-a', 7); vi.clearAllMocks(); calls.update.mockResolvedValue(undefined); calls.remove.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('tracking row task and route recovery with fictional local mocks', () => {
  it('keeps workspace notes/date across a task-tab unmount and a route remount without a write', () => {
    const item = tracked(), view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Unsaved fictional reminder' } });
    fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '2026-10-22' } });
    view.rerender(<p>Another workspace task</p>); view.rerender(workspaceRow(item));
    expect(screen.getByLabelText('Notes')).toHaveValue('Unsaved fictional reminder');
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-10-22');
    view.unmount(); render(workspaceRow(item));
    expect(screen.getByLabelText('Notes')).toHaveValue('Unsaved fictional reminder');
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('recovers a failed fresh workspace status selection without replay, requiring fresh attestation', async () => {
    const item = tracked(); calls.update.mockRejectedValue(new Error('Synthetic save failure'));
    const view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Keep this failed update' } });
    fireEvent.change(screen.getByLabelText('Status for Fictional analyst'), { target: { value: 'interview' } });
    await waitFor(() => expect(calls.update).toHaveBeenCalledOnce());
    view.unmount(); render(workspaceRow(item));
    expect(screen.getByLabelText('Status for Fictional analyst')).toHaveValue('interview');
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep this failed update');
    expect(screen.getByRole('checkbox', { name: /I report this status myself/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save tracking update' })).toBeDisabled();
    expect(calls.update).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('checkbox', { name: /I report this status myself/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));
    await waitFor(() => expect(calls.update).toHaveBeenCalledTimes(2));
  });

  it('does not erase notes changed while a workspace save is pending', async () => {
    let release!: () => void;
    calls.update.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const item = tracked(), view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Submitted version' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Newer unsaved version' } });
    await act(async () => { release(); });
    view.unmount(); render(workspaceRow(item));
    expect(screen.getByLabelText('Notes')).toHaveValue('Newer unsaved version');
  });

  it('clears only an exact successful workspace save, or all edits after successful deletion', async () => {
    const item = tracked(), view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Saved locally by mock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' }));
    await waitFor(() => expect(recoverTrackingDraft(trackingDraftScope('workspace', 'owner-a', item.id))).toBeNull());
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Draft before delete' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(calls.remove).toHaveBeenCalledOnce());
    await waitFor(() => expect(recoverTrackingDraft(trackingDraftScope('workspace', 'owner-a', item.id))).toBeNull());
    view.unmount();
  });

  it('restores Loop status/date/notes after tab and route navigation with attestation false', () => {
    const item = opportunity(), save = vi.fn(async () => false), view = render(loopRow(item, save));
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '2026-10-23' } });
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Unsaved Loop note' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /I report this status myself/ }));
    view.rerender(<p>Another Automated Job Loop task</p>); view.rerender(loopRow(item, save));
    expect(screen.getByRole('checkbox', { name: /I report this status myself/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save tracking update' })).toBeDisabled();
    view.unmount(); render(loopRow(item, save));
    expect(screen.getByLabelText('Application status')).toHaveValue('applied');
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-10-23');
    expect(screen.getByLabelText('My application notes')).toHaveValue('Unsaved Loop note');
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves a failed Loop save and newer edits while a prior save completes', async () => {
    const item = opportunity(), fail = vi.fn(async () => false), view = render(loopRow(item, fail));
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Failed Loop draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));
    await waitFor(() => expect(fail).toHaveBeenCalledOnce());
    view.unmount();
    let release!: (success: boolean) => void;
    const pending = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
    const second = render(loopRow(item, pending));
    expect(screen.getByLabelText('My application notes')).toHaveValue('Failed Loop draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Newer Loop edit' } });
    await act(async () => { release(true); });
    second.unmount(); render(loopRow(item, pending));
    expect(screen.getByLabelText('My application notes')).toHaveValue('Newer Loop edit');
  });

  it('does not leak Loop drafts into another owner, a new epoch, or another application', () => {
    const item = opportunity(), view = render(loopRow(item));
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Private A epoch7 draft' } });
    setTrackingLoopGeneration('owner-a', 9); view.rerender(loopRow(item, undefined, 'owner-a', 9));
    expect(screen.getByLabelText('My application notes')).toHaveValue('Saved note');
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Private A epoch9 draft' } });
    setTrackingDraftOwner('owner-b'); setTrackingLoopGeneration('owner-b', 3); view.rerender(loopRow({ ...item, notes: 'B saved note' }, undefined, 'owner-b', 3));
    expect(screen.getByLabelText('My application notes')).toHaveValue('B saved note');
  });

  it('refuses an old A completion after A to B to A even if a new draft has identical text', async () => {
    const item = tracked(); let release!: () => void;
    calls.update.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Identical pending text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' })); first.unmount();
    setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a');
    render(workspaceRow(item)); fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Identical pending text' } });
    await act(async () => { release(); });
    expect(recoverTrackingDraft(trackingDraftScope('workspace', 'owner-a', item.id))?.notes).toBe('Identical pending text');
  });

  it('forgets an explicitly reverted draft instead of restoring discarded text later', () => {
    const item = tracked(), view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Discard by reverting' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Saved note' } });
    view.unmount(); render(workspaceRow(item));
    expect(screen.getByLabelText('Notes')).toHaveValue('Saved note');
    expect(recoverTrackingDraft(trackingDraftScope('workspace', 'owner-a', item.id))).toBeNull();
  });

  it('rebases untouched workspace status/date during refresh while preserving dirty notes', async () => {
    const item = tracked(), view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Only my note is edited' } });
    const newer = { ...item, status: 'interview' as const, follow_up_at: '2026-10-24T12:00:00Z' };
    view.rerender(workspaceRow(newer));
    await waitFor(() => expect(screen.getByLabelText('Status for Fictional analyst')).toHaveValue('interview'));
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-10-24');
    expect(screen.getByLabelText('Notes')).toHaveValue('Only my note is edited');
    fireEvent.click(screen.getByRole('button', { name: 'Save notes & date' }));
    await waitFor(() => expect(calls.update).toHaveBeenCalledOnce());
    expect(calls.update.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('merges a route-recovered notes-only draft onto newer authoritative status/date', () => {
    const item = opportunity(), view = render(loopRow(item));
    fireEvent.change(screen.getByLabelText('My application notes'), { target: { value: 'Recover only this note' } });
    view.unmount();
    render(loopRow({ ...item, status: 'interview', followUpAt: '2026-10-25T12:00:00Z' }));
    expect(screen.getByLabelText('Application status')).toHaveValue('interview');
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-10-25');
    expect(screen.getByLabelText('My application notes')).toHaveValue('Recover only this note');
    expect(screen.queryByRole('checkbox', { name: /I report this status myself/ })).not.toBeInTheDocument();
  });

  it('keeps an explicitly edited recovered status conflict but requires new attestation', () => {
    const item = opportunity(), save = vi.fn(async () => false), view = render(loopRow(item, save));
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /I report this status myself/ }));
    view.unmount(); render(loopRow({ ...item, status: 'interview' }, save));
    expect(screen.getByLabelText('Application status')).toHaveValue('applied');
    expect(screen.getByRole('checkbox', { name: /I report this status myself/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save tracking update' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it('advances a successful submitted baseline so later server status changes are not retained as user edits', async () => {
    const item = tracked(); let release!: () => void;
    calls.update.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const view = render(workspaceRow(item));
    fireEvent.change(screen.getByLabelText('Status for Fictional analyst'), { target: { value: 'applied' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New note while applied save is pending' } });
    await act(async () => { release(); });
    view.rerender(workspaceRow({ ...item, status: 'interview' }));
    await waitFor(() => expect(screen.getByLabelText('Status for Fictional analyst')).toHaveValue('interview'));
    view.unmount(); render(workspaceRow({ ...item, status: 'offer' }));
    expect(screen.getByLabelText('Status for Fictional analyst')).toHaveValue('offer');
    expect(screen.getByLabelText('Notes')).toHaveValue('New note while applied save is pending');
  });
});
