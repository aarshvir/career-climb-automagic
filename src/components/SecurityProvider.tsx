import React, { useEffect } from 'react';
import { getCSPHeader, securityHeaders } from '@/lib/security';

interface SecurityProviderProps {
  children: React.ReactNode;
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  useEffect(() => {
    // Apply security headers in development
    if (import.meta.env.DEV) {
      // Set CSP header via meta tag
      const metaCSP = document.createElement('meta');
      metaCSP.httpEquiv = 'Content-Security-Policy';
      metaCSP.content = getCSPHeader();
      document.head.appendChild(metaCSP);

      // Apply other security headers via meta tags where possible
      const metaContentType = document.createElement('meta');
      metaContentType.httpEquiv = 'X-Content-Type-Options';
      metaContentType.content = securityHeaders['X-Content-Type-Options'];
      document.head.appendChild(metaContentType);

      const metaXSS = document.createElement('meta');
      metaXSS.httpEquiv = 'X-XSS-Protection';
      metaXSS.content = securityHeaders['X-XSS-Protection'];
      document.head.appendChild(metaXSS);

      const metaReferrer = document.createElement('meta');
      metaReferrer.name = 'referrer';
      metaReferrer.content = 'strict-origin-when-cross-origin';
      document.head.appendChild(metaReferrer);

      // Cleanup on unmount
      return () => {
        [metaCSP, metaContentType, metaXSS, metaReferrer].forEach(meta => {
          if (meta.parentNode) {
            meta.parentNode.removeChild(meta);
          }
        });
      };
    }
  }, []);

  return <>{children}</>;
};