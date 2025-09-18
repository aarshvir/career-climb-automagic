import { useState, useEffect } from "react";
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Default to free plan if error
      setProfile({ plan: 'free' });
    } finally {
      setLoading(false);
    }
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
            <Button className="w-full bg-gradient-primary hover:opacity-90" size="sm">
              Upgrade Plan
            </Button>
          )}
          {profile?.plan !== 'free' && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Next billing: Dec 15</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CV Manager */}
      <CVManager userPlan={profile?.plan || 'free'} />

      <Separator />

      {/* Job Preferences */}
      <JobPreferences userPlan={profile?.plan || 'free'} />
    </aside>
  );
};