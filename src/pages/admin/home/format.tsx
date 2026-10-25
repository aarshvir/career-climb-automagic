/** Formatting shared by the admin pages. */
export const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
/** Amounts in a currency's minor units; yen has none. */
export const minor = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(currency === 'JPY' ? amount : amount / 100);
export const day = (iso: string) => { const [, month, date] = iso.slice(0, 10).split('-'); return `${Number(month)}/${Number(date)}`; };
export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: minutes > 300 * 24 * 60 ? 'numeric' : undefined });
}
export function statusPill(tone: 'good' | 'warn' | 'bad' | 'neutral', label: string) { return <span className={`vh-pill${tone === 'neutral' ? '' : ` vh-pill--${tone}`}`}>{label}</span>; }
