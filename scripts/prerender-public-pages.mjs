import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { publicPages, clientOnlyPaths, routeRedirects, SITE_ORIGIN } from '../src/lib/public-route-manifest.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
const template=await readFile(resolve(dist,'index.html'),'utf8');
const buildManifest=JSON.parse(await readFile(resolve(dist,'.vite/manifest.json'),'utf8'));
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const hash=value=>createHash('sha256').update(value).digest('base64');
const cssFor=kind=>kind==='guide'||kind==='guides'?'src/pages/CareerGuides.tsx':kind==='loop-overview'?'src/pages/JobLoopOverview.tsx':kind==='help'?'src/pages/HelpCenter.tsx':kind==='walkthroughs'?'src/pages/Walkthroughs.tsx':kind==='audience'?'src/pages/AudienceLanding.tsx':kind==='check'?'src/pages/CvCheck.tsx':kind==='landing'?'src/pages/CvCheckLanding.tsx':kind==='pilot'?'src/pages/PilotLanding.tsx':'src/main.tsx';
const pages=[],scriptHashes=new Set();
await mkdir(resolve(dist,'.prerender'),{recursive:true});
const server=await createServer({root,mode:'production',cacheDir:resolve(root,'.sites-runtime/prerender-vite-cache'),server:{middlewareMode:true,watch:null,hmr:false},ssr:{noExternal:['react-helmet-async']},appType:'custom'});
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Public prerender must not contact a customer or external service.');};
try {
  const {renderPublicRoute,structuredNodesFor}=await server.ssrLoadModule('/scripts/public-render-entry.tsx');
  const {careerGuides}=await server.ssrLoadModule('/src/lib/career-guides.ts');
  const articleNode=(page,canonical,organization)=>{const guide=careerGuides.find(item=>item.slug===page.key);return guide?[{'@type':'Article',headline:guide.title,datePublished:guide.publishedAt,dateModified:guide.updatedAt,author:{'@id':organization['@id']}}]:[];};
  for(const page of publicPages){
    const rendered=renderPublicRoute(page.path);
    if(!rendered.body.includes('<h1'))throw new Error(`Public route has no visible main heading: ${page.path}`);
    if(page.kind==='guide' && (rendered.body.includes('We could not find that guide.') || !rendered.body.includes(page.title.replace(/\s*\|\s*Jobvance$/,''))))throw new Error(`Article did not render its actual route content: ${page.path}`);
    const canonical=SITE_ORIGIN+page.path;
    const organization={'@type':'Organization','@id':SITE_ORIGIN+'/#organization',name:'Jobvance',url:SITE_ORIGIN,logo:SITE_ORIGIN+'/icon-512.png'};
    const graph={'@context':'https://schema.org','@graph':[organization,{'@type':'WebSite','@id':SITE_ORIGIN+'/#website',name:'Jobvance',url:SITE_ORIGIN,publisher:{'@id':organization['@id']}},{'@type':page.kind==='guides'?'CollectionPage':'WebPage','@id':canonical+'#page',url:canonical,name:page.title,description:page.description,isPartOf:{'@id':SITE_ORIGIN+'/#website'}},...structuredNodesFor(page.path,SITE_ORIGIN),...(page.kind==='guide'?articleNode(page,canonical,organization):[]),...(page.path!=='/'?[{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Jobvance',item:SITE_ORIGIN},{'@type':'ListItem',position:2,name:page.title.replace(/\s*\|\s*Jobvance$/,''),item:canonical}]}]:[])]};
    const structured=rendered.scripts+`<script type="application/ld+json">${json(graph)}</script>`;
    for(const match of structured.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))scriptHashes.add(`'sha256-${hash(match[1])}'`);
    const entry=buildManifest[cssFor(page.kind)];
    const css=[...new Set(entry?.css??[])].map(path=>`<link rel="stylesheet" href="/${escape(path)}"/>`).join('');
    // The route chunk downloads in parallel with the entry script instead of after it.
    const preloads=[...new Set(entry?[entry.file,...(entry.imports??[]).map(key=>buildManifest[key]?.file)].filter(Boolean):[])].map(path=>`<link rel="modulepreload" fetchpriority="low" href="/${escape(path)}"/>`).join('');
    const metadata=`<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"/>${page.kind==='check'?'<meta name="robots" content="noindex,follow"/>':`<link rel="canonical" href="${escape(canonical)}"/>`}<meta property="og:title" content="${escape(page.title)}"/><meta property="og:description" content="${escape(page.description)}"/><meta property="og:url" content="${escape(canonical)}"/><meta property="og:type" content="${page.kind==='guide'?'article':'website'}"/><meta name="twitter:title" content="${escape(page.title)}"/><meta name="twitter:description" content="${escape(page.description)}"/>`;
    // Helmet owns route text/canonical tags on the client; common image tags are
    // kept by the always-mounted SiteShareMetadata component across navigation.
    const managedMetadata=metadata.replace(/<(title|meta|link)(?=[\s>])/g,'<$1 data-rh="true"');
    const html=template.replace(/<title\b[^>]*>[\s\S]*?<\/title>/,'').replace(/<meta\b[^>]*\bname="description"[^>]*>/,'').replace(/<meta\b[^>]*\b(?:name|property)="(?:og|twitter):(?:title|description)"[^>]*>/g,'').replace(/<link rel="modulepreload"(?![^>]*fetchpriority)/g,'<link rel="modulepreload" fetchpriority="low"').replace('</head>',managedMetadata+css+preloads+structured+'</head>').replace('<div id="root"></div>',`<div id="root">${rendered.body}</div>`).replace(/<noscript>[\s\S]*?<\/noscript>/,'<noscript>These guides are available to read without JavaScript. Enable JavaScript for the interactive CV check, accounts and document preparation.</noscript>');
    const filename=hash(page.path).replace(/[^a-z\d]/gi,'').slice(0,24)+'.html';
    await writeFile(resolve(dist,'.prerender',filename),html);
    pages.push({path:page.path,file:`.prerender/${filename}`,title:page.title,kind:page.kind});
  }
  await writeFile(resolve(dist,'.prerender/manifest.json'),JSON.stringify({version:1,pages,clientOnlyPaths,redirects:routeRedirects,scriptHashes:[...scriptHashes]},null,2)+'\n');
} finally {globalThis.fetch=originalFetch;await server.close();}
console.log(JSON.stringify({publicPages:pages.length,guideArticles:pages.filter(page=>page.kind==='guide').length,structuredDataHashes:scriptHashes.size,externalRequests:0}));
