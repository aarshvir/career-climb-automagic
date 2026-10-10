import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { readSupabaseConfiguration } from './configuration';

const configuration = readSupabaseConfiguration({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export const configurationError = configuration.error;
export const isSupabaseConfigured = !configurationError;

// Keep public pages renderable if the deployment was built without configuration.
// The inert client never makes network calls or restores an invented session.
export const supabase = createClient<Database>(
  configuration.url ?? 'https://inert.invalid',
  configuration.publicKey ?? 'configuration-missing',
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
      flowType: 'pkce',
    },
    ...(!isSupabaseConfigured && {
      global: {
        fetch: async () => { throw new Error(configurationError!); },
      },
    }),
  },
);
