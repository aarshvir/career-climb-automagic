import { configurationError, supabase } from '@/integrations/supabase/client';

export const readAuthSession = async () => {
  if (configurationError) throw new Error(configurationError);
  // Supabase initializes once and performs its automatic PKCE/legacy hash exchange.
  // Waiting for it avoids exchanging a one-time code twice or arbitrary delays.
  const { error: initializationError } = await supabase.auth.initialize();
  if (initializationError) throw initializationError;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};
