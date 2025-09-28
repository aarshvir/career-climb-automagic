/**
 * Centralized plan normalization utility
 * Ensures consistent plan handling across all components
 */

export type PlanType = 'free' | 'pro' | 'elite';

/**
 * Normalizes a plan string to a consistent format
 * Handles case sensitivity and 'premium' -> 'pro' mapping
 */
export const normalizePlan = (plan?: string | null): PlanType => {
  const normalized = (plan?.toLowerCase() || 'free').trim();
  
  // Handle common variations
  if (normalized === 'premium') {
    return 'pro';
  }
  
  // Ensure only valid plan types
  if (normalized === 'pro' || normalized === 'elite') {
    return normalized;
  }
  
  return 'free';
};

/**
 * Gets plan display name for UI
 */
export const getPlanDisplayName = (plan?: string | null): string => {
  const normalized = normalizePlan(plan);
  
  switch (normalized) {
    case 'elite':
      return 'Elite Plan';
    case 'pro':
      return 'Pro Plan';
    default:
      return 'Free Plan';
  }
};

/**
 * Checks if a plan is a paid plan
 */
export const isPaidPlan = (plan?: string | null): boolean => {
  const normalized = normalizePlan(plan);
  return normalized === 'pro' || normalized === 'elite';
};

/**
 * Checks if a plan is the highest tier
 */
export const isElitePlan = (plan?: string | null): boolean => {
  return normalizePlan(plan) === 'elite';
};

/**
 * Checks if a plan is pro tier or higher
 */
export const isProPlanOrHigher = (plan?: string | null): boolean => {
  const normalized = normalizePlan(plan);
  return normalized === 'pro' || normalized === 'elite';
};
