import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const OnboardingRedirector = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const pathname = location.pathname;
    if (pathname === '/plan-selection' || pathname === '/dashboard') {
      return;
    }

    let isActive = true;

    const checkOnboarding = async () => {
      try {
        const { data: formEntry, error: formError } = await supabase
          .from('interest_forms')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (formError) throw formError;
        if (!isActive || !formEntry) {
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!isActive) {
          return;
        }

        if (!profile?.plan || profile.plan === 'free') {
          navigate('/plan-selection', { replace: true });
        } else if (pathname === '/' || location.search.includes('auth=success')) {
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Onboarding redirect failed:', error);
      }
    };

    checkOnboarding();

    return () => {
      isActive = false;
    };
  }, [user, loading, location.pathname, location.search, navigate]);

  return null;
};

export default OnboardingRedirector;