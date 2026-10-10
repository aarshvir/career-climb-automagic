export const AUTH_CONFIGURATION_MESSAGE =
  'Sign-in is temporarily unavailable because JobVance has not been configured. Please contact support or try again after the site has been updated.';

type ConfigurationInput = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export const readSupabaseConfiguration = (environment: ConfigurationInput) => {
  const url = environment.VITE_SUPABASE_URL?.trim();
  const publicKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  try {
    if (!url || !publicKey || publicKey.startsWith('sb_secret_')) throw new Error('Missing or non-public configuration');
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) {
      throw new Error('Invalid endpoint');
    }
    // Legacy service-role JWT keys must never be placed in a frontend variable.
    const payload = publicKey.split('.')[1];
    if (payload) {
      try {
        const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        if (claims && typeof claims === 'object' && 'role' in claims && claims.role === 'service_role') {
          return { url: undefined, publicKey: undefined, error: AUTH_CONFIGURATION_MESSAGE };
        }
      } catch {
        // The SDK also supports opaque publishable keys.
      }
    }
    return { url: parsed.href.replace(/\/$/, ''), publicKey, error: null };
  } catch {
    return { url: undefined, publicKey: undefined, error: AUTH_CONFIGURATION_MESSAGE };
  }
};
