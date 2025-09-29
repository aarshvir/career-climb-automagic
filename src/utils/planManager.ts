import { supabase } from '@/integrations/supabase/client';

export interface PlanData {
  plan: string;
  subscription_status: string | null;
  lastUpdated: number;
}

export class PlanManager {
  private static instance: PlanManager;
  private cache: Map<string, PlanData> = new Map();
  private refreshCallbacks: Set<() => void> = new Set();

  private constructor() {}

  static getInstance(): PlanManager {
    if (!PlanManager.instance) {
      PlanManager.instance = new PlanManager();
    }
    return PlanManager.instance;
  }

  // Subscribe to plan changes
  subscribe(callback: () => void): () => void {
    this.refreshCallbacks.add(callback);
    return () => {
      this.refreshCallbacks.delete(callback);
    };
  }

  // Notify all subscribers
  private notify(): void {
    this.refreshCallbacks.forEach(callback => callback());
  }

  // Get cached plan data
  getCachedPlan(userId: string): PlanData | null {
    return this.cache.get(userId) || null;
  }

  // Update plan in database and cache
  async updatePlan(userId: string, newPlan: string): Promise<void> {
    try {
      console.log('🔄 PlanManager: Updating plan to', newPlan, 'for user', userId);
      
      // Update database
      const { error } = await supabase
        .from('profiles')
        .update({ plan: newPlan })
        .eq('id', userId);

      if (error) {
        console.error('❌ PlanManager: Database update failed:', error);
        throw error;
      }

      // Update cache immediately
      const planData: PlanData = {
        plan: newPlan,
        subscription_status: this.cache.get(userId)?.subscription_status || null,
        lastUpdated: Date.now()
      };
      
      this.cache.set(userId, planData);
      
      // Store in localStorage for persistence
      localStorage.setItem(`plan_${userId}`, JSON.stringify(planData));
      
      console.log('✅ PlanManager: Plan updated successfully');
      
      // Notify all subscribers
      this.notify();
      
    } catch (error) {
      console.error('❌ PlanManager: Failed to update plan:', error);
      throw error;
    }
  }

  // Fetch plan from database
  async fetchPlan(userId: string): Promise<PlanData> {
    try {
      console.log('🔄 PlanManager: Fetching plan for user', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('❌ PlanManager: Error fetching plan:', error);
        throw error;
      }

      const planData: PlanData = {
        plan: data?.plan || 'free',
        subscription_status: data?.subscription_status || null,
        lastUpdated: Date.now()
      };

      // Update cache
      this.cache.set(userId, planData);
      
      // Store in localStorage for persistence
      localStorage.setItem(`plan_${userId}`, JSON.stringify(planData));
      
      console.log('✅ PlanManager: Plan fetched successfully', planData);
      return planData;
      
    } catch (error) {
      console.error('❌ PlanManager: Failed to fetch plan:', error);
      
      // Try to get from localStorage as fallback
      const cached = localStorage.getItem(`plan_${userId}`);
      if (cached) {
        try {
          const planData = JSON.parse(cached);
          console.log('🔄 PlanManager: Using cached plan data', planData);
          return planData;
        } catch (parseError) {
          console.error('❌ PlanManager: Failed to parse cached data:', parseError);
        }
      }
      
      // Only return default plan if we truly have no cached data
      const cached = this.cache.get(userId);
      if (cached) {
        console.log('🔄 PlanManager: Using cached plan data as fallback:', cached);
        return cached;
      }
      
      // Check localStorage as final fallback
      const stored = localStorage.getItem(`plan_${userId}`);
      if (stored) {
        try {
          const planData = JSON.parse(stored);
          console.log('🔄 PlanManager: Using localStorage plan data as fallback:', planData);
          this.cache.set(userId, planData);
          return planData;
        } catch (parseError) {
          console.error('❌ PlanManager: Failed to parse stored plan data:', parseError);
        }
      }
      
      // Only return default plan if we truly have no data anywhere
      console.log('⚠️ PlanManager: No cached or stored data available, using free plan as final fallback');
      const defaultPlan: PlanData = {
        plan: 'free',
        subscription_status: null,
        lastUpdated: Date.now()
      };
      
      this.cache.set(userId, defaultPlan);
      return defaultPlan;
    }
  }

  // Load plan from cache or localStorage
  loadPlan(userId: string): PlanData | null {
    // Try cache first
    const cached = this.cache.get(userId);
    if (cached) {
      return cached;
    }

    // Try localStorage
    const stored = localStorage.getItem(`plan_${userId}`);
    if (stored) {
      try {
        const planData = JSON.parse(stored);
        this.cache.set(userId, planData);
        return planData;
      } catch (error) {
        console.error('❌ PlanManager: Failed to parse stored plan data:', error);
      }
    }

    return null;
  }

  // Clear plan data
  clearPlan(userId: string): void {
    this.cache.delete(userId);
    localStorage.removeItem(`plan_${userId}`);
  }
}

// Export singleton instance
export const planManager = PlanManager.getInstance();
