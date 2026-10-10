export const isInIframe = (): boolean => {
  if (typeof window === 'undefined') return false;
  try { return window.self !== window.top; } catch { return true; }
};

export const isLovableEnvironment = (): boolean =>
  typeof window !== 'undefined' && /(^|\.)lovable(?:project)?\.(?:app|com)$/.test(window.location.hostname);

export const getEnvironmentType = (): 'lovable' | 'production' | 'development' => {
  if (typeof window === 'undefined' || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return 'development';
  return isLovableEnvironment() ? 'lovable' : 'production';
};

// Compatibility for the development panel; checking support must not open a popup.
export const supportsPopups = (): boolean => typeof window !== 'undefined' && typeof window.open === 'function';

export const getOptimalAuthRedirectUrl = (): string => `${window.location.origin}/auth/callback`;

export const getGoogleOAuthOptions = () => ({
  redirectTo: getOptimalAuthRedirectUrl(),
  queryParams: { prompt: 'select_account' },
});

export const clearUserAuthCache = (userId: string | undefined) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key === `plan_${userId}` || key?.startsWith(`daily_usage_${userId}_`)) storage.removeItem(key);
    }
    if (storage.getItem('last_user_id') === userId) {
      storage.removeItem('last_user_id');
      storage.removeItem('form_shown_timestamp');
    }
  } catch {
    // Storage restrictions do not prevent the SDK from signing the user out.
  }
};
