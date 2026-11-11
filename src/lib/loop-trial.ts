/** Seven-day free trial for a first monthly Automated Job Loop plan. A card is
 * required; nothing is charged until the trial ends. The server decides
 * eligibility (one trial per account) and whether trials are switched on. */
export const LOOP_TRIAL_DAYS = 7;
const DAY_MS = 86400000;

/** Public marketing copy only. Signed-in checkout always follows the server's
 * own trial availability and eligibility, never this build setting. */
export const loopTrialPublic = import.meta.env.VITE_JOBVANCE_LOOP_TRIAL === 'true';

export interface LoopTrialDates { trialEndsAt: Date; firstChargeAt: Date; reminderAt: Date }

/** Dates shown before checkout for a trial started now. The provider's recorded
 * first-charge date (after checkout) is the binding date and is shown in billing. */
export function loopTrialDates(now: number = Date.now()): LoopTrialDates {
  const end = now + LOOP_TRIAL_DAYS * DAY_MS;
  return { trialEndsAt: new Date(end), firstChargeAt: new Date(end), reminderAt: new Date(end - 2 * DAY_MS) };
}

export function loopTrialDay(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** The required plain statement of the trial terms. */
export function loopTrialTerms(cancelBefore: Date | string): string {
  return `${LOOP_TRIAL_DAYS}-day free trial, card required. Cancel before ${loopTrialDay(cancelBefore)} and you will not be charged.`;
}

/** Copy for public pages, where a visitor's eligibility is not yet known. */
export const LOOP_TRIAL_PUBLIC_LINE = `${LOOP_TRIAL_DAYS}-day free trial on your first monthly plan, card required. Cancel before the trial ends and you will not be charged.`;
