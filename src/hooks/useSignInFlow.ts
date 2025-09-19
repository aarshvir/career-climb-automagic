import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestForm } from '@/contexts/InterestFormContext';
import { useOnboarding } from '@/contexts/OnboardingContext';

export const useSignInFlow = () => {
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();
  const { setShowInterestForm } = useInterestForm();
  const { openResumeDialog, openPreferencesDialog } = useOnboarding();

  const handlePrimaryAction = useCallback(async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }

    try {
      const { data: formEntry, error: formError } = await supabase
        .from('interest_forms')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (formError) throw formError;

      if (!formEntry) {
        setShowInterestForm(true);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.plan) {
        navigate('/plan-selection');
      } else {
        // Check for resume and preferences before allowing dashboard access
        const { data: resumes } = await supabase
          .from('resumes')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        if (!resumes || resumes.length === 0) {
          openResumeDialog();
          return;
        }

        const { data: preferences } = await supabase
          .from('preferences')
          .select('location, job_title, seniority_level, job_type')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!preferences || !preferences.location || !preferences.job_title || !preferences.seniority_level || !preferences.job_type) {
          openPreferencesDialog();
          return;
        }

        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Failed to continue onboarding:', error);
      setShowInterestForm(true);
    }
  }, [user, signInWithGoogle, setShowInterestForm, navigate]);

  return { handlePrimaryAction, user };
};
