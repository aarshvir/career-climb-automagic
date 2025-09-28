import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Settings, 
  Upload, 
  Plus, 
  Crown, 
  Zap, 
  Star,
  MapPin,
  Briefcase,
  Clock
} from "lucide-react";
import { CVManager } from "./CVManager";
import { JobPreferences } from "./JobPreferences";
import { normalizePlan, getPlanDisplayName } from "@/utils/planUtils";

interface UserProfile {
  plan: string;
  subscription_status?: string;
}

interface UserPreferences {
  location: string | null;
  job_title: string | null;
  seniority_level: string | null;
  job_type: string | null;
}

export const Sidebar = () => {
  const { user } = useAuth();
  const { profile, refreshProfile } = usePlan();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  // Listen for upgrade success and refresh profile
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upgrade') === 'success' && user) {
      refreshProfile();
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [user, refreshProfile]);

  const fetchPreferences = async () => {
    try {
      // Fetch user preferences
      const { data: preferencesData } = await supabase
        .from('preferences')
        .select('location, job_title, seniority_level, job_type')
        .eq('user_id', user?.id)
        .maybeSingle();

      setPreferences(preferencesData ?? null);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    navigate('/pricing?upgrade=true');
  };

  const getPlanIcon = (plan: string) => {
    switch (plan) {
      case 'elite': return Crown;
      case 'pro': return Zap;
      default: return Star;
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'elite': return 'bg-gradient-to-r from-accent to-primary';
      case 'pro': return 'bg-gradient-primary';
      default: return 'bg-gradient-to-r from-slate-500 to-slate-600';
    }
  };

  if (loading) {
    return (
      <aside className="w-80 bg-card border-r border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-muted rounded-lg"></div>
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-48 bg-muted rounded-lg"></div>
        </div>
      </aside>
    );
  }

  const normalizedPlan = normalizePlan(profile?.plan);
  const PlanIcon = getPlanIcon(normalizedPlan);
  
  // Debug logging
  console.log('📋 Sidebar: Current profile:', profile);
  console.log('📋 Sidebar: Normalized plan:', normalizedPlan);

  return (
    <aside className="w-80 bg-card border-r border-border p-6 space-y-6">
      {/* Plan Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${getPlanColor(normalizedPlan)} flex items-center justify-center`}>
              <PlanIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{getPlanDisplayName(normalizedPlan)}</CardTitle>
              {profile?.subscription_status && (
                <Badge variant="outline" className="text-xs">
                  {profile.subscription_status}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {normalizedPlan === 'free' && (
            <Button 
              className="w-full bg-gradient-primary hover:opacity-90" 
              size="sm"
              onClick={handleUpgrade}
            >
              Upgrade Plan
            </Button>
          )}
          {normalizedPlan !== 'free' && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Next billing: Dec 15</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={handleUpgrade}
              >
                Change Plan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CV Manager */}
      <CVManager userPlan={normalizedPlan} />

      <Separator />

      {/* Job Preferences Display */}
      {preferences && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Job Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Location</div>
              <Badge variant="secondary" className="text-xs">
                <MapPin className="w-3 h-3 mr-1" />
                {preferences.location}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Job Title</div>
              <Badge variant="secondary" className="text-xs">
                {preferences.job_title}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Level</div>
              <Badge variant="secondary" className="text-xs">
                {preferences.seniority_level}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Type</div>
              <Badge variant="secondary" className="text-xs">
                {preferences.job_type}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </aside>
  );
};