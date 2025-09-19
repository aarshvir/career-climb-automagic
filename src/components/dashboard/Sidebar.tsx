import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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

interface UserProfile {
  plan: string;
  subscription_status?: string;
}

export const Sidebar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user?.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch user preferences
      const { data: preferencesData } = await supabase
        .from('preferences')
        .select('location, job_title, seniority_level, job_type')
        .eq('user_id', user?.id)
        .maybeSingle();

      setPreferences(preferencesData);
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Default to free plan if error
      setProfile({ plan: 'free' });
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

  const PlanIcon = getPlanIcon(profile?.plan || 'free');

  return (
    <aside className="w-80 bg-card border-r border-border p-6 space-y-6">
      {/* Plan Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${getPlanColor(profile?.plan || 'free')} flex items-center justify-center`}>
              <PlanIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg capitalize">{profile?.plan || 'free'} Plan</CardTitle>
              {profile?.subscription_status && (
                <Badge variant="outline" className="text-xs">
                  {profile.subscription_status}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {profile?.plan === 'free' && (
            <Button 
              className="w-full bg-gradient-primary hover:opacity-90" 
              size="sm"
              onClick={handleUpgrade}
            >
              Upgrade Plan
            </Button>
          )}
          {profile?.plan !== 'free' && (
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
      <CVManager userPlan={profile?.plan || 'free'} />

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