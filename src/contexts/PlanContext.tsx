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

  const today = new Date().toDateString();
  const canFetchToday = dailyFetchCount < planLimits.dailyJobApplications;

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 PlanContext: Fetching profile for user', user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      const userProfile: UserProfile = {
        plan: data?.plan || 'free',
        subscription_status: data?.subscription_status || null,
      };

      console.log('✅ PlanContext: Profile fetched successfully', userProfile);
      setProfile(userProfile);
      setError(null);

      // Fetch daily usage - fallback to localStorage since table doesn't exist yet
      try {
        const { data: usageData, error: usageError } = await supabase
          .from('daily_usage')
          .select('fetch_count, fetch_date')
          .eq('user_id', user.id)
          .eq('fetch_date', today)
          .maybeSingle();

        if (usageError && usageError.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.warn('Daily usage table not found, falling back to localStorage');
          // Fallback to localStorage
          const storageKey = `daily_usage_${user.id}_${today}`;
          const storedData = localStorage.getItem(storageKey);
          if (storedData) {
            const parsed = JSON.parse(storedData);
            setDailyFetchCount(parsed.fetchCount || 0);
            setLastFetchDate(parsed.fetchDate || null);
          }
        } else if (usageData) {
          setDailyFetchCount(usageData.fetch_count || 0);
          setLastFetchDate(usageData.fetch_date);
          console.log('📊 Daily usage loaded from database:', usageData);
        } else {
          // No usage record for today, reset to 0
          setDailyFetchCount(0);
          setLastFetchDate(null);
        }
      } catch (error) {
        console.warn('Database unavailable, using localStorage fallback');
        const storageKey = `daily_usage_${user.id}_${today}`;
        const storedData = localStorage.getItem(storageKey);
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            setDailyFetchCount(parsed.fetchCount || 0);
            setLastFetchDate(parsed.fetchDate || null);
          } catch {
            setDailyFetchCount(0);
            setLastFetchDate(null);
          }
        } else {
          setDailyFetchCount(0);
          setLastFetchDate(null);
        }
      }

    } catch (error) {
      console.error('❌ PlanContext: Error fetching profile:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch profile');
      
      // Fallback to free plan
      setProfile({ plan: 'free', subscription_status: null });
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    await fetchProfile();
  }, [fetchProfile]);

  const incrementFetchCount = useCallback(async () => {
    if (!user || !profile) return;

    try {
      const newCount = dailyFetchCount + 1;
      
      // Try database first, fallback to localStorage
      try {
        const { error } = await supabase
          .from('daily_usage')
          .upsert({
            user_id: user.id,
            fetch_date: today,
            fetch_count: newCount,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,fetch_date'
          });

        if (error) throw error;
        console.log('📈 Fetch count incremented in database:', newCount);
      } catch (dbError) {
        console.warn('Database unavailable, using localStorage fallback');
        // Fallback to localStorage
        const storageKey = `daily_usage_${user.id}_${today}`;
        localStorage.setItem(storageKey, JSON.stringify({
          fetchCount: newCount,
          fetchDate: today
        }));
        console.log('📈 Fetch count incremented in localStorage:', newCount);
      }

      // Update local state
      setDailyFetchCount(newCount);
      setLastFetchDate(today);
      
    } catch (error) {
      console.error('❌ Error incrementing fetch count:', error);
      throw error;
    }
  }, [user, profile, dailyFetchCount, today]);

  const resetDailyCount = useCallback(() => {
    if (lastFetchDate !== today) {
      setDailyFetchCount(0);
      setLastFetchDate(null);
      console.log('🔄 Daily count reset for new day');
    }
  }, [lastFetchDate, today]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Reset daily count if it's a new day
  useEffect(() => {
    resetDailyCount();
  }, [resetDailyCount]);

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
