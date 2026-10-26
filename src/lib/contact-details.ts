/** Name and mobile number collected for every account (stored in the auth user's metadata). */
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
export const accountName = (metadata: Metadata) => String(metadata?.full_name ?? metadata?.name ?? '').trim();
export const accountPhone = (metadata: Metadata) => String(metadata?.phone ?? '').trim();
export const hasContactDetails = (metadata: Metadata) => validName(accountName(metadata)) && /^\+\d{8,15}$/.test(accountPhone(metadata));

export interface ContactValue { name: string; countryCode: string; phone: string }
export const blankContact = (name = ''): ContactValue => ({ name, countryCode: defaultCountryCode(), phone: '' });
/** Returns the cleaned details, or a message describing what to fix. */
export function checkContact(value: ContactValue): { fullName: string; phone: string } | string {
  if (!validName(value.name)) return 'Please enter your full name.';
  const phone = normalizePhone(value.phone, value.countryCode);
  return phone ? { fullName: value.name.trim(), phone } : 'Please enter a valid mobile number, including the country code.';
}
