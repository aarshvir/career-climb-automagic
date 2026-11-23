/** Local, editable search preferences. These are never evidence of qualifications. */
export const roleChoices = [
  'Any director-level role', 'Any manager-level role', 'Any vice president-level role',
  'Business analyst', 'Data analyst', 'Data scientist', 'Software engineer', 'Product manager',
  'Project manager', 'Program manager', 'Operations manager', 'Marketing manager', 'Sales manager',
  'Customer success manager', 'Financial analyst', 'Accountant', 'UX designer', 'Product designer',
  'HR manager', 'Recruiter', 'Business development manager', 'Operations analyst', 'Research analyst',
  'Administrative assistant', 'Graduate trainee', 'Intern', 'Director of operations',
  'Marketing director', 'Engineering director', 'Finance director', 'Sales director',
];
export const locationChoices = ['Remote', 'United States', 'United Kingdom', 'Canada', 'United Arab Emirates', 'India', 'Australia', 'Germany', 'Singapore', 'New York', 'San Francisco', 'Austin', 'Boston', 'Chicago', 'Seattle', 'Los Angeles', 'London', 'Toronto', 'Dubai', 'Abu Dhabi', 'Bengaluru', 'Mumbai'];

export function cleanPreferences(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Standard Google identity (name/email/avatar) cannot tell us someone's profession. */
export function accountRoleSuggestions(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const fields = metadata as Record<string, unknown>;
  const titles = Array.isArray(fields.target_titles) ? fields.target_titles : [];
  return cleanPreferences([...titles, fields.job_title, fields.occupation]
    .filter((value): value is string => typeof value === 'string' && value.trim().length <= 150 && !/[\n\r\u0000-\u001f]/.test(value)))
    .slice(0, 3);
}

/**
 * The name given at sign-up (`full_name`), used as the starting value of the "Name on your CV" question so it is not asked again from nothing.
 * It is only a starting value, never an answer the person gave on the setup page. Nothing is filled in when it is missing, not text, over 120 characters
 * (the limit of the field), or holds a control or text-direction character (which cannot be saved).
 */
export function accountFullName(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>).full_name;
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name.length > 0 && name.length <= 120 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name) ? name : '';
}

/** Recognize exact role headings, not skills, aspirations, or titles mentioned in prose. */
export function cvRoleSuggestions(source: string): string[] {
  const titles = roleChoices.filter(role => !role.startsWith('Any ') && role !== 'Intern');
  const output: string[] = [];
  for (const line of source.slice(0, 60000).split(/\r?\n/)) {
    const heading = line.replace(/^\s*[-•]\s*/, '').split(/\s+[|–—]\s+|\t/)[0].trim();
    if (heading.length > 100) continue;
    const withoutSeniority = heading.replace(/^(?:senior|junior|lead|principal|associate|assistant|staff)\s+/i, '');
    if (titles.some(title => title.toLocaleLowerCase() === withoutSeniority.toLocaleLowerCase())) output.push(heading);
  }
  return cleanPreferences(output).slice(0, 3);
}
