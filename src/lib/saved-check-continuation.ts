/** Opaque selection only: the destination must fetch and verify the current owner.
 * Never carry CV text, consent, approval or generation authority in a URL. */
const CHECK_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type SavedCheckContinuationPath = `/loop?fromCheck=${string}`;

export function savedCheckContinuationPath(id: string): SavedCheckContinuationPath | null {
  return CHECK_ID.test(id) ? `/loop?fromCheck=${id}` : null;
}

export function readSavedCheckContinuation(search: string): string | null {
  if (search.length > 60 || !search.startsWith('?fromCheck=')) return null;
  const id = search.slice('?fromCheck='.length);
  return CHECK_ID.test(id) ? id : null;
}

export function isSavedCheckContinuationPath(path: unknown): path is SavedCheckContinuationPath {
  return typeof path === 'string' && path.startsWith('/loop?') && readSavedCheckContinuation(path.slice('/loop'.length)) !== null;
}
