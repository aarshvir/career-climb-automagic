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

      // Check plan_selections as fallback if profile doesn't exist or has no plan
      if (!profile?.plan || profile.plan === 'free') {
        const { data: planSelection } = await supabase
          .from('plan_selections')
          .select('selected_plan, status')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .maybeSingle();

        if (planSelection?.selected_plan && planSelection.selected_plan !== 'free') {
          // Sync profile with plan selection
          await supabase
            .from('profiles')
            .upsert({ 
              id: user.id, 
              email: user.email, 
              plan: planSelection.selected_plan 
            }, {
              onConflict: 'id'
            });
          navigate('/dashboard');
        } else {
          navigate('/plan-selection');
        }
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