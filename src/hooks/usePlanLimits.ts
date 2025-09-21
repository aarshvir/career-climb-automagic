import { useMemo } from 'react';

export interface PlanLimits {
  resumeVariants: number;
  dailyJobApplications: number;
  isElite: boolean;
  isPro: boolean;
  isFree: boolean;
}

export const usePlanLimits = (plan: string | null | undefined): PlanLimits => {
  return useMemo(() => {
    const planType = plan?.toLowerCase() || 'free';
    
    switch (planType) {
      case 'elite':
        return {
          resumeVariants: 10,
          dailyJobApplications: 50,
          isElite: true,
          isPro: false,
          isFree: false,
        };
      case 'pro':
        return {
          resumeVariants: 3,
          dailyJobApplications: 20,
          isElite: false,
          isPro: true,
          isFree: false,
        };
      default: // 'free'
        return {
          resumeVariants: 1,
          dailyJobApplications: 2,
          isElite: false,
          isPro: false,
          isFree: true,
        };
    }
  }, [plan]);
};