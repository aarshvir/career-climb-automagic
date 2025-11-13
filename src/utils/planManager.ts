import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PlanData {
  plan: string;
  subscription_status: string | null;
  lastUpdated: number;
}

export class PlanManager {
  private static instance: PlanManager;
  private cache: Map<string, PlanData> = new Map();
  private refreshCallbacks: Set<() => void> = new Set();
  private updateInProgress: Set<string> = new Set();
  private fetchInProgress: Map<string, Promise<PlanData>> = new Map();

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

  // Update plan in database and cache with mutex lock
  async updatePlan(userId: string, newPlan: string): Promise<void> {
    // Prevent concurrent updates for same user
    if (this.updateInProgress.has(userId)) {
      logger.warn('Plan update already in progress for user', { userId });
      // Wait for existing update to complete
      let attempts = 0;
      while (this.updateInProgress.has(userId) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      return;
    }

    this.updateInProgress.add(userId);

    try {
      logger.debug('PlanManager: Updating plan', { userId, newPlan });

      // Clear any stale cache first
      this.cache.delete(userId);
      localStorage.removeItem(`plan_${userId}`);

      // Update database with upsert to handle both insert and update
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          plan: newPlan
        }, {
          onConflict: 'id'
        })
        .select('plan, subscription_status')
        .single();

      if (error) {
        logger.error('PlanManager: Database upsert failed', error);
        throw error;
      }

      logger.debug('PlanManager: Database updated', { data });

      // Update cache with fresh data from database
      const planData: PlanData = {
        plan: data?.plan || newPlan,
        subscription_status: data?.subscription_status || null,
        lastUpdated: Date.now()
      };

      this.cache.set(userId, planData);

      // Store in localStorage for persistence
      localStorage.setItem(`plan_${userId}`, JSON.stringify(planData));

      logger.info('PlanManager: Plan updated successfully', { plan: planData.plan });

      // Notify all subscribers ONCE after successful update
      this.notify();

    } catch (error) {
      logger.error('PlanManager: Failed to update plan', error);
      throw error;
    } finally {
      this.updateInProgress.delete(userId);
    }
  }

  // Fetch plan from database with deduplication
  async fetchPlan(userId: string): Promise<PlanData> {
    // Reuse existing fetch promise if one is in progress
    if (this.fetchInProgress.has(userId)) {
      logger.debug('PlanManager: Reusing in-progress fetch for user', { userId });
      return this.fetchInProgress.get(userId)!;
    }

    // Create the promise and store it before fetching
    const fetchPromise = this._performFetch(userId);
    this.fetchInProgress.set(userId, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.fetchInProgress.delete(userId);
    }
  }

  private async _performFetch(userId: string): Promise<PlanData> {
    try {
      logger.debug('PlanManager: Fetching plan for user', { userId });

      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error('PlanManager: Error fetching plan', error);
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

      logger.info('PlanManager: Plan fetched successfully', { plan: planData.plan });
      return planData;

    } catch (error) {
      logger.error('PlanManager: Failed to fetch plan', error);

      // Try to get from cache first
      const memoryCache = this.cache.get(userId);
      if (memoryCache) {
        logger.info('PlanManager: Using memory cache as fallback', memoryCache);
        return memoryCache;
      }

      // Try localStorage as secondary fallback
      const storedData = localStorage.getItem(`plan_${userId}`);
      if (storedData) {
        try {
          const planData = JSON.parse(storedData);
          logger.info('PlanManager: Using localStorage as fallback', planData);
          this.cache.set(userId, planData);
          return planData;
        } catch (parseError) {
          logger.error('PlanManager: Failed to parse stored plan data', parseError);
        }
      }

      // Only return default plan if we have no data
      logger.warn('PlanManager: No cached data, using free plan as fallback');
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
        logger.error('PlanManager: Failed to parse stored plan data', error);
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
