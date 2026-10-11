import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn(), cvs: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: sdk.cvs }));
import { callJobLoop, getLoopDownload, isLoopHttpsUrl, loadLoopSavedCvs, safeLoopDownloadUrl, safeLoopGmailUrl } from '@/lib/job-loop-api';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_SUPABASE_URL', 'https://qa.supabase.co');
  sdk.session.mockResolvedValue({ user: { id: 'owner-a' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  sdk.invoke.mockResolvedValue({ data: { message: 'Synthetic action confirmed' }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('cloud loop API privacy and owner boundaries', () => {
  it('strips unknown owner/endpoint/pricing fields instead of forwarding them', async () => {
    const action = { action: 'start_run', requestId: '00000000-0000-4000-8000-000000000001', provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false } as const;
    await callJobLoop('owner-a', { ...action, userId: 'owner-b', endpoint: 'https://untrusted.invalid', price: 0 } as unknown as LoopAction);
    expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control', { body: action });
  });
  it.each([
    { action: 'start_run', requestId: '00000000-0000-4000-8000-000000000001', provider: 'openai', model: 'configured-test-model', modelConsent: false, inboxConsent: false },
    { action: 'approve_packet', packetId: 'packet-a', inputHash: 'hash-a', reviewedText: 'Synthetic CV', confirmFacts: true, confirmDisclosure: false },
    { action: 'gmail_create_draft', packetId: 'packet-a', requestId: '00000000-0000-4000-8000-000000000001', confirmRecipientAndAttachment: false },
    { action: 'gmail_finalize', ticket: 'synthetic-sealed-ticket', confirmMailbox: false },
  ])('blocks missing contextual consent before any account or control request', async action => {
    await expect(callJobLoop('owner-a', action as LoopAction)).rejects.toThrow();
    expect(sdk.session).not.toHaveBeenCalled(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects an account mismatch before opening records', async () => {
    await expect(callJobLoop('owner-b', { action: 'get' })).rejects.toThrow('account changed'); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('does not return an in-flight response after the authenticated owner changes', async () => {
    let finish!: (response: unknown) => void;
    sdk.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = callJobLoop('owner-a', { action: 'suggest_claims' });
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalledOnce());
    sdk.session.mockResolvedValue({ user: { id: 'owner-b' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
    finish({ data: { message: 'Private owner-a fixture must not return' }, error: null });
    await expect(pending).rejects.toThrow('account changed');
  });
  it('requires actual capability/record fields instead of treating malformed service data as an empty successful snapshot', async () => {
    sdk.invoke.mockResolvedValue({ data: { snapshot: { recordVersion: 0, models: [], capabilities: {} } }, error: null });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
  });
  it('uses only the public JSON error field, never raw SDK debug output', async () => {
    sdk.invoke.mockResolvedValue({ data: null, error: { message: 'SYNTHETIC_PRIVATE_DEBUG', context: new Response(JSON.stringify({ debug: 'SYNTHETIC_PRIVATE_DEBUG' }), { status: 503 }) } });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
    sdk.invoke.mockResolvedValue({ data: null, error: { message: 'SYNTHETIC_PRIVATE_DEBUG', context: new Response(JSON.stringify({ error: 'A configured processing allowance is unavailable.' }), { status: 503 }) } });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('configured processing allowance');
  });
  it('does not surface raw exceptions thrown by SDK or auth initialization', async () => {
    sdk.invoke.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DEBUG'));
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
    sdk.session.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DEBUG'));
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('sign in again');
  });
  it('rejects saved CV rows from another owner even when an unexpected client response includes them', async () => {
    sdk.cvs.mockResolvedValue([{ id: 'cv-b', user_id: 'owner-b', text_content: 'Synthetic private CV' }]);
    await expect(loadLoopSavedCvs('owner-a')).rejects.toThrow('did not match');
  });
});
describe('private document and OAuth destinations', () => {
  it.each(['http://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=fixture', 'https://untrusted.invalid/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/cv-documents/owner-a/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-b/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/%2Fother/file.pdf'])('rejects an unsafe document destination', url => {
    expect(() => safeLoopDownloadUrl(url, 'owner-a')).toThrow();
  });
  it('accepts only the exact project, signed-document bucket and owner path', () => {
    const url = 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/packet/file.pdf?token=synthetic';
    expect(safeLoopDownloadUrl(url, 'owner-a')).toBe(url);
  });
  it('rechecks owner after document bytes arrive and never hands them to a newly signed-in account', async () => {
    sdk.invoke.mockResolvedValue({ data: { url: 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.txt?token=synthetic', filename: 'fixture.txt' }, error: null });
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = getLoopDownload('owner-a', 'packet-a', 'txt');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    sdk.session.mockResolvedValue({ user: { id: 'owner-b' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
    finish(new Response('Fictional text'));
    await expect(pending).rejects.toThrow('account changed'); vi.unstubAllGlobals();
  });
  it('does not accept generic Google-looking or arbitrary OAuth URLs', () => {
    expect(() => safeLoopGmailUrl('https://accounts.google.com.untrusted.invalid/o/oauth2/v2/auth')).toThrow();
    expect(() => safeLoopGmailUrl('https://accounts.google.com/other')).toThrow();
    expect(() => safeLoopGmailUrl('https://accounts.google.com:444/o/oauth2/v2/auth')).toThrow();
    expect(safeLoopGmailUrl('https://accounts.google.com/o/oauth2/v2/auth?state=synthetic')).toContain('accounts.google.com');
    expect(isLoopHttpsUrl('https://user:password@example.test/job')).toBe(false);
    expect(isLoopHttpsUrl('javascript:alert(1)')).toBe(false);
  });
});
