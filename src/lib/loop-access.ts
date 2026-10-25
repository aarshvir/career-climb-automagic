import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

/** No paid or free access, and every free place is taken: runs and schedules need a plan. */
export const loopPlacesFull = (snapshot: Pick<LoopSnapshot, 'pilot'>): boolean =>
  snapshot.pilot?.enrolled === false && snapshot.pilot.activeUsers >= snapshot.pilot.maxUsers;
/** The Pricing page opens with Starter selected and handles currency and checkout. */
export const starterCheckoutPath = '/pricing?loopPlan=weekly';
