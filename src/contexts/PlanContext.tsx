import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PlanLimits, usePlanLimits } from '@/hooks/usePlanLimits';
import { planManager } from '@/utils/planManager';
import { logger } from '@/lib/logger';

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
      logger.debug('PlanContext: Fetching profile for user', { userId: user.id });

      // Use PlanManager for robust plan handling
      const planData = await planManager.fetchPlan(user.id);
      
      const userProfile: UserProfile = {
        plan: planData.plan,
        subscription_status: planData.subscription_status,
      };

      logger.info('PlanContext: Profile fetched successfully', userProfile);
      
      // Update profile state
      setProfile(userProfile);
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
          logger.error('Error parsing stored usage data', parseError);
          setDailyFetchCount(0);
          setLastFetchDate(null);
        }
      } else {
        setDailyFetchCount(0);
        setLastFetchDate(null);
      }

    } catch (error) {
      logger.error('PlanContext: Failed to fetch profile', error);
      setError(error instanceof Error ? error.message : 'Failed to load profile');
      
      // Try to load from cache as fallback - don't reset to free if we have cached data
      const cachedPlan = planManager.loadPlan(user.id);
      if (cachedPlan) {
        logger.info('PlanContext: Using cached plan data as fallback', cachedPlan);
        setProfile({
          plan: cachedPlan.plan,
          subscription_status: cachedPlan.subscription_status,
        });
        setError(null); // Clear error since we have cached data
      } else {
        // Only set to free if we truly have no cached data
        logger.warn('PlanContext: No cached data available, using free plan as fallback');
        setProfile({ plan: 'free', subscription_status: null });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load profile when user changes
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Subscribe to PlanManager changes
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = planManager.subscribe(() => {
      logger.debug('PlanContext: PlanManager notified of changes, refreshing');
      refreshProfile();
    });
    
    return unsubscribe;
  }, [user, refreshProfile]);

  // Listen for plan upgrade events from other components with debouncing
  useEffect(() => {
    let isRefreshing = false;
    let refreshTimeout: NodeJS.Timeout | null = null;
    
    const handlePlanUpgrade = async () => {
      if (isRefreshing) {
        logger.debug('PlanContext: Already refreshing, skipping duplicate event');
        return;
      }
      
      // Clear any pending refresh
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      
      // Debounce the refresh to avoid too frequent updates
      refreshTimeout = setTimeout(async () => {
        isRefreshing = true;
        logger.debug('PlanContext: Received plan upgrade event, refreshing');
        
        try {
          await refreshProfile();
        } finally {
          isRefreshing = false;
        }
      }, 1000); // 1 second debounce
    };

    // Listen for custom plan upgrade events
    window.addEventListener('planUpgraded', handlePlanUpgrade);
    
    return () => {
      window.removeEventListener('planUpgraded', handlePlanUpgrade);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [refreshProfile]);

  const today = new Date().toISOString().split('T')[0];
  const canFetchToday = dailyFetchCount < planLimits.dailyJobApplications;

  const incrementFetchCount = useCallback(async () => {
    if (!user || !profile) return;

    try {
      const newCount = dailyFetchCount + 1;
      
      // Use localStorage for daily usage tracking
      logger.warn('Using localStorage for daily usage tracking');
      
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
      
      logger.debug('Fetch count incremented (localStorage)', { count: newCount });
    } catch (error) {
      logger.error('Error incrementing fetch count', error);
    }
  }, [user, profile, dailyFetchCount, today]);

  const resetDailyCount = useCallback(() => {
    if (!user) return;
    
    const storageKey = `daily_usage_${user.id}_${today}`;
    localStorage.removeItem(storageKey);
    setDailyFetchCount(0);
    setLastFetchDate(null);
    
    logger.debug('Daily count reset');
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