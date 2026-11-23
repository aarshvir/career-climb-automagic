// LOCAL Deno replay of the staged employer-board reads. NOT hosted proof: it runs the product's own readEmployerFeeds
// (concurrency two, the unchanged matcher, the bounded retained results) over SAVED public responses on this machine.
// It calls no provider, touches no database and deploys nothing.
//
//   1. (optional) save the eight public responses once, GET only, at most 2 requests a second:
//        deno run --config=supabase/functions/job-loop-worker/deno.json --allow-net=boards-api.greenhouse.io,api.ashbyhq.com \
//          --allow-write=<dir> scripts/deno-feed-replay.ts --save <dir>
//   2. replay (run it in a FRESH process each time to include cold start; --allow-run only reads this process's peak memory):
//        deno run --config=supabase/functions/job-loop-worker/deno.json --allow-read=<dir> --allow-run=powershell,sh \
//          scripts/deno-feed-replay.ts <dir> [--warm=3] [--latency-ms=0]
//      It prints one JSON line. --latency-ms adds a simulated network wait per request (wall time only; CPU and memory are unaffected).
//
// The response files are `${provider}__${board}.json`, for the boards in DEFAULT_EMPLOYER_FEEDS.
import { DEFAULT_EMPLOYER_FEEDS, EMPLOYER_FEED_LIMITS, readEmployerFeed, readEmployerFeeds } from '../supabase/functions/_shared/job-loop-providers.ts';
import process from 'node:process';
import type { LoopProfileInput } from '../supabase/functions/_shared/job-loop-types.ts';

