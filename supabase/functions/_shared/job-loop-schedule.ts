import { ApiError } from './core.ts';
import type { LoopScheduleInput } from './job-loop-types.ts';
import type { LoopEnv } from './job-loop-providers.ts';

export const MAX_PILOT_USERS = 10;
export function configuredUsageCap(env: LoopEnv): number {
  const raw = env('JOB_LOOP_MONTHLY_CAP_USD');
  const cap = raw === undefined || raw.trim() === '' ? 50 : Number(raw);
  if (!Number.isFinite(cap) || cap <= 0 || cap > 50) throw new ApiError(503, 'LOOP_BUDGET_CONFIGURATION', 'The AI/search budget configuration is invalid. Paid processing is held until the cap is at most US$50.');
  return cap;
}
export function validateScheduleInput(value: unknown): LoopScheduleInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a complete recurring schedule.');
  const item = value as Record<string, unknown>;
  const keys = ['cadence', 'timezone', 'localTime', 'weeklyDay', 'provider', 'model', 'modelConsent', 'inboxConsent'];
  if (Object.keys(item).some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(item, key))) throw new Error('The schedule contains unsupported or missing settings.');
  if (!['daily', 'weekdays', 'weekly'].includes(String(item.cadence)) || !['rules', 'anthropic', 'openai', 'moonshot'].includes(String(item.provider))) throw new Error('Choose a supported cadence and preparation method.');
  if (typeof item.timezone !== 'string' || item.timezone.length > 100 || typeof item.localTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.localTime)) throw new Error('Choose a valid time and IANA timezone.');
  try { new Intl.DateTimeFormat('en', { timeZone: item.timezone }).format(); } catch { throw new Error('Choose a valid IANA timezone, such as Asia/Dubai.'); }
  if (typeof item.model !== 'string' || !item.model.trim() || item.model.length > 150 || typeof item.modelConsent !== 'boolean' || typeof item.inboxConsent !== 'boolean') throw new Error('Choose the model and its processing permissions.');
  if (item.provider !== 'rules' && !item.modelConsent) throw new Error('Provider processing permission is required for a recurring model run.');
  if (item.cadence === 'weekly' ? !Number.isInteger(item.weeklyDay) || Number(item.weeklyDay) < 0 || Number(item.weeklyDay) > 6 : item.weeklyDay !== null) throw new Error('Choose one weekday for a weekly schedule; other cadences do not take a weekday.');
  return item as unknown as LoopScheduleInput;
}
function parts(date: Date, timezone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter(item => item.type !== 'literal').map(item => [item.type, Number(item.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}
function localInstant(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date | null {
  const target = Date.UTC(year, month - 1, day, hour, minute); let guess = target;
  for (let step = 0; step < 5; step++) { const p = parts(new Date(guess), timezone); const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); if (represented === target) break; guess += target - represented; }
  const p = parts(new Date(guess), timezone);
  // Nonexistent daylight-saving local times are skipped, never silently shifted.
  if (p.year !== year || p.month !== month || p.day !== day || p.hour !== hour || p.minute !== minute) return null;
  // The earlier occurrence is used once when clocks repeat a local hour.
  const earlier = new Date(guess - 3600000), e = parts(earlier, timezone);
  return e.year === year && e.month === month && e.day === day && e.hour === hour && e.minute === minute ? earlier : new Date(guess);
}
export function nextScheduledInstant(schedule: LoopScheduleInput, after = new Date()): string {
  const safe = validateScheduleInput(schedule), local = parts(after, safe.timezone), [hour, minute] = safe.localTime.split(':').map(Number);
  for (let offset = 0; offset <= 14; offset++) {
    const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day + offset)); const weekday = calendar.getUTCDay();
    if (safe.cadence === 'weekdays' && (weekday === 0 || weekday === 6) || safe.cadence === 'weekly' && weekday !== safe.weeklyDay) continue;
    const instant = localInstant(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), hour, minute, safe.timezone);
    if (instant && instant.getTime() > after.getTime()) return instant.toISOString();
  }
  throw new ApiError(422, 'LOOP_SCHEDULE_TIME', 'The next local scheduled time could not be established. Choose another time.');
}
/** Date-only reminders remain a local calendar date; explicit instants require a timezone offset. */
export function normalizeFollowUp(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { const date = new Date(`${value}T00:00:00Z`); if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value; }
  if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) { normalizeFollowUp(value.slice(0,10)); return new Date(value).toISOString(); }
  throw new Error('Use a real calendar date or a timestamp with its timezone offset.');
}
