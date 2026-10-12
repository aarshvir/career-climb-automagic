/** Read a verified deployment bundle in bounded JSON chunks. No network,
 * deployment, credentials or writes: the caller composes the native MCP payload. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { normalizedTextDigest, SOURCE_HASH_ALGORITHM } from './source-text-hash.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [name, offsetText = '0', lengthText = '12000'] = process.argv.slice(2);
if (!['job-loop-control', 'job-loop-worker', 'job-loop-oauth'].includes(name)) throw new Error('Choose a reviewed Job Loop function.');
const offset = Number(offsetText), length = Number(lengthText);
if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 36000) throw new Error('Chunk offset and length must be bounded nonnegative integers.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/supabase-loop-ui/manifest.json'), 'utf8'));
const bundle = manifest.bundles.find(item => item.function === name);
const expectedPath = `docs/supabase-loop-ui/${name}.js`;
if (!bundle || bundle.artifact !== expectedPath) throw new Error('The reviewed bundle manifest does not match this function.');
const bytes = readFileSync(resolve(root, expectedPath));
if (bytes.length !== bundle.bytes || digest(bytes) !== bundle.sha256) throw new Error('Bundle bytes do not match the reviewed manifest.');
const sourceDigest=manifest.hashAlgorithms?.source===SOURCE_HASH_ALGORITHM?normalizedTextDigest:digest;
const migrationDigest=manifest.hashAlgorithms?.migration===SOURCE_HASH_ALGORITHM?normalizedTextDigest:digest;
for (const source of bundle.sources) if (sourceDigest(readFileSync(resolve(root, source.path))) !== source.sha256) throw new Error(`A source changed after bundling: ${source.path}`);
for (const migration of manifest.migrations ?? []) if (migrationDigest(readFileSync(resolve(root, migration.path))) !== migration.sha256) throw new Error(`A migration changed after bundling: ${migration.path}`);
const content = bytes.toString('utf8');
if (offset > content.length) throw new Error('Chunk offset exceeds the verified artifact.');
const chunk = content.slice(offset, offset + length);
const denoJson = readFileSync(resolve(root, `supabase/functions/${name}/deno.json`), 'utf8');
console.log(JSON.stringify({ name, file: 'index.js', sourcePath: expectedPath, offset, nextOffset: offset + chunk.length,
  totalChars: content.length, totalBytes: bytes.length, artifactSha256: bundle.sha256, chunkSha256: digest(chunk), chunk,
  ...(offset === 0 ? { denoJson, externalImports: [manifest.externalImport, ...manifest.externalPackages] } : {}) }));
