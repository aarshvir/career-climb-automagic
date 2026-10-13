export function utc(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Time unavailable';
}
export function usd(value: number | null): string { return value === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value); }
export function shortId(value: string) { return value.length > 12 ? `${value.slice(0, 8)}…` : value; }
export function readable(value: string) { return value.replace(/_/g, ' '); }
