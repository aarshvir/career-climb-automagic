import { AUTH_CONFIGURATION_MESSAGE, readSupabaseConfiguration } from '@/integrations/supabase/configuration';
import { afterEach, describe, it, expect, vi } from 'vitest';

vi.unmock('@/integrations/supabase/client');

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });

describe('frontend startup configuration', () => {
  it('reports missing or invalid configuration without throwing or disclosing values', () => {
    expect(readSupabaseConfiguration({}).error).toBe(AUTH_CONFIGURATION_MESSAGE);
    expect(readSupabaseConfiguration({ VITE_SUPABASE_URL: 'broken', VITE_SUPABASE_PUBLISHABLE_KEY: 'public' }).error).toBe(AUTH_CONFIGURATION_MESSAGE);
    expect(readSupabaseConfiguration({ VITE_SUPABASE_URL: 'http://example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'public' }).error).toBe(AUTH_CONFIGURATION_MESSAGE);
  });

  it('accepts public configuration and a local development endpoint', () => {
    expect(readSupabaseConfiguration({ VITE_SUPABASE_URL: 'https://project.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }).error).toBeNull();
    expect(readSupabaseConfiguration({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'local-public' }).error).toBeNull();
  });

  it('rejects server-only secrets used as frontend keys', () => {
    const environment = { VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not-real' };
    expect(readSupabaseConfiguration(environment).error).toBe(AUTH_CONFIGURATION_MESSAGE);
    environment.VITE_SUPABASE_PUBLISHABLE_KEY = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(readSupabaseConfiguration(environment).error).toBe(AUTH_CONFIGURATION_MESSAGE);
  });

  it('allows the client module to load and return no session with missing settings, without a network request', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { configurationError, supabase } = await import('@/integrations/supabase/client');
    expect(configurationError).toBe(AUTH_CONFIGURATION_MESSAGE);
    expect((await supabase.auth.getSession()).data.session).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
