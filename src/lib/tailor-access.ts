import { z } from 'zod';

const count = z.number().int().nonnegative();
/** The signed-in AI-tailoring summary returned by get-entitlement (jobvance_get_tailor_access). */
export const tailorAccessSchema = z.object({
  freeMonthlyLimit: count,
  freeUsedThisMonth: count,
  freeRemainingThisMonth: count,
  passes: z.array(z.object({ plan: z.string().max(40), name: z.string().max(80), expiresAt: z.string().max(64), quota: count, used: count, remaining: count })).max(100),
  paidRemaining: count,
  dailyLimit: count,
  usedToday: count,
});
export type TailorAccess = z.infer<typeof tailorAccessSchema>;

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * One plain line about the current plan, for example "Job Search pass · 82 of 100 tailored CVs left ·
 * until 16 Nov" or "Free · 2 of 3 tailored CVs left this month". The pass used next is the one shown.
 */
export function describeTailorPlan(access: TailorAccess): { text: string; free: boolean } {
  const [next, ...later] = access.passes;
  if (next) {
    const expiry = new Date(next.expiresAt);
    const until = Number.isNaN(expiry.getTime()) ? '' : ` · until ${shortDate.format(expiry)}`;
    const more = later.length ? ` · ${access.paidRemaining} left across ${access.passes.length} passes` : '';
    return { text: `${next.name} pass · ${next.remaining} of ${next.quota} tailored CVs left${until}${more}`, free: false };
  }
  return { text: `Free · ${access.freeRemainingThisMonth} of ${access.freeMonthlyLimit} tailored CVs left this month`, free: true };
}
