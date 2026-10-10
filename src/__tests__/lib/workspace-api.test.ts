import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspace } from '@/lib/workspace-api';

const sdk = vi.hoisted(() => ({
  invoke: vi.fn(), from: vi.fn(), listCvs: vi.fn(),
  filters: [] as { table: string; column: string; userId: string }[],
  tableResults: {} as Record<string, { data: object[] | null; error: object | null }>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-database', () => ({ mvpSupabase: { from: sdk.from } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: sdk.listCvs }));

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const cvs = [{ id: 'cv-a', user_id: userId, text_content: 'Private original CV text.' }];
const packs = [{ id: 'pack-a', user_id: userId, status: 'approved', tailored_text: 'Approved CV text.' }];
const applications = [{ id: 'application-a', user_id: userId, status: 'interview', notes: 'Saved notes.' }];
const verifiedAccess = { creditsRemaining: 1, expiresAt: null, billingConfigured: false, billingMode: null, paymentProvider: null };

beforeEach(() => {
  vi.clearAllMocks();
  sdk.filters.length = 0;
  sdk.tableResults = {
    application_packs: { data: packs, error: null },
    tracked_applications: { data: applications, error: null },
  };
  sdk.listCvs.mockResolvedValue(cvs);
  sdk.invoke.mockResolvedValue({ data: verifiedAccess, error: null });
  sdk.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        sdk.filters.push({ table, column, userId: value });
        return { order: () => Promise.resolve(sdk.tableResults[table]) };
      },
    }),
  }));
});

describe('workspace access availability', () => {
  it('returns verified access and the current account’s saved records when all services succeed', async () => {
    const result = await loadWorkspace(userId);
    expect(result).toEqual({ cvs, packs, applications, entitlement: verifiedAccess, entitlementError: null });
    expect(sdk.listCvs).toHaveBeenCalledWith(userId);
    expect(sdk.filters).toEqual([
      { table: 'application_packs', column: 'user_id', userId },
      { table: 'tracked_applications', column: 'user_id', userId },
    ]);
  });

  it('retains documents and tracker records when the entitlement service is unavailable, without inventing zero credits', async () => {
    sdk.invoke.mockResolvedValue({ data: null, error: new Error('Internal service failure') });
    const result = await loadWorkspace(userId);
    expect(result.cvs).toEqual(cvs);
    expect(result.packs).toEqual(packs);
    expect(result.applications).toEqual(applications);
    expect(result.entitlement).toBeNull();
    expect(result.entitlementError).toMatch(/Pack access could not be checked/);
    expect(result.entitlementError).not.toContain('Internal service failure');
  });

  it('also treats malformed access data as unavailable rather than authorizing metered actions', async () => {
    sdk.invoke.mockResolvedValue({ data: { creditsRemaining: 'unverified' }, error: null });
    const result = await loadWorkspace(userId);
    expect(result.entitlement).toBeNull();
    expect(result.entitlementError).toBeTruthy();
    expect(result.packs).toEqual(packs);
  });

  it('keeps saved-record failures visible even when the entitlement service also fails', async () => {
    sdk.tableResults.application_packs = { data: null, error: { message: 'Database failed' } };
    sdk.invoke.mockRejectedValue(new Error('Access unavailable'));
    await expect(loadWorkspace(userId)).rejects.toThrow('Your saved records could not be loaded');
  });

  it('does not mask an actual CV retrieval failure as an access-only outage', async () => {
    sdk.listCvs.mockRejectedValue(new Error('Your saved CVs could not be loaded.'));
    await expect(loadWorkspace(userId)).rejects.toThrow('Your saved CVs could not be loaded.');
  });

  it('starts independent record reads before a pending access check completes', async () => {
    let finish!: (value: { data: null; error: Error }) => void;
    sdk.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const request = loadWorkspace(userId);
    expect(sdk.listCvs).toHaveBeenCalledWith(userId);
    expect(sdk.filters).toHaveLength(2);
    expect(sdk.invoke).toHaveBeenCalledWith('get-entitlement', { body: {} });
    finish({ data: null, error: new Error('Temporary outage') });
    const result = await request;
    expect(result.packs).toEqual(packs);
    expect(result.entitlement).toBeNull();
  });
});
