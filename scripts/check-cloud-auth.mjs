import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const AUTH_URL = 'https://esm.sh/@supabase/auth-js@2.71.1/denonext/auth-js.mjs';
export const AUTH_SHA256 = 'a92d005e4a8a03063aa2c46d7d69161fa776ce1bacccc43daa70e28fe367068e';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'scripts/fixtures/auth-js-2.71.1.mjs');

/** The test mirror must be the exact module already trusted by the production lock. */
export function verifyAuthFixture(bytes, lock) {
  if (lock?.remote?.[AUTH_URL] !== AUTH_SHA256) throw new Error('Production auth lock differs from the reviewed CI fixture pin; review both before updating.');
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== AUTH_SHA256) throw new Error('CI authentication fixture integrity mismatch; refusing to run cloud tests.');
  return actual;
}

export function authImportMap(config, fixtureUrl) {
  return { imports: { ...config.imports, [AUTH_URL]: fixtureUrl } };
}

export async function main() {
  const config = join(root, 'supabase/functions/job-loop-worker/deno.json');
  const lock = JSON.parse(await readFile(join(dirname(config), 'deno.lock'), 'utf8'));
  const bytes = await readFile(fixture);
  const sha = verifyAuthFixture(bytes, lock); // Must succeed BEFORE Deno can execute any SDK code.
  const map = authImportMap(JSON.parse(await readFile(config, 'utf8')), pathToFileURL(fixture).href);
  const directory = await mkdtemp(join(tmpdir(), 'jobvance-auth-ci-'));
  const mapFile = join(directory, 'imports.json');
  try {
    await writeFile(mapFile, JSON.stringify(map));
    console.log(`Verified exact production-locked auth-js fixture: ${sha} (${bytes.length}bytes)`);
    const result = spawnSync(process.env.DENO_BIN || 'deno', [
      'test', '--frozen', '--allow-env', '--config', config, '--import-map', mapFile,
      join(root, 'supabase/tests/job-loop-edge.deno.ts'),
    ], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Deno authentication tests terminated: ${result.signal}`);
    process.exitCode = result.status ?? 1;
  } finally {
    // Only our one temporary file/directory; no recursive cleanup or cache modification.
    await unlink(mapFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
