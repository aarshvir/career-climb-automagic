import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { supabase } from "@/integrations/supabase/client";

const OnboardingRedirector = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { openResumeDialog, openPreferencesDialog } = useOnboarding();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const pathname = location.pathname;
    if (pathname === "/plan-selection" || pathname === "/dashboard") {
      return;
    }

    let isActive = true;

    const checkOnboarding = async () => {
      try {
        const { data: formEntry, error: formError } = await supabase
          .from("interest_forms")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (formError) throw formError;
        if (!isActive || !formEntry) {
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!isActive) {
          return;
        }

        if (!profile?.plan) {
          navigate("/plan-selection", { replace: true });
        } else if (location.search.includes("auth=success")) {
          // Only redirect to dashboard if coming from auth success, not from homepage
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

          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.error("Onboarding redirect failed:", error);
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
