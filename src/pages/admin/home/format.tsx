/** Formatting shared by the admin pages. */
/** Display compatibility for one note emitted by the already-applied dashboard RPC. */
export function adminCoverageNote(note: string): string {
  if (note === 'Visitors who do not sign up are not tracked yet, so there are no visit or traffic figures. Ad clicks and landing views are on the Marketing page.') {
    return 'Acquisition and Journeys show received visits, including visitors without accounts, from the start of collection. Earlier, blocked or undelivered activity is not included. Meta ad clicks and landing-page views are reported separately on the Meta ads page.';
  }
  return note;
}
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
/** 45 s, 3 min 20 s, 1 h 5 min. */
export function seconds(value: number): string {
  const total = Math.max(0, Math.round(value));
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min${total % 60 ? ` ${total % 60} s` : ''}`;
  return `${Math.floor(total / 3600)} h ${Math.floor(total % 3600 / 60)} min`;
}
