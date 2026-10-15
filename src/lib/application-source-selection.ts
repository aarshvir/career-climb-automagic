const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
export type ApplicationSourceKind = 'savedCheck' | 'pack' | 'tracked' | 'opportunity';
export type ApplicationSourcePath = `/applications?item=${string}` | `/check?savedCheck=${string}` | `/dashboard?pack=${string}` | `/dashboard?tracked=${string}` | `/loop?opportunity=${string}&generation=${number}`;

/** Opaque exact IDs only. Never accept CV text, redirects or ambiguous selectors. */
export function readApplicationSource(search: string, kind: ApplicationSourceKind): { id: string; generation?: number } | null {
  const match = new RegExp(`^\\?${kind}=(${uuid})${kind === 'opportunity' ? '&generation=(0|[1-9][0-9]*)' : ''}$`).exec(search);
  if (!match) return null;
  if (kind !== 'opportunity') return { id: match[1].toLowerCase() };
  const generation = Number(match[2]);
  return Number.isSafeInteger(generation) ? { id: match[1].toLowerCase(), generation } : null;
}

export function isApplicationSourcePath(value: unknown): value is ApplicationSourcePath {
  if (typeof value !== 'string') return false;
  const query = value.indexOf('?');
  if (query < 0) return false;
  const path = value.slice(0, query), search = value.slice(query);
  if (path === '/applications') {
    const match = new RegExp(`^\\?item=(?:check|pack|tracker)(?::|%3[Aa])${uuid}$`).test(search);
    const loop = new RegExp(`^\\?item=loop(?::|%3[Aa])(0|[1-9][0-9]*)(?::|%3[Aa])${uuid}$`).exec(search);
    return match || !!loop && Number.isSafeInteger(Number(loop[1]));
  }
  return path === '/check' ? !!readApplicationSource(search, 'savedCheck')
    : path === '/dashboard' ? !!(readApplicationSource(search, 'pack') || readApplicationSource(search, 'tracked'))
    : path === '/loop' && !!readApplicationSource(search, 'opportunity');
}
