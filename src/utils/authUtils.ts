// Authentication utility functions for iframe and environment detection

export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // If we can't access window.top, we're likely in an iframe
  }
};

export const isLovableEnvironment = (): boolean => {
  return window.location.hostname.includes('lovable') || 
         window.location.hostname.includes('lovableproject.com');
};

export const getEnvironmentType = (): 'lovable' | 'production' | 'development' => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'development';
  }
  if (isLovableEnvironment()) {
    return 'lovable';
  }
  return 'production';
};

export const supportsPopups = (): boolean => {
  try {
    const popup = window.open('', '_blank', 'width=1,height=1');
    if (popup) {
      popup.close();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const getOptimalAuthRedirectUrl = (): string => {
  const environment = getEnvironmentType();
  const origin = window.location.origin;
  
  switch (environment) {
    case 'lovable':
      // For Lovable environment, use the current origin
      return `${origin}/auth/callback`;
    case 'development':
      return 'http://localhost:3000/auth/callback';
    case 'production':
    default:
      return `${origin}/auth/callback`;
  }
};

export const getGoogleOAuthOptions = () => {
  const isIframe = isInIframe();
  const environment = getEnvironmentType();
  const redirectUrl = getOptimalAuthRedirectUrl();
  
  console.log('Auth Environment Detection:', {
    isIframe,
    environment,
    redirectUrl,
    hostname: window.location.hostname,
    origin: window.location.origin
  });

  return {
    redirectTo: redirectUrl,
    queryParams: {
      access_type: 'offline',
      prompt: 'select_account', // Changed from 'consent' to be less aggressive
      ...(isIframe && { display: 'popup' }) // Add popup display for iframes
    },
    // Add popup-specific options for iframe environments
    ...(isIframe && {
      options: {
        skipBrowserRedirect: false, // Let Supabase handle the redirect
      }
    })
  };
};