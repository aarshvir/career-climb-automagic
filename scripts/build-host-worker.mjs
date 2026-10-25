import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const maxCompressedBytes = 3 * 1024 * 1024;
const manifest = JSON.parse(await readFile(join(root, '.openai/hosting.json'), 'utf8'));
if (typeof manifest.project_id !== 'string' || !manifest.project_id) throw new Error('The existing Site project ID is required.');
if ('static' in manifest) throw new Error('Worker publication requires static to be omitted from .openai/hosting.json.');
const hosting = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const rules = hosting.headers.find(rule => rule.source === '/(.*)')?.headers;
if (!Array.isArray(rules)) throw new Error('The existing security response headers are required.');
const security = Object.fromEntries(rules.map(({ key, value }) => [key, value]));
const publicRender = JSON.parse(await readFile(join(dist, '.prerender/manifest.json'), 'utf8'));
if (publicRender.version !== 1 || !Array.isArray(publicRender.pages) || publicRender.pages.length < 20) throw new Error('The public route rendering manifest is required.');
const structuredHashes = publicRender.scriptHashes;
if (!Array.isArray(structuredHashes) || structuredHashes.some(value => !/^'sha256-[a-zA-Z\d+/]{43}='$/.test(value))) throw new Error('Only verified structured-data script hashes can be added to CSP.');
security['Content-Security-Policy'] = security['Content-Security-Policy'].replace(/script-src ([^;]+)/, (_match, policy) => `script-src ${policy} ${structuredHashes.join(' ')}`);
for (const name of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy']) {
  if (!security[name]) throw new Error(`Missing security response header: ${name}`);
}
new Headers(security); // Reject invalid response-header definitions before publishing.

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};
const privateRoots = new Set(['server', 'src', 'scripts', 'docs', 'supabase', 'node_modules', 'api', 'functions']);
const assets = {};
const assetRoots = new Set();
let totalAssetBytes = 0;
async function collect(directory, prefix = '') {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.map')) continue;
    if (!prefix && privateRoots.has(entry.name.toLowerCase())) continue;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not permitted in the public build output.');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { await collect(join(directory, entry.name), relative); continue; }
    if (!entry.isFile()) throw new Error('Unexpected file type in the public build output.');
    const bytes = await readFile(join(directory, entry.name));
    const path = `/${relative}`;
    if (prefix) assetRoots.add(relative.split('/')[0]);
    const immutable = path.startsWith('/assets/') && /-[a-z\d_-]{8,}\.[a-z\d]+$/i.test(path);
    assets[path] = [mime[extname(entry.name).toLowerCase()] ?? 'application/octet-stream',
      `"${createHash('sha256').update(bytes).digest('hex')}"`, bytes.length, immutable, bytes.toString('base64')];
    totalAssetBytes += bytes.length;
  }
}
await collect(dist);
if (!assets['/index.html']) throw new Error('Run the frontend build before packaging its Worker.');
for (const page of publicRender.pages) {
  if (!/^\/[a-z\d/-]*$/.test(page.path) || !/^\.prerender\/[a-zA-Z\d]+\.html$/.test(page.file)) throw new Error('Public rendered paths must be bounded and canonical.');
  const bytes = await readFile(join(dist, page.file));
  assets[page.path] = [mime['.html'], `"${createHash('sha256').update(bytes).digest('hex')}"`, bytes.length, false, bytes.toString('base64')];
  totalAssetBytes += bytes.length;
}

