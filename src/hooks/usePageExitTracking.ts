import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const usePageExitTracking = (hasCompletedForm: boolean) => {
  const { user } = useAuth();

  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      // Only track if user is authenticated but hasn't completed the form
      if (user && !hasCompletedForm) {
        try {
          // Use navigator.sendBeacon for reliable tracking during page unload
          const data = {
            user_id: user.id,
            name: 'user dropped from this page',
            phone: '',
            career_objective: '',
            max_monthly_price: 0,
            app_expectations: ''
          };

          // Use Supabase client to insert the exit tracking data
          supabase
            .from('interest_forms')
            .insert(data);
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
