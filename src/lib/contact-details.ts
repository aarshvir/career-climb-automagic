import type { Session, User } from '@supabase/supabase-js';
import { readAuthSession } from '@/utils/authSession';
import { readSupabaseConfiguration } from '@/integrations/supabase/configuration';
import { cvVariantSessionIdentity } from './loop-cv-variant-recovery';
import { trackingAuthEpoch, trackingDraftAuthority } from './tracking-draft-memory';

/** A name is collected for every account; the mobile number is optional (both stored in the auth user's metadata). */
export const countryCodes = [
  ['US', '+1', 'United States / Canada'], ['GB', '+44', 'United Kingdom'], ['AE', '+971', 'United Arab Emirates'], ['IN', '+91', 'India'],
  ['SA', '+966', 'Saudi Arabia'], ['QA', '+974', 'Qatar'], ['KW', '+965', 'Kuwait'], ['OM', '+968', 'Oman'], ['BH', '+973', 'Bahrain'],
  ['PK', '+92', 'Pakistan'], ['EG', '+20', 'Egypt'], ['SG', '+65', 'Singapore'], ['AU', '+61', 'Australia'], ['IE', '+353', 'Ireland'],
  ['DE', '+49', 'Germany'], ['FR', '+33', 'France'], ['NL', '+31', 'Netherlands'], ['NG', '+234', 'Nigeria'], ['ZA', '+27', 'South Africa'], ['PH', '+63', 'Philippines'],
] as const;

/** The dialling code for the browser's region, e.g. en-AE gives +971. Defaults to +1. */
export function defaultCountryCode(language = typeof navigator === 'undefined' ? '' : navigator.language): string {
  const region = /-([A-Z]{2})$/i.exec(language)?.[1]?.toUpperCase();
  return countryCodes.find(([code]) => code === (region === 'CA' ? 'US' : region))?.[1] ?? '+1';
}

/** "+971 50 123 4567", "00971501234567" or a local number plus the chosen code becomes "+971501234567". */
export function normalizePhone(input: string, countryCode: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  const full = trimmed.startsWith('+') ? digits : trimmed.startsWith('00') ? digits.slice(2) : countryCode.replace(/\D/g, '') + digits.replace(/^0+/, '');
  return /^\d{8,15}$/.test(full) ? `+${full}` : null;
}

export const validName = (value: string) => value.trim().length >= 2 && value.trim().length <= 120;

type Metadata = Record<string, unknown> | undefined | null;
/** Google accounts arrive with full_name or name; email accounts with what they typed at sign-up. */
export const accountName = (metadata: Metadata) => { const value = metadata?.full_name ?? metadata?.name; return typeof value === 'string' ? value.trim() : ''; };
export const accountPhone = (metadata: Metadata) => typeof metadata?.phone === 'string' ? metadata.phone.trim() : '';
/** An account is ready for the private pages once it has a name; a mobile number is never required. */
export const hasContactDetails = (metadata: Metadata) => validName(accountName(metadata));
const validSavedPhone = (phone: string) => phone === '' || /^\+\d{8,15}$/.test(phone);

export interface ContactValue { name: string; countryCode: string; phone: string }
export const blankContact = (name = ''): ContactValue => ({ name, countryCode: defaultCountryCode(), phone: '' });
export const PHONE_ERROR = 'Please enter a valid mobile number with the country code, or leave it blank.';
/** Returns the cleaned details (phone is '' when left blank), or a message describing what to fix. */
export function checkContact(value: ContactValue): { fullName: string; phone: string } | string {
  if (!validName(value.name)) return 'Please enter your full name.';
  if (!value.phone.trim()) return { fullName: value.name.trim(), phone: '' };
  const phone = normalizePhone(value.phone, value.countryCode);
  return phone ? { fullName: value.name.trim(), phone } : PHONE_ERROR;
}

/** The token lives only in this mounted operation. Receipts never carry it. */
export interface ContactAuthority { readonly ownerId: string; readonly epoch: number; readonly sessionId: string; readonly token: string }
export interface ContactReceipt { ownerId: string; epoch: number; sessionId: string; fullName: string; phone: string }
const STALE = 'Your sign-in changed. Your details were not confirmed. Please retry from your current account.';

