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
// Headroom guard. A clean build (empty outDir) is about 2.2 MB compressed, so 15% of the limit stays free. Building into a non-empty
// outDir keeps stale chunks and inflates this number (that is how an older note came to quote 3.05 MB): clear dist before measuring.
assert.ok(compressedBytes < 3 * 1024 * 1024 * 0.85, `Worker uses ${compressedBytes} bytes of the 3 MiB limit; at least 15% must stay free (clear dist first if stale chunks inflate this).`);
// Force ESM parsing without relying on the deployment's package.json or filesystem.
const nativeAtob = globalThis.atob;
let decodedAssets = 0;
globalThis.atob = value => { decodedAssets++; return nativeAtob(value); };
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`).catch(error => {
  throw new Error(`Generated Worker is not valid ESM (${error.name}).`);
});
assert.equal(typeof worker?.fetch, 'function');
assert.equal(worker.decodedAssets, 0, 'Loading the Worker must not decode all assets.');
const hosting = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const expectedHeaders = hosting.headers.find(rule => rule.source === '/(.*)').headers;
const publicRender = JSON.parse(await readFile(join(dist,'.prerender/manifest.json'),'utf8'));
const request = async (path, options) => {
  try { return await worker.fetch(new Request(`https://example.test${path}`, options)); }
  catch { throw new Error(`Worker handler failed for ${path.split('?')[0]}.`); }
};
const checkHeaders = response => {
  for (const { key, value } of expectedHeaders) {
    const expected=key==='Content-Security-Policy'?value.replace(/script-src ([^;]+)/,(_match,policy)=>`script-src ${policy} ${publicRender.scriptHashes.join(' ')}`):value;
    assert.equal(response.headers.get(key), expected, `${key} must match the reviewed hosting policy and verified data-script hashes.`);
  }
};
const index = await readFile(join(dist, 'index.html'));
const undecodedHead = await request('/dashboard', { method: 'HEAD' });
assert.equal(undecodedHead.status, 200);
assert.equal(worker.decodedAssets, 0, 'HEAD must not decode an asset body.');
for (const path of ['/dashboard?tab=cv', '/auth/callback?code=synthetic', '/auth/reset']) {
  const response = await request(path);
  assert.equal(response.status, 200, `SPA route ${path} must serve the frontend.`);
  checkHeaders(response);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(index), 'SPA output must match the built index bytes.');
}
assert.equal(worker.decodedAssets, 1, 'SPA routes must reuse one lazily decoded index.');
// The ad landing routes are the same shell plus parallel preloads of the account-entry chunks (nothing else differs).
const indexText = index.toString('utf8');
let entryShell = null;
for (const path of ['/onboarding?utm_source=meta', '/auth?mode=signup']) {
  const response = await request(path);
  assert.equal(response.status, 200, `Account entry ${path} must serve the frontend.`);
  checkHeaders(response);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
  // The only body difference is the static first paint inside #root: inert markup (no script, link, form, image or input).
  const paint = raw.match(/<div id="root">(<div aria-hidden="true" style="padding-top:72px">[\s\S]*?<\/main><\/div>)<\/div>/);
  assert.ok(paint, 'Account entry carries the static first paint.');
  assert.doesNotMatch(paint[1], /<(script|link|form|img|input|iframe|a)\b/i, 'The static first paint is inert markup.');
  // The description paragraph is the largest text on desktop: it must be in the first paint (same words as Auth.tsx) so it is never a late LCP element.
  assert.match(paint[1], /<p class="ap-story-description">Choose your roles and locations once\. <span class="jv-nb">Automated Job Loop<\/span> finds the best-matching jobs and prepares role-specific CVs from the facts you confirm\.<\/p>/, 'The static first paint carries the story description.');
  const text = raw.replace(paint[0], '<div id="root"></div>');
  const [head, tail] = indexText.split('</head>');
  assert.ok(text.startsWith(head) && text.endsWith('</head>' + tail), 'Account entry must be the built index plus head links only.');
  const added = text.slice(head.length, text.length - tail.length - '</head>'.length);
  assert.match(added, /^(<link rel="(stylesheet|modulepreload)" href="\/assets\/[^"]+"\/>)+$/, 'Account entry adds only asset preloads.');
  // The static first paint uses .ap-account-story, which AccountPilot's stylesheet defines: it must be linked in the head, or the shell paints unstyled.
  assert.match(added, /<link rel="stylesheet" href="\/assets\/AccountPilot-[^"]+\.css"\/>/, 'Account entry must link the stylesheet that styles its first paint (.ap-account-story).');
  assert.match(added, /<link rel="modulepreload" href="\/assets\/Auth-[^"]+\.js"\/>/, 'Account entry must preload the Auth chunk.');
  assert.ok(entryShell === null || entryShell === text, '/onboarding and /auth share one shell.');
  entryShell = text;
}
for (const path of ['/admin', '/admin2', '/admin2/ops?days=7', '/admin/users', '/ADMIN2', '/marketing-admin']) {
  const response = await request(path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
}
assert.equal((await request('/')).headers.get('X-Robots-Tag'), null, 'Public marketing remains indexable.');
const decodedBeforePages=worker.decodedAssets;
for(const page of publicRender.pages){
  const response=await request(page.path),html=await response.text();
  assert.equal(response.status,200);checkHeaders(response);
  assert.equal(response.headers.get('Cache-Control'),'no-cache');
  assert.ok(html.includes('<h1'),'Initial HTML must have a visible page heading.');
  if(page.kind==='check')assert.ok(html.includes('name="robots" content="noindex,follow"')&&!html.includes('rel="canonical"'),'The guest-redirected /check page is noindex with no competing canonical.');
  else assert.ok(html.includes(`href="https://jobvance.io${page.path}"`),'Each initial page needs its canonical URL.');
  assert.ok(html.includes(page.title.replaceAll('&','&amp;')),'Each public page needs its own title.');
  assert.equal(response.headers.get('X-Robots-Tag'),null);
  if(page.path==='/') assert.ok(!/href="\/check\?audience=/.test(html),'Examples must not select a persona for a neutral visitor.');
  if(page.path==='/pricing') {
    // The product name sits in a no-break span, so compare the visible text rather than the raw markup.
    assert.ok(html.replace(/<[^>]*>/g,'').replaceAll('<!-- -->','').includes('Choose how often your Automated Job Loop runs. Plans from $29/month, with a free account to start.'));
    // React inserts this exact empty comment between adjacent text nodes ($ and price).
    // Normalize only that separator; require each price inside its actual visible card.
    const pricingHtml = html.replaceAll('<!-- -->', '');
    for(const price of [9,19,39])assert.ok(pricingHtml.includes(`<span class="pricing-amount">$${price}</span><span class="pricing-unit">One-time`),'The public offer must show each one-time pass price in its card.');
    assert.ok(!/\$15|Checkout not available|proposed price/.test(html),'The public offer must not contain unavailable or legacy purchases.');
    for (const text of ['Automated Job Loop monthly plans', 'billed every month until you cancel', 'No trial or subscription starts automatically', 'USD / month', 'Tax is included in the quoted monthly total', 'Existing subscriptions keep their original price and currency', 'Billing country or region', 'Payment currency']) {
      assert.ok(pricingHtml.includes(text), `Pricing must explain the actual monthly billing contract: ${text}`);
    }
    for (const price of [29, 59, 99]) {
      assert.ok(pricingHtml.includes(`<span class="pricing-amount">$${price}</span><span class="pricing-unit">USD / month</span>`), `Monthly card must display $${price} USD per month.`);
    }
    assert.ok(!/<form\b/i.test(html), 'The public pricing page must not collect purchase details.');
    const monthlySection = html.match(/<section\b[^>]*aria-labelledby="loop-monthly-plans-title"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(monthlySection, 'Monthly plans must remain in their own visible section.');
    for (const plan of ['weekly','active','daily']) assert.ok(monthlySection.includes(`/auth?next=%2Fpricing%3FloopPlan%3D${plan}%26country%3DUS%26currency%3DUSD`), 'Signed-out monthly choices must retain the exact selected plan, country and currency through account entry.');
    for (const currency of ['USD','EUR','GBP','INR','AED','CAD','AUD','SGD','JPY']) assert.ok(monthlySection.includes(`value="${currency}"`), `The public currency selector must include ${currency}.`);
    assert.ok(!/(?:href|action)="[^"]*(?:checkout\.dodopayments|test\.checkout\.dodopayments|checkout\.paddle|buy\.stripe)/i.test(monthlySection), 'Public HTML must not bypass authenticated billing with a provider checkout link.');
  }
  if(page.path==='/check') {
    assert.ok(html.includes('CV Check, in your Jobvance account.'),'The initial check page must explain its account requirement before JavaScript/auth resolves.');
    assert.ok(html.includes('Compare your CV with a job, review tailored wording and download your approved version.'),'The account entry must describe review and approval before download.');
    assert.ok(html.includes('href="/auth?mode=signup&amp;next=%2Fcheck"'),'Creating an account must retain the exact check destination.');
    assert.ok(html.includes('href="/auth?next=%2Fcheck"'),'Existing accounts must have a sign-in return to the check.');
    assert.ok(!/<textarea\b|<input\b[^>]*type="file"/i.test(html),'Public pre-authentication HTML must not expose CV-source entry controls.');
    assert.ok(!/no account needed|saving to an account is optional|without an account/i.test(html),'Public CV Check must not advertise a guest product.');
  }
  if(page.kind==='guide'){assert.ok(!html.includes('We could not find that guide.'));assert.ok(html.includes('BlogPosting'));assert.ok(html.includes('Sources and further reading'));}
  for(const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    JSON.parse(match[1]);
    const {createHash}=await import('node:crypto');
    assert.ok(response.headers.get('Content-Security-Policy').includes(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`),'Actual structured text must be permitted by its exact CSP hash.');
  }
}
const pageDecodes=worker.decodedAssets-decodedBeforePages;
for(const path of ['/guides/no-such-article','/no-such-product','/unknown/deep/route'])assert.equal((await request(path)).status,404,'Unknown routes must not masquerade as successful pages.');
for(const [path,target] of [['/blog','/guides'],['/jobs','/job-loop'],['/product','/job-loop'],['/guides/','/guides']]){const response=await request(path);assert.equal(response.status,308);assert.equal(response.headers.get('Location'),target);}
for (const path of ['/pilot','/pilot/','/pilot?utm_source=review','/pilot/?utm_source=review']) {
  for (const method of ['GET','HEAD']) {
    const response=await request(path,{method});
    assert.equal(response.status,308,`Retired entry ${path} must redirect permanently.`);
    assert.equal(response.headers.get('Location'),'/job-loop','Keep the existing alias policy: redirect to the configured target without carrying query data.');
    if(method==='HEAD') assert.equal(await response.text(),'');
  }
}
const sitemap=await (await request('/sitemap.xml')).text();
assert.equal((sitemap.match(/<url>/g)??[]).length,publicRender.pages.filter(page=>page.kind!=='check').length);
assert.ok(!sitemap.includes('https://jobvance.io/pilot'));
assert.ok(!publicRender.pages.some(page=>page.path==='/pilot'));
const home=await (await request('/')).text();
const homeGuides=[...new Set([...home.matchAll(/href="(\/guides\/[^"?#]+)"/g)].map(match=>match[1]))];
assert.equal(homeGuides.length,6,'Six article links must be in the actual initial HTML.');
for(const path of homeGuides) assert.ok(publicRender.pages.some(page=>page.path===path&&page.kind==='guide'),'Every linked article must actually render.');
for(const path of ['/for-students','/for-mba','/for-career-switchers']) assert.ok(home.includes(`href="${path}"`),'Existing audience guidance must be reachable from home.');
const key='74fd2bde8727baaf27cf4f939db81717';
const keyResponse=await request(`/${key}.txt`);
assert.equal(keyResponse.status,200);assert.match(keyResponse.headers.get('Content-Type'),/^text\/plain; charset=utf-8$/);
assert.equal(await keyResponse.text(),key,'The public IndexNow file must contain the exact key, not SPA HTML.');

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
assert.equal(worker.decodedAssets, 1 + 1 + pageDecodes + 3 + cases.length, 'ETag and HEAD requests must not decode additional assets; sitemap and IndexNow key each decode once.');
globalThis.atob = nativeAtob;
console.log(JSON.stringify({ result: 'passed', publicPages:publicRender.pages.length, guideArticles:publicRender.pages.filter(page=>page.kind==='guide').length, checks: ['security-headers-and-jsonld-hashes','private-client-routes','rendered-public-content','canonical-redirects','real-notfound-status','asset-bytes-and-mime','etag-and-cache','head','missing-and-private-paths','unsafe-methods','project-identity','compressed-size'], compressedBytes }));