const mainStartedMs = performance.now(); // milliseconds since the process started: module graph load and compile are inside this number
const args = Deno.args;
const flag = (name: string, fallback: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dir = args.find(arg => !arg.startsWith('--') && arg !== undefined) ?? '';
const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;
const urlFor = (provider: string, board: string) => provider === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true` : `https://api.ashbyhq.com/posting-api/job-board/${board}`;

if (args.includes('--save')) {
  // Public documented GET endpoints only, no authentication, at most 2 requests a second.
  const target = args.find(arg => !arg.startsWith('--')) ?? '';
  for (const feed of DEFAULT_EMPLOYER_FEEDS) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const response = await fetch(urlFor(feed.provider, feed.board), { headers: { 'User-Agent': 'feed-replay/1.0 (public job-board endpoints; read-only)', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${feed.provider}:${feed.board} returned ${response.status}`);
    await Deno.writeFile(`${target}/${feed.provider}__${feed.board}.json`, new Uint8Array(await response.arrayBuffer()));
  }
  console.log(`saved ${DEFAULT_EMPLOYER_FEEDS.length} responses to ${target}`);
  Deno.exit(0);
}
if (!dir) throw new Error('Pass the directory of saved responses.');

const bodies = new Map<string, Uint8Array>();
for (const feed of DEFAULT_EMPLOYER_FEEDS) bodies.set(urlFor(feed.provider, feed.board), await Deno.readFile(`${dir}/${feed.provider}__${feed.board}.json`));
const totalBytes = [...bodies.values()].reduce((sum, body) => sum + body.length, 0);
const latencyMs = Number(flag('latency-ms', '0')), warmRuns = Number(flag('warm', '3'));
const base = { audience: 'professional', name: 'Replay', contactLine: '', languages: [], pageTarget: 1, discreetSearch: false, sourceText: 'Replay', excludedTerms: [], compensation: { currency: 'USD', period: 'annual', minimum: 0 } };
const profiles: Record<string, LoopProfileInput> = {
  'Software Engineer / US': { ...base, targetTitles: ['Software Engineer'], locations: ['US'], experienceYears: 4 } as unknown as LoopProfileInput,
  'Operations Manager / Dubai': { ...base, targetTitles: ['Operations Manager'], locations: ['Dubai'], experienceYears: 6 } as unknown as LoopProfileInput,
};
let sampledPeakRss = Deno.memoryUsage().rss;
const sampler = setInterval(() => { sampledPeakRss = Math.max(sampledPeakRss, Deno.memoryUsage().rss); }, 1);
// A fetcher over the saved bytes. It yields to the event loop (as a real network read would) so the sampler can run between reads.
const fetcher = async (url: unknown) => { await new Promise(resolve => setTimeout(resolve, latencyMs)); const body = bodies.get(String(url)); if (!body) throw new Error('unknown url'); return new Response(body.slice()); };
// --mode=staged (default): the staged eight boards through readEmployerFeeds at concurrency two (this change).
// --mode=current-six: the six boards of today's production code, all at once through Promise.allSettled, for comparison.
// --mode=six-pool: only the first six boards through readEmployerFeeds at concurrency two (separates the pool from the two added boards).
const mode = flag('mode', 'staged');
async function replay(profile: LoopProfileInput) {
  const cpu0 = process.cpuUsage(), t0 = performance.now();
  const results = mode === 'current-six'
    ? (await Promise.allSettled(DEFAULT_EMPLOYER_FEEDS.slice(0, 6).map(feed => readEmployerFeed(feed, fetcher as never, profile)))).map(result => result.status === 'fulfilled' ? { status: 'fulfilled' as const, value: result.value } : { status: 'rejected' as const })
    : await readEmployerFeeds(mode === 'six-pool' ? DEFAULT_EMPLOYER_FEEDS.slice(0, 6) : DEFAULT_EMPLOYER_FEEDS, fetcher as never, profile);
  const wallMs = performance.now() - t0, cpu = process.cpuUsage();
  let kept = 0, chars = 0, failed = 0;
  for (const result of results) { if (result.status === 'fulfilled') { kept += result.value.opportunities.length; chars += result.value.opportunities.reduce((sum, item) => sum + item.description.length, 0); } else failed++; }
  return { wallMs: Math.round(wallMs), cpuMs: Math.round((cpu.user - cpu0.user + cpu.system - cpu0.system) / 1000), retainedListings: kept, retainedDescriptionChars: chars, failedBoards: failed };
}

const rssAtStart = Deno.memoryUsage().rss;
const out: Record<string, unknown> = { scope: 'LOCAL Deno replay over saved responses; not hosted proof', deno: Deno.version.deno, v8: Deno.version.v8, platform: Deno.build.os, mode, concurrency: mode === 'current-six' ? 'all at once' : EMPLOYER_FEED_LIMITS.concurrency, boards: mode === 'current-six' || mode === 'six-pool' ? 6 : DEFAULT_EMPLOYER_FEEDS.length, savedResponseBytes: totalBytes, simulatedLatencyMsPerRequest: latencyMs, moduleLoadAndStartMs: Math.round(mainStartedMs) };
const names = Object.keys(profiles);
const first = await replay(profiles[names[0]]);
const processMs = Math.round(performance.now());
out.cold = { profile: names[0], ...first, wallFromProcessStartToFirstReplayDoneMs: processMs, rssAtStartMb: mb(rssAtStart), rssAfterFirstMb: mb(Deno.memoryUsage().rss), heapUsedAfterFirstMb: mb(Deno.memoryUsage().heapUsed) };
const warm: unknown[] = [];
for (const name of names) for (let i = 0; i < warmRuns; i++) warm.push({ profile: name, ...await replay(profiles[name]) });
out.warm = warm;
clearInterval(sampler);
out.sampledPeakRssMb = mb(sampledPeakRss);
// The operating system's own peak for this process: Linux VmHWM, Windows PeakWorkingSet64.
try {
  if (Deno.build.os === 'windows') {
    const run = await new Deno.Command('powershell', { args: ['-NoProfile', '-Command', `(Get-Process -Id ${Deno.pid}).PeakWorkingSet64`], stdout: 'piped' }).output();
    out.osPeakRssMb = mb(Number(new TextDecoder().decode(run.stdout).trim()));
  } else {
    const status = await Deno.readTextFile('/proc/self/status');
    out.osPeakRssMb = mb(Number(status.match(/VmHWM:\s+(\d+) kB/)?.[1] ?? 0) * 1024);
  }
} catch (error) { out.osPeakRssMb = `unavailable: ${(error as Error).name}`; }
out.endRssMb = mb(Deno.memoryUsage().rss);
// Response fingerprints, taken last so hashing does not disturb the measurements above.
const prints: Record<string, string> = {};
for (const feed of DEFAULT_EMPLOYER_FEEDS) {
  const bytes = bodies.get(urlFor(feed.provider, feed.board))!;
  prints[`${feed.provider}:${feed.board}`] = `${bytes.length} bytes sha256 ${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
out.responses = prints;
console.log(JSON.stringify(out));
