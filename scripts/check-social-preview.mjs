import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const imagePath = '/og-job-loop-account.png';
// The share URL is versioned so social caches fetch the redrawn card; the file path itself is unchanged.
const imageUrl = `https://jobvance.io${imagePath}?v=2`;
const image = await readFile(resolve(root, 'public', imagePath.slice(1)));
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
assert.ok(image.equals(await readFile(resolve(root, 'public/og-jobvance.png'))), 'Legacy URL must also serve corrected artwork after release.');
const source = await readFile(resolve(root, 'dist/server/index.js'), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function meta(html, key) {
  const found = [...html.matchAll(/<meta\s+(?:data-rh="true"\s+)?(?:name|property)="([^"]+)"\s+content="([^"]*)"\s*\/?\s*>/g)].filter(match => match[1] === key);
  assert.equal(found.length, 1, `Exactly one ${key} is required.`);
  assert.ok(found[0][0].includes('data-rh="true"'), `${key} must be client-managed to avoid duplicate route metadata.`);
  return found[0][2];
}
function verify(html, title) {
  for (const key of ['og:title', 'twitter:title']) assert.equal(meta(html, key), escape(title));
  for (const key of ['og:image', 'twitter:image']) assert.equal(meta(html, key), imageUrl);
  for (const key of ['og:image:alt', 'twitter:image:alt']) assert.match(meta(html, key), /Automate your job search/);
  for (const key of ['og:description', 'twitter:description']) {
    assert.ok(meta(html, key).length > 20);
    assert.doesNotMatch(meta(html, key), /no account needed|guest access|free beta/i);
  }
}
const manifest = JSON.parse(await readFile(resolve(root, 'dist/.prerender/manifest.json'), 'utf8'));
for (const page of manifest.pages) {
  const response = await worker.fetch(new Request(`https://jobvance.io${page.path}`));
  assert.equal(response.status, 200); verify(await response.text(), page.title);
}
const onboarding = await worker.fetch(new Request('https://jobvance.io/onboarding'));
assert.equal(onboarding.status, 200);
const onboardingHtml = await onboarding.text();
verify(onboardingHtml, 'Jobvance — automate your job search');
assert.match(meta(onboardingHtml, 'og:description'), /^Create your account,/);
for (const path of [imagePath, '/og-jobvance.png']) {
  const response = await worker.fetch(new Request(`https://jobvance.io${path}`));
  assert.equal(response.status, 200); assert.match(response.headers.get('Content-Type'), /^image\/png/);
  assert.ok(image.equals(Buffer.from(await response.arrayBuffer())), 'Worker must serve exact corrected PNG bytes.');
}
console.log(JSON.stringify({ result: 'passed', publicPageMetadata: manifest.pages.length, onboardingFallback: true, pngRoutes: 2, dimensions: [1200, 630], bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') }));
