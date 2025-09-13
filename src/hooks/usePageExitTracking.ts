import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const usePageExitTracking = (hasCompletedForm: boolean) => {
  const { user } = useAuth();

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only track if user is authenticated but hasn't completed the form
      if (user && !hasCompletedForm) {
        try {
          // Use navigator.sendBeacon for reliable tracking during page unload
          const data = JSON.stringify({
            user_id: user.id,
            email: user.email || '',
            name: 'user dropped from this page',
            phone: '+99999999999',
            career_objective: '',
            max_monthly_price: 0,
            app_expectations: ''
          });

          // Use sendBeacon for reliable fire-and-forget during page unload
          navigator.sendBeacon('/api/track-exit', data);
        } catch (error) {
          console.error('Error tracking page exit:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, hasCompletedForm]);
};
