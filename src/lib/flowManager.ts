/**
 * Centralized flow management for user onboarding and navigation
 * Prevents race conditions and ensures consistent user experience
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import { User } from '@supabase/supabase-js';

export interface FlowState {
  hasInterestForm: boolean;
  hasPlan: boolean;
  hasResume: boolean;
  hasPreferences: boolean;
  isComplete: boolean;
}

export interface FlowStep {
  id: string;
  name: string;
  required: boolean;
  completed: boolean;
  action: string;
}

export class FlowManager {
  private static instance: FlowManager;
  private flowState: FlowState | null = null;
  private lastUserId: string | null = null;

  static getInstance(): FlowManager {
    if (!FlowManager.instance) {
      FlowManager.instance = new FlowManager();
    }
    return FlowManager.instance;
  }

  async getFlowState(user: User): Promise<FlowState> {
    // Cache bust if different user
    if (this.lastUserId !== user.id) {
      this.flowState = null;
      this.lastUserId = user.id;
    }

    // Return cached state if available
    if (this.flowState) {
      return this.flowState;
    }

    try {
      logger.debug('Fetching user flow state', { userId: user.id });

      // Parallel queries for better performance
      const [interestResult, profileResult, resumeResult, preferencesResult] = await Promise.allSettled([
        supabase.from('interest_forms').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
        supabase.from('resumes').select('id').eq('user_id', user.id).limit(1),
        supabase.from('preferences').select('location, job_title, seniority_level, job_type, job_posting_type, job_posting_date').eq('user_id', user.id).maybeSingle()
      ]);

      const hasInterestForm = interestResult.status === 'fulfilled' && interestResult.value.data !== null;
      const hasPlan = profileResult.status === 'fulfilled' && profileResult.value.data?.plan !== null && profileResult.value.data?.plan !== undefined;
      const hasResume = resumeResult.status === 'fulfilled' && resumeResult.value.data && resumeResult.value.data.length > 0;
      
      let hasPreferences = false;
      if (preferencesResult.status === 'fulfilled' && preferencesResult.value.data) {
        const prefs = preferencesResult.value.data;
        hasPreferences = !!(prefs.location && prefs.job_title && prefs.seniority_level && prefs.job_type && prefs.job_posting_type && prefs.job_posting_date);
      }

      this.flowState = {
        hasInterestForm,
        hasPlan,
        hasResume,
        hasPreferences,
        isComplete: hasInterestForm && hasPlan && hasResume && hasPreferences
      };

      logger.info('Flow state computed', { 
        userId: user.id, 
        flowState: this.flowState 
      });

      return this.flowState;
    } catch (error) {
      logger.error('Failed to get flow state', error);
      // Return safe defaults
      return {
        hasInterestForm: false,
        hasPlan: false,
        hasResume: false,
        hasPreferences: false,
        isComplete: false
      };
    }
  }

  getNextStep(flowState: FlowState): FlowStep | null {
    if (!flowState.hasInterestForm) {
      return {
        id: 'interest',
        name: 'Complete Interest Form',
        required: true,
        completed: false,
        action: 'showInterestForm'
      };
    }

    if (!flowState.hasPlan) {
      return {
        id: 'plan',
        name: 'Select Plan',
        required: true,
        completed: false,
        action: 'navigateToPlanSelection'
      };
    }

    if (!flowState.hasResume) {
      return {
        id: 'resume',
        name: 'Upload Resume',
        required: true,
        completed: false,
        action: 'openResumeDialog'
      };
    }

    if (!flowState.hasPreferences) {
      return {
        id: 'preferences',
        name: 'Set Job Preferences',
        required: true,
        completed: false,
        action: 'openPreferencesDialog'
      };
    }

    return null; // Flow complete
  }

  invalidateCache(): void {
    this.flowState = null;
  }

  async canAccessDashboard(user: User): Promise<boolean> {
    const flowState = await this.getFlowState(user);
    return flowState.isComplete;
  }

  async getRequiredRedirect(user: User): Promise<string | null> {
    const flowState = await this.getFlowState(user);
    
    if (!flowState.hasInterestForm || !flowState.hasPlan) {
      // These require page navigation
      return flowState.hasInterestForm ? '/plan-selection' : null; // null means show interest form modal
    }

    // Resume and preferences are handled via dialogs
    return null;
  }
}

export const flowManager = FlowManager.getInstance();