export function captureContactAuthority(user: User | null, session: Session | null, loading: boolean, authError: string | null): ContactAuthority | null {
  if (loading !== false || authError !== null || !user || !session || session.user.id !== user.id || !session.access_token) return null;
  const epoch = trackingAuthEpoch(), sessionId = cvVariantSessionIdentity(session);
  if (!sessionId || trackingDraftAuthority(user.id) !== epoch) return null;
  return Object.freeze({ ownerId: user.id, epoch, sessionId, token: session.access_token });
}
export const contactAuthorityKey = (value: Pick<ContactAuthority, 'ownerId' | 'epoch' | 'sessionId'>) => JSON.stringify([value.ownerId, value.epoch, value.sessionId]);
export function currentContactAuthority(scope: ContactAuthority) {
  return trackingAuthEpoch() === scope.epoch && trackingDraftAuthority(scope.ownerId) === scope.epoch;
}

/** Check the SDK only after capturing the original authority; it may resolve a later session. */
async function verifiedContactSession(scope: ContactAuthority, current: () => boolean) {
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  const session = await readAuthSession();
  if (!currentContactAuthority(scope) || !current() || !session || session.user.id !== scope.ownerId || cvVariantSessionIdentity(session) !== scope.sessionId) throw new Error(STALE);
}
function contactEndpoint() {
  const configuration = readSupabaseConfiguration({ VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
  if (configuration.error || !configuration.url || !configuration.publicKey) throw new Error('We could not connect. Please retry.');
  return { url: `${configuration.url}/auth/v1/user`, publicKey: configuration.publicKey };
}
function receiptFor(user: unknown, scope: ContactAuthority, expected?: { fullName: string; phone: string }): ContactReceipt | null {
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('We could not confirm the saved account. Please retry.');
  const value = user as { id?: unknown; user_metadata?: unknown };
  if (value.id !== scope.ownerId || !value.user_metadata || typeof value.user_metadata !== 'object' || Array.isArray(value.user_metadata)) throw new Error('We could not confirm the saved account. Please retry.');
  const metadata = value.user_metadata as Record<string, unknown>;
  if (expected && (metadata.full_name !== expected.fullName || expected.phone && metadata.phone !== expected.phone)) throw new Error('We could not confirm the exact details you saved. Please retry.');
  return hasContactDetails(metadata) ? { ownerId: scope.ownerId, epoch: scope.epoch, sessionId: scope.sessionId, fullName: accountName(metadata), phone: accountPhone(metadata) } : null;
}

/** Uses the captured token, never global updateUser selecting a later SDK user. */
export async function saveContactDetails(scope: ContactAuthority, details: { fullName: string; phone: string }, current: () => boolean): Promise<ContactReceipt> {
  const submitted = Object.freeze({ fullName: details.fullName, phone: details.phone });
  if (!validName(submitted.fullName) || submitted.fullName !== submitted.fullName.trim() || !validSavedPhone(submitted.phone)) throw new Error('Please enter your full name and, if you add one, a valid mobile number.');
  await verifiedContactSession(scope, current);
  const endpoint = contactEndpoint();
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  const response = await fetch(endpoint.url, { method: 'PUT', credentials: 'omit', headers: { apikey: endpoint.publicKey, Authorization: `Bearer ${scope.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { full_name: submitted.fullName, ...(submitted.phone && { phone: submitted.phone }) } }) });
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  if (!response.ok) throw new Error('We could not save your details. Please retry.');
  const receipt = receiptFor(await response.json(), scope, submitted);
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  if (!receipt || receipt.fullName !== submitted.fullName || submitted.phone && receipt.phone !== submitted.phone) throw new Error('We could not confirm the exact details you saved. Please retry.');
  return receipt;
}

/** Recover an already successful/ambiguous save on remount without another write. */
export async function readContactDetails(scope: ContactAuthority, current: () => boolean): Promise<ContactReceipt | null> {
  await verifiedContactSession(scope, current);
  const endpoint = contactEndpoint();
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  const response = await fetch(endpoint.url, { method: 'GET', credentials: 'omit', headers: { apikey: endpoint.publicKey, Authorization: `Bearer ${scope.token}` } });
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  if (!response.ok) throw new Error('We could not confirm your account details. Please retry.');
  const receipt = receiptFor(await response.json(), scope);
  if (!currentContactAuthority(scope) || !current()) throw new Error(STALE);
  return receipt;
}
