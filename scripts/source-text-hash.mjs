import { createHash } from 'node:crypto';
/** Deployment source hashes describe UTF-8 text independent of Windows/Git
 * line endings. Immutable generated artifact hashes still describe exact bytes. */
export const SOURCE_HASH_ALGORITHM = 'sha256-utf8-lf-no-bom';
export function normalizedTextDigest(bytes) {
  const text=Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  return createHash('sha256').update(text,'utf8').digest('hex');
}
