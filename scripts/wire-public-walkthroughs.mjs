import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {basename,resolve} from 'node:path';

// Lists reviewed walkthrough recordings in src/lib/walkthroughs.ts, with first-party media only:
//   node scripts/wire-public-walkthroughs.mjs --media-base https://jobvance.io/walkthroughs/media --tutorials job-loop-start,source-review [--dry-run]
// It refuses without one of the first-party media bases below, so it can no longer write a personal-account or other third-party
// media host into the public source (it used to build commit-pinned URLs on a personal GitHub account). It checks the local files
// against production-manifest.json; it does not check what the host serves, so host the exact files first and compare the served
// bytes with those hashes before merging the result. The three recordings of the retired six-step check are never listed.
// Reconcile presenterDisclosure below with the wording the page currently needs before listing anything.
const root=fileURLToPath(new URL('..',import.meta.url));
const flag=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const firstPartyBases=['https://jobvance.io/walkthroughs/media','https://www.jobvance.io/walkthroughs/media','https://gvftdfriujrkpptdueyb.supabase.co/storage/v1/object/public/walkthroughs'];
const base=(flag('--media-base')??'').replace(/\/+$/,'');
if(!firstPartyBases.includes(base))throw new Error(`Refusing to write the public walkthrough manifest: pass --media-base with one of ${firstPartyBases.join(' or ')}. No other media host is accepted.`);
const retired=new Set(['first-check','another-application','controls-and-recovery']);
const wanted=(flag('--tutorials')??'').split(',').map(id=>id.trim()).filter(Boolean);
if(!wanted.length||new Set(wanted).size!==wanted.length||wanted.some(id=>retired.has(id)))throw new Error('Name each recording to list with --tutorials; the retired six-step recordings cannot be listed.');
const produced=JSON.parse(await readFile(resolve(root,'docs/product-hardening/tutorial-assets/production-manifest.json'),'utf8'));
if(produced.videos.length!==5||produced.paidApiCalls!==0)throw new Error('The five verified free-production assets are required.');
if(wanted.some(id=>!produced.videos.some(video=>video.tutorialId===id)))throw new Error('A named recording is not in the production manifest.');
const videos=[];
for(const video of produced.videos.filter(video=>wanted.includes(video.tutorialId))){
  if(video.status!=='ready'||video.contentKind!=='screen_walkthrough'||video.usesFictionalData!==true)throw new Error('Only ready fictional walkthroughs are publishable.');
  for(const kind of ['video','captions','poster']){
    const file=video.files[kind];
    if(!/^docs\/product-hardening\/tutorial-assets\/videos\/[a-z\d-]+\.(mp4|vtt|jpg)$/.test(file.path))throw new Error('Media must stay inside the owned public tutorial folder.');
    const bytes=await readFile(resolve(root,file.path));
    if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Asset provenance mismatch:${video.tutorialId}/${kind}`);
  }
  const url=kind=>`${base}/${basename(video.files[kind].path)}`;
  videos.push({tutorialId:video.tutorialId,videoUrl:url('video'),captionUrl:url('captions'),posterUrl:url('poster'),durationSeconds:video.durationSeconds,verifiedAt:video.verifiedAt,usesFictionalData:true,contentKind:'screen_walkthrough',status:'ready',hasBurnedCaptions:true,presenterDisclosure:'Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Automated Job Loop demonstrations use a clearly labelled local simulation.',chapters:video.chapters.map(({id,title,startSeconds})=>({id,title,startSeconds}))});
}
const manifest=`export const publicWalkthroughVideoManifest: WalkthroughVideoManifest = ${JSON.stringify({version:1,videos},null,2)};`;
if(process.argv.includes('--dry-run')){console.log(manifest);process.exit(0);}
const file=resolve(root,'src/lib/walkthroughs.ts'), source=await readFile(file,'utf8');
const begin=source.indexOf('export const publicWalkthroughVideoManifest:'), end=source.indexOf('\n\nconst mediaOrigins',begin);
if(begin<0||end<begin)throw new Error('The public manifest declaration boundary was not found.');
await writeFile(file,source.slice(0,begin)+manifest+source.slice(end));
console.log(JSON.stringify({readyVideos:videos.length,mediaBase:base,paidCalls:0}));
