import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EXIT_TRACKING_ABANDONMENT_PLACEHOLDER } from '@/lib/interestForm';

export const usePageExitTracking = (hasCompletedForm: boolean) => {
  const { user } = useAuth();

  useEffect(() => {
    const handleBeforeUnload = async () => {
      // Only track if user is authenticated but hasn't completed the form
      if (user && !hasCompletedForm) {
        try {
          // Use Supabase to track page exit securely
          // Only track minimal necessary data for analytics
          await supabase
            .from('interest_forms')
            .insert({
              user_id: user.id,
              email: user.email || '',
              ...EXIT_TRACKING_ABANDONMENT_PLACEHOLDER
            });
        } catch (error) {
          // Silently handle errors during page unload
          if (process.env.NODE_ENV === 'development') {
            console.warn('Page exit tracking failed:', error);
          }
        }
      }
    };

    // Note: Using beforeunload for tracking is unreliable
    // Consider using visibility change or page focus events instead
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && user && !hasCompletedForm) {
        handleBeforeUnload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, hasCompletedForm]);
};
