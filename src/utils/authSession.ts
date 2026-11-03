import { configurationError, supabase } from '@/integrations/supabase/client';

export const readAuthSession = async () => {
  if (configurationError) throw new Error(configurationError);
  // Supabase initializes once and performs its automatic PKCE/legacy hash exchange.
  // Waiting for it avoids exchanging a one-time code twice or arbitrary delays.
  const { error: initializationError } = await supabase.auth.initialize();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  // The SDK caches initialization, including a failed callback. A later successful
  // sign-in can establish a current session without changing that historical result.
  if (initializationError && !data.session) throw initializationError;
  return data.session;
};
