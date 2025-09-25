import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PlanLimits, usePlanLimits } from '@/hooks/usePlanLimits';

interface UserProfile {
  plan: string;
  subscription_status: string | null;
}

interface PlanContextType {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  planLimits: PlanLimits;
  refreshProfile: () => Promise<void>;
  // Daily usage tracking
  dailyFetchCount: number;
  lastFetchDate: string | null;
  canFetchToday: boolean;
  incrementFetchCount: () => Promise<void>;
  resetDailyCount: () => void;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return context;
};

interface PlanProviderProps {
  children: ReactNode;
}

export const PlanProvider = ({ children }: PlanProviderProps) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Daily usage tracking
  const [dailyFetchCount, setDailyFetchCount] = useState(0);
  const [lastFetchDate, setLastFetchDate] = useState<string | null>(null);
  
  const planLimits = usePlanLimits(profile?.plan);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('🔄 PlanContext: Fetching profile for user', user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('❌ PlanContext: Error fetching profile:', error);
        
        // Create a default profile if none exists
        if (error.code === 'PGRST116') {
          console.log('📝 PlanContext: Creating default profile...');
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({ id: user.id, plan: 'free', email: user.email })
            .select('plan, subscription_status')
            .single();

          if (insertError) {
            throw insertError;
          }
          
          setProfile({ plan: newProfile.plan || 'free', subscription_status: newProfile.subscription_status });
        } else {
          throw error;
        }
      } else {
        const userProfile: UserProfile = {
          plan: data?.plan || 'free',
          subscription_status: data?.subscription_status || null,
        };

        console.log('✅ PlanContext: Profile fetched successfully', userProfile);
        setProfile(userProfile);
      }

      setError(null);

      // Use localStorage for daily usage tracking
      const today = new Date().toISOString().split('T')[0];
      const storageKey = `daily_usage_${user.id}_${today}`;
      const storedData = localStorage.getItem(storageKey);
      
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          setDailyFetchCount(parsed.fetchCount || 0);
          setLastFetchDate(parsed.fetchDate || null);
        } catch (parseError) {
          console.error('Error parsing stored usage data:', parseError);
          setDailyFetchCount(0);
          setLastFetchDate(null);
        }
      } else {
        setDailyFetchCount(0);
        setLastFetchDate(null);
      }

    } catch (error) {
      console.error('❌ PlanContext: Failed to fetch profile:', error);
      setError(error instanceof Error ? error.message : 'Failed to load profile');
      // Set fallback profile to prevent blocking the app
      setProfile({ plan: 'free', subscription_status: null });
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load profile when user changes
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const today = new Date().toISOString().split('T')[0];
  const canFetchToday = dailyFetchCount < planLimits.dailyJobApplications;

  const incrementFetchCount = useCallback(async () => {
    if (!user || !profile) return;

    try {
      const newCount = dailyFetchCount + 1;
      
      // Use localStorage for daily usage tracking
      console.warn('Using localStorage for daily usage tracking');
      
      // Store in localStorage
      const storageKey = `daily_usage_${user.id}_${today}`;
      const usageData = {
        fetchCount: newCount,
        fetchDate: today,
        lastUpdated: new Date().toISOString(),
      };
      
      localStorage.setItem(storageKey, JSON.stringify(usageData));
      
      setDailyFetchCount(newCount);
      setLastFetchDate(today);
      
      console.log('📈 Fetch count incremented (localStorage):', newCount);
    } catch (error) {
      console.error('Error incrementing fetch count:', error);
    }
  }, [user, profile, dailyFetchCount, today]);

  const resetDailyCount = useCallback(() => {
    if (!user) return;
    
    const storageKey = `daily_usage_${user.id}_${today}`;
    localStorage.removeItem(storageKey);
    setDailyFetchCount(0);
    setLastFetchDate(null);
    
    console.log('🔄 Daily count reset');
  }, [user, today]);

  const value: PlanContextType = {
    profile,
    loading,
    error,
    planLimits,
    refreshProfile,
    dailyFetchCount,
    lastFetchDate,
    canFetchToday,
    incrementFetchCount,
    resetDailyCount,
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
};