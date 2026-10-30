import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const commit=process.argv[process.argv.indexOf('--asset-commit')+1];
if(!/^[a-f\d]{40}$/.test(commit??''))throw new Error('Use the exact pushed40-character Git asset commit.');
execFileSync('git',['cat-file','-e',commit+'^{commit}'],{cwd:root});
const produced=JSON.parse(await readFile(resolve(root,'docs/product-hardening/tutorial-assets/production-manifest.json'),'utf8'));
if(produced.videos.length!==5||produced.paidApiCalls!==0)throw new Error('The five verified free-production assets are required.');
const videos=[];
for(const video of produced.videos){
  if(video.status!=='ready'||video.contentKind!=='screen_walkthrough'||video.usesFictionalData!==true)throw new Error('Only ready fictional walkthroughs are publishable.');
  for(const kind of ['video','captions','poster']){
    const file=video.files[kind];
    if(!/^docs\/product-hardening\/tutorial-assets\/videos\/[a-z\d-]+\.(mp4|vtt|jpg)$/.test(file.path))throw new Error('Media must stay inside the owned public tutorial folder.');
    const bytes=await readFile(resolve(root,file.path));
    const committed=execFileSync('git',['show',`${commit}:${file.path}`],{cwd:root,maxBuffer:20*1024*1024});
    const sha=value=>createHash('sha256').update(value).digest('hex');
    if(bytes.length!==file.bytes||sha(bytes)!==file.sha256||sha(committed)!==file.sha256)throw new Error(`Asset provenance mismatch:${video.tutorialId}/${kind}`);
  }
  const url=kind=>`https://raw.githubusercontent.com/aarshvir/career-climb-automagic/${commit}/${video.files[kind].path}`;
  videos.push({tutorialId:video.tutorialId,videoUrl:url('video'),captionUrl:url('captions'),posterUrl:url('poster'),durationSeconds:video.durationSeconds,verifiedAt:video.verifiedAt,usesFictionalData:true,contentKind:'screen_walkthrough',status:'ready',hasBurnedCaptions:true,presenterDisclosure:'Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Automated Job Loop demonstrations use a clearly labelled local simulation.',chapters:video.chapters.map(({id,title,startSeconds})=>({id,title,startSeconds}))});
}
const file=resolve(root,'src/lib/walkthroughs.ts'), source=await readFile(file,'utf8');
const begin=source.indexOf('export const publicWalkthroughVideoManifest:'), end=source.indexOf('\n\nconst mediaOrigins',begin);
if(begin<0||end<begin)throw new Error('The public manifest declaration boundary was not found.');
await writeFile(file,source.slice(0,begin)+`export const publicWalkthroughVideoManifest: WalkthroughVideoManifest = ${JSON.stringify({version:1,videos},null,2)};`+source.slice(end));
console.log(JSON.stringify({readyVideos:videos.length,immutableAssetCommit:commit,paidCalls:0}));