// Generated Worker has no imports, dependencies, filesystem access or bindings.
// Binary decoding is lazy and shared within an isolate, never performed for the entire map per request.
const worker = `const SECURITY=${JSON.stringify(security)};
const ASSETS=${JSON.stringify(assets)};
const PRIVATE_ROOTS=new Set(${JSON.stringify([...privateRoots])});
const ASSET_ROOTS=new Set(${JSON.stringify([...assetRoots])});
const CLIENT_PATHS=new Set(${JSON.stringify(publicRender.clientOnlyPaths)});
const REDIRECTS=${JSON.stringify(publicRender.redirects)};
const PUBLIC_PATHS=new Set(${JSON.stringify(publicRender.pages.map(page=>page.path))});
const decoded=new Map();
function responseHeaders(request,path=new URL(request.url).pathname){
  const headers=new Headers(SECURITY);
  const root=(path.split('/')[1]||'').toLowerCase();
  if(root==='admin'||root==='admin2'||root==='auth'||CLIENT_PATHS.has(path))headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  return headers;
}
function reply(request,status,message,extra={}){
  const headers=responseHeaders(request);
  headers.set('Content-Type','text/plain; charset=utf-8');
  headers.set('Cache-Control','no-store');
  for(const [name,value] of Object.entries(extra))headers.set(name,value);
  headers.set('Content-Length',String(new TextEncoder().encode(message).length));
  return new Response(request.method==='HEAD'?null:message,{status,headers});
}
function publicPath(request){
  const pathname=new URL(request.url).pathname;
  if(/%2f|%5c/i.test(pathname))return null;
  let path;try{path=decodeURIComponent(pathname);}catch{return null;}
  if(/[\\\\%\\x00-\\x1f\\x7f]/.test(path))return null;
  const segments=path.split('/');
  if(segments.some(segment=>segment.startsWith('.')))return null;
  if(PRIVATE_ROOTS.has((segments[1]||'').toLowerCase()))return null;
  return path;
}
function bytesFor(path,asset){
  let bytes=decoded.get(path);
  if(!bytes){const binary=atob(asset[4]);bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);decoded.set(path,bytes);}
  return bytes;
}
export default {fetch(request){
  const url=new URL(request.url);
  if(url.hostname==='www.jobvance.io'){
    url.protocol='https:';url.host='jobvance.io';
    return reply(request,308,'Continue at Jobvance.io.',{Location:url.toString()});
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return reply(request,405,'Method not allowed.',{Allow:'GET, HEAD'});
  const path=publicPath(request);
  if(path===null)return reply(request,404,'Not found.');
  const withoutSlash=path.length>1?path.replace(/\\/+$/,''):path;
  if(path!==withoutSlash&&(PUBLIC_PATHS.has(withoutSlash)||CLIENT_PATHS.has(withoutSlash)))return reply(request,308,'Continue at the canonical address.',{Location:withoutSlash+url.search});
  if(REDIRECTS[withoutSlash])return reply(request,308,'Continue at the current page.',{Location:REDIRECTS[withoutSlash]});
  if(path.startsWith('/blog/')){const guide='/guides/'+path.slice(6);return reply(request,308,'Continue at the guide library.',{Location:PUBLIC_PATHS.has(guide)?guide:'/guides'});}
  let served=path,asset=ASSETS[path];
  if(!asset){
    const segments=path.split('/');
    if(ASSET_ROOTS.has(segments[1])||segments.some(segment=>segment.includes('.')))return reply(request,404,'Not found.');
    if(!CLIENT_PATHS.has(path)&&!['admin','admin2','auth'].includes((segments[1]||'').toLowerCase()))return reply(request,404,'This page is unavailable. Visit https://jobvance.io/help for the application workflow.');
    served='/index.html';asset=ASSETS[served];
  }
  const headers=responseHeaders(request,path);
  headers.set('Content-Type',asset[0]);
  headers.set('ETag',asset[1]);
  headers.set('Cache-Control',asset[0].startsWith('text/html')?'no-cache':asset[3]?'public, max-age=31536000, immutable':'public, max-age=3600, must-revalidate');
  const condition=request.headers.get('If-None-Match');
  if(condition&&condition.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\\//,'')===asset[1]))return new Response(null,{status:304,headers});
  headers.set('Content-Length',String(asset[2]));
  return new Response(request.method==='HEAD'?null:bytesFor(served,asset),{status:200,headers});
}};
`;
const workerBytes = Buffer.byteLength(worker);
const compressedBytes = gzipSync(worker, { level: 9 }).length;
if (compressedBytes >= maxCompressedBytes) throw new Error(`Worker exceeds the 3 MiB compressed script limit (${compressedBytes} bytes).`);
await mkdir(join(dist, 'server'), { recursive: true });
await mkdir(join(dist, '.openai'), { recursive: true });
await writeFile(join(dist, 'server/index.js'), worker);
await writeFile(join(dist, '.openai/hosting.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ assets: Object.keys(assets).length, staticBytes: totalAssetBytes, workerBytes, compressedBytes, compressedLimitBytes: maxCompressedBytes }));
