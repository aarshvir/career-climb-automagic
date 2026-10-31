import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUTH_URL, AUTH_SHA256, verifyAuthFixture, authImportMap } from './check-cloud-auth.mjs';

const fixture = await readFile(new URL('./fixtures/auth-js-2.71.1.mjs', import.meta.url));
const lock = JSON.parse(await readFile(new URL('../supabase/functions/job-loop-worker/deno.lock', import.meta.url), 'utf8'));

test('CI auth fixture is exactly the original production-locked module', () => {
  assert.equal(verifyAuthFixture(fixture, lock), AUTH_SHA256);
});
test('altered authentication source is rejected before execution', () => {
  const changed = Buffer.from(fixture); changed[changed.length - 1] ^= 1;
  assert.throws(() => verifyAuthFixture(changed, lock), /integrity mismatch/);
});
test('an empty fixture never falls back to network or another hash', () => {
  assert.throws(() => verifyAuthFixture(Buffer.alloc(0), lock), /integrity mismatch/);
});
test('missing or changed production pin requires explicit review', () => {
  assert.throws(() => verifyAuthFixture(fixture, {}), /Production auth lock differs/);
  assert.throws(() => verifyAuthFixture(fixture, { remote: { [AUTH_URL]: '0'.repeat(64) } }), /Production auth lock differs/);
});
test('test import map retains existing config imports and maps only the pinned auth module', () => {
  const config = { imports: { jspdf: 'npm:jspdf@4.2.1', docx: 'npm:docx@9.9.0' } };
  const original = structuredClone(config);
  const map = authImportMap(config, 'file:///fixture/auth-js.mjs');
  assert.deepEqual(config, original);
  assert.deepEqual(map.imports, { ...original.imports, [AUTH_URL]: 'file:///fixture/auth-js.mjs' });
});
