const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
export function localCalendarDate(value = new Date()): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}
export function loopDateLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return dateOnly.test(value) ? new Date(`${value}T12:00:00`).toLocaleDateString() : new Date(value).toLocaleString();
}
export function loopFollowUpDue(value: string | null, now = new Date()): boolean {
  if (!value || !Number.isFinite(Date.parse(value))) return false;
  return dateOnly.test(value) ? value <= localCalendarDate(now) : Date.parse(value) <= now.getTime();
}
