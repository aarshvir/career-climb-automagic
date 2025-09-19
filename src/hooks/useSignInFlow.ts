import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestForm } from '@/contexts/InterestFormContext';

export const useSignInFlow = () => {
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();
  const { setShowInterestForm } = useInterestForm();

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

      if (!profile?.plan || profile.plan === 'free') {
        navigate('/plan-selection');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Failed to continue onboarding:', error);
      setShowInterestForm(true);
    }
  }, [user, signInWithGoogle, setShowInterestForm, navigate]);

  return { handlePrimaryAction, user };
};