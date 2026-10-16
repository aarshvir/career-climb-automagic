import { z } from 'zod';
import { mvpSupabase, type TrackedApplication } from './cv-database';
import { trackingDraftAuthority } from './tracking-draft-memory';

const uuid = z.string().uuid();
const trackedRow = z.object({
  id: uuid, user_id: uuid, cv_check_id: uuid, pack_id: z.null(),
  job_title: z.string(), company: z.string(), job_url: z.string().nullable(),
  status: z.enum(['saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn']),
  notes: z.string(), applied_at: z.string().nullable(), follow_up_at: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
});

/** Only tracks an already saved check. It never saves CV text or accepts client
 * progress fields. The database owns both the relationship and retry identity. */
export async function trackFreeCheck(userId: string, checkId: string): Promise<TrackedApplication> {
  uuid.parse(userId); uuid.parse(checkId);
  const authority = trackingDraftAuthority(userId);
  function stillCurrent() {
    if (authority < 0 || trackingDraftAuthority(userId) !== authority) throw new Error('Your sign-in changed. Reopen this saved check before tracking it.');
  }
  async function requireOwner() {
    stillCurrent();
    const { data, error } = await mvpSupabase.auth.getUser();
    stillCurrent();
    if (error || data.user?.id !== userId) throw new Error('Please sign in again to track your saved check.');
  }
  await requireOwner();
  // An SDK account switch can occur between the awaited auth result and dispatch.
  stillCurrent();
  let data: unknown, error: unknown;
  try {
    ({ data, error } = await mvpSupabase.rpc('track_cv_check', { p_cv_check_id: checkId }));
  } catch {
    stillCurrent();
    throw new Error('Tracking could not be confirmed. Retry this same saved check; an existing entry and its progress will be kept.');
  }
  await requireOwner();
  if (error) throw new Error('Tracking could not be confirmed. Reopen or retry this saved check; an existing entry and its progress will be kept.');
  const result = z.array(trackedRow).length(1).safeParse(data);
  if (!result.success || result.data[0].user_id !== userId || result.data[0].cv_check_id !== checkId) {
    throw new Error('The tracking response did not match this saved check. Refresh Applications before retrying.');
  }
  // Runtime validation above is required because the application's non-strict
  // null-check compiler mode makes Zod's inferred object fields optional.
  return result.data[0] as TrackedApplication;
}
