export const ABANDONMENT_NAMES = [
  'user dropped from dialog',
  'Form abandoned',
  'Form not completed'
] as const;

export const DIALOG_ABANDONMENT_PLACEHOLDER = {
  name: 'user dropped from dialog',
  phone: '+99999999999',
  career_objective: '',
  max_monthly_price: 0,
  app_expectations: ''
} as const;

export const EXIT_TRACKING_ABANDONMENT_PLACEHOLDER = {
  name: 'Form abandoned',
  phone: 'N/A',
  career_objective: 'Form not completed',
  max_monthly_price: 0,
  app_expectations: 'Form abandoned before completion'
} as const;

const normalizeString = (value: string) => value.trim().toLowerCase();

const getStringValues = (input: Record<string, unknown>) =>
  Object.values(input).filter((value): value is string => typeof value === 'string');

const STRING_PLACEHOLDERS = new Set<string>([
  ...ABANDONMENT_NAMES,
  ...getStringValues(DIALOG_ABANDONMENT_PLACEHOLDER),
  ...getStringValues(EXIT_TRACKING_ABANDONMENT_PLACEHOLDER)
]
  .map(normalizeString)
  .filter((value) => value.length > 0));

const NUMBER_PLACEHOLDERS = new Set<number>([
  DIALOG_ABANDONMENT_PLACEHOLDER.max_monthly_price,
  EXIT_TRACKING_ABANDONMENT_PLACEHOLDER.max_monthly_price
]);

export const hasMeaningfulValue = (value?: string | null): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return !STRING_PLACEHOLDERS.has(trimmed.toLowerCase());
};

export interface InterestFormRecord {
  name?: string | null;
  phone?: string | null;
  career_objective?: string | null;
  max_monthly_price?: number | string | null;
  app_expectations?: string | null;
}

const ABANDONMENT_NAME_SET = new Set(ABANDONMENT_NAMES.map(normalizeString));

export const hasCompletedForm = (record?: InterestFormRecord | null): boolean => {
  if (!record) {
    return false;
  }

  const normalizedName = record.name ? normalizeString(record.name) : '';
  const isAbandonmentName = normalizedName ? ABANDONMENT_NAME_SET.has(normalizedName) : false;

  const hasMeaningfulTextField = [
    record.name,
    record.phone,
    record.career_objective,
    record.app_expectations
  ].some(hasMeaningfulValue);

  let hasMeaningfulPrice = false;
  if (record.max_monthly_price !== undefined && record.max_monthly_price !== null) {
    const numericValue = typeof record.max_monthly_price === 'string'
      ? Number(record.max_monthly_price)
      : record.max_monthly_price;

    if (!Number.isNaN(numericValue) && !NUMBER_PLACEHOLDERS.has(numericValue) && numericValue > 0) {
      hasMeaningfulPrice = true;
    }
  }

  if (!hasMeaningfulTextField && !hasMeaningfulPrice) {
    return false;
  }

  if (isAbandonmentName) {
    return false;
  }

  return hasMeaningfulTextField || hasMeaningfulPrice;
};
