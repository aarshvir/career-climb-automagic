import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const source = await readFile(join(dist, 'server/index.js'), 'utf8');
const manifest = JSON.parse(await readFile(join(dist, '.openai/hosting.json'), 'utf8'));
const originalManifest = JSON.parse(await readFile(join(root, '.openai/hosting.json'), 'utf8'));
assert.equal(manifest.project_id, originalManifest.project_id, 'The original Site identity must be preserved.');
assert.ok(!('static' in manifest), 'Worker deployment must omit the static configuration.');
const compressedBytes = gzipSync(source, { level: 9 }).length;
assert.ok(compressedBytes < 3 * 1024 * 1024, 'Worker must fit the 3 MiB compressed script limit.');
// Force ESM parsing without relying on the deployment's package.json or filesystem.
const nativeAtob = globalThis.atob;
let decodedAssets = 0;
globalThis.atob = value => { decodedAssets++; return nativeAtob(value); };
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`).catch(error => {
  throw new Error(`Generated Worker is not valid ESM (${error.name}).`);
});
assert.equal(typeof worker?.fetch, 'function');
assert.equal(decodedAssets, 0, 'Loading the Worker must not decode all assets.');
const hosting = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const expectedHeaders = hosting.headers.find(rule => rule.source === '/(.*)').headers;
const request = async (path, options) => {
  try { return await worker.fetch(new Request(`https://example.test${path}`, options)); }
  catch { throw new Error(`Worker handler failed for ${path.split('?')[0]}.`); }
};
const checkHeaders = response => {
  for (const { key, value } of expectedHeaders) assert.equal(response.headers.get(key), value, `${key} must match the reviewed hosting policy.`);
};
const index = await readFile(join(dist, 'index.html'));
const undecodedHead = await request('/dashboard', { method: 'HEAD' });
assert.equal(undecodedHead.status, 200);
assert.equal(decodedAssets, 0, 'HEAD must not decode an asset body.');
for (const path of ['/', '/dashboard?tab=cv', '/auth/callback?code=synthetic', '/auth/reset', '/privacy']) {
  const response = await request(path);
  assert.equal(response.status, 200, `SPA route ${path} must serve the frontend.`);
  checkHeaders(response);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(index), 'SPA output must match the built index bytes.');
}
assert.equal(decodedAssets, 1, 'SPA routes must reuse one lazily decoded index.');

const names = await readdir(join(dist, 'assets'));
const cases = [
  [names.find(name => name.startsWith('index-') && name.endsWith('.js')), /^text\/javascript/],
  [names.find(name => name.endsWith('.css')), /^text\/css/],
  [names.find(name => name.endsWith('.ttf')), /^font\/ttf/],
  [names.find(name => name.endsWith('.mjs')), /^text\/javascript/],
];
for (const [name, mime] of cases) {
  assert.ok(name, 'The expected frontend asset must exist.');
  const path = `/assets/${name}`;
  const response = await request(path);
  const bytes = await readFile(join(dist, 'assets', name));
  assert.equal(response.status, 200);
  checkHeaders(response);
  assert.match(response.headers.get('Content-Type'), mime);
  assert.match(response.headers.get('Cache-Control'), /immutable/);
  assert.equal(Number(response.headers.get('Content-Length')), bytes.length);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(bytes), 'Asset output must preserve the built file bytes.');
  const etag = response.headers.get('ETag');
  const cached = await request(path, { headers: { 'If-None-Match': `"other", W/${etag}` } });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
  checkHeaders(cached);
  const head = await request(path, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('Content-Length')), bytes.length);
  assert.equal(head.headers.get('ETag'), etag);
  assert.equal(await head.text(), '');
  checkHeaders(head);
}

for (const path of ['/assets/missing.js', '/assets/missing', '/jsonld/missing.json', '/missing.png', '/.env', '/.git/config', '/.openai/hosting.json', '/server/index.js', '/src/main.tsx', '/docs/README', '/supabase/functions', '/assets/%2findex.js', '/assets/%5cindex.js', '/%252eenv', '/%zz', '/bad%00path']) {
  const response = await request(path);
  assert.equal(response.status, 404, `${path} must not expose private paths or use the SPA fallback.`);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  checkHeaders(response);
}
const headPage = await request('/dashboard', { method: 'HEAD' });
assert.equal(headPage.status, 200);
assert.equal(Number(headPage.headers.get('Content-Length')), index.length);
assert.equal(await headPage.text(), '');
checkHeaders(headPage);
const headMissing = await request('/assets/missing.js', { method: 'HEAD' });
assert.equal(headMissing.status, 404);
assert.equal(await headMissing.text(), '');
checkHeaders(headMissing);
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
  const response = await request('/dashboard', { method });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  checkHeaders(response);
}
assert.equal(decodedAssets, 1 + cases.length, 'ETag and HEAD requests must not decode additional assets.');
globalThis.atob = nativeAtob;
console.log(JSON.stringify({ result: 'passed', checks: ['security-headers', 'spa-deep-routes', 'asset-bytes-and-mime', 'etag-and-cache', 'head', 'missing-and-private-paths', 'unsafe-methods', 'project-identity', 'compressed-size'], compressedBytes }));
