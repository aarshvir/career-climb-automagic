// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_EMPLOYER_FEEDS, DISCOVERY_BUDGET, EMPLOYER_FEED_LIMITS, EMPLOYER_REQUEST_TIMEOUT_MS, EMPLOYER_RETAINED_CHARACTER_BOUND, SEARCH_REQUEST_TIMEOUT_MS, employerFeeds, employerFeedsConfig, readEmployerFeed, readEmployerFeeds, startDiscoveryBudget, type EmployerFeed } from '../functions/_shared/job-loop-providers.ts';
import type { LoopProfileInput } from '../functions/_shared/job-loop-types.ts';

const profile: LoopProfileInput = { audience:'professional', name:'Created candidate', contactLine:'', targetTitles:['Software Developer'],locations:['US'],experienceYears:4,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Created test experience only. Implemented software and reviewed product changes with a team.',excludedTerms:[],compensation:{currency:'USD',period:'annual',minimum:80000} };
const description = 'Software development and product collaboration. At least 3 years of experience required. Base salary USD 90,000–120,000 per year.';
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const row = (id: number, title = 'Software Engineer', content = description) => ({ id, title, absolute_url: `https://careers.example.com/jobs/${id}`, content, location: { name: 'San Francisco, California' } });
const board = (slug: string): EmployerFeed => ({ provider: 'greenhouse', board: slug, company: `Created ${slug}` });
const slugOf = (url: unknown) => String(url).match(/boards\/([^/]+)\/jobs/)?.[1] ?? '';
const override = (count: number) => JSON.stringify(Array.from({ length: count }, (_, i) => ({ provider: 'greenhouse', board: `board-${i}`, company: `Employer ${i}` })));
const asEnv = (value: string | undefined) => (key: string) => key === 'JOB_LOOP_EMPLOYER_FEEDS' ? value : undefined;

describe('default and configured employer boards (staged, capacity eight)', () => {
  it('keeps the original six first and unchanged, adds at most two, and stays valid, unique and within capacity', () => {
    expect(DEFAULT_EMPLOYER_FEEDS.slice(0, 6).map(feed => `${feed.provider}:${feed.board}`)).toEqual(['greenhouse:careem', 'greenhouse:gocardless', 'greenhouse:duolingo', 'greenhouse:toast', 'ashby:notion', 'ashby:zapier']);
    expect(DEFAULT_EMPLOYER_FEEDS.length).toBeLessThanOrEqual(8);
    expect(DEFAULT_EMPLOYER_FEEDS.length).toBeLessThanOrEqual(EMPLOYER_FEED_LIMITS.feeds);
    const keys = DEFAULT_EMPLOYER_FEEDS.map(feed => `${feed.provider}:${feed.board}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const feed of DEFAULT_EMPLOYER_FEEDS) {
      expect(['greenhouse', 'lever', 'ashby']).toContain(feed.provider);
      expect(feed.provider).not.toBe('lever'); // a Lever board can take three sequential 12 s reads; none is staged
      expect(feed.board).toMatch(/^[a-z0-9_-]{1,80}$/i);
      expect(feed.company?.trim().length).toBeGreaterThan(0);
    }
    expect(employerFeeds(() => undefined)).toEqual(DEFAULT_EMPLOYER_FEEDS.map(feed => ({ ...feed })));
  });
  it('accepts every supported override up to exactly eight boards', () => {
    for (const count of [1, 6, 8]) {
      const config = employerFeedsConfig(asEnv(override(count)));
      expect(config).toMatchObject({ problem: null });
      expect(config.feeds).toHaveLength(count);
      expect(employerFeeds(asEnv(override(count)))).toHaveLength(count);
    }
    expect(employerFeedsConfig(asEnv('[]'))).toEqual({ feeds: [], problem: null });
  });
  it('reports an oversized, unreadable or non-list override with its reason instead of silently looking like an empty list', () => {
    for (const count of [9, 16, 30, 60]) expect(employerFeedsConfig(asEnv(override(count)))).toEqual({ feeds: [], problem: 'too_many' });
    expect(employerFeedsConfig(asEnv('not json'))).toEqual({ feeds: [], problem: 'unreadable' });
    expect(employerFeedsConfig(asEnv('{"provider":"greenhouse"}'))).toEqual({ feeds: [], problem: 'not_a_list' });
    expect(employerFeeds(asEnv(override(9)))).toEqual([]); // the plain list API is unchanged for older callers
  });
  it('still drops unsafe, unknown and duplicate boards inside the supported size', () => {
    const feeds = employerFeedsConfig(asEnv(JSON.stringify([{ provider: 'ashby', board: 'created' }, { provider: 'ashby', board: 'created' }, { provider: 'ashby', board: '../private' }, { provider: 'unknown', board: 'created' }])));
    expect(feeds).toEqual({ feeds: [{ provider: 'ashby', board: 'created', company: '' }], problem: null });
  });
  it('pins the per-board read limits, the capacity and the concurrency bound', () => {
    expect(EMPLOYER_FEED_LIMITS).toMatchObject({ feeds: 8, bytes: 5000000, scanned: 1000, retained: 100, leverPages: 3, descriptionChars: 20000, concurrency: 2 });
    expect(EMPLOYER_RETAINED_CHARACTER_BOUND).toBe(16000000);
  });
});

describe('reading the configured boards in one run', () => {
  it('keeps result order, applies the unchanged role and location prefilter, and returns matching listings per board', async () => {
    const feeds = [board('one'), board('two'), board('three')];
    const fetcher = vi.fn(async (url: unknown) => json({ jobs: [row(slugOf(url).length, 'Software Engineer'), row(99, 'Nurse Manager')] }));
    const results = await readEmployerFeeds(feeds, fetcher, profile);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled') throw new Error('expected fulfilled');
      expect(result.value.total).toBe(2);
      expect(result.value.opportunities.map(item => item.title)).toEqual(['Software Engineer']);
      expect(result.value.opportunities[0].sourceKey.startsWith(`greenhouse:${feeds[index].board}:`)).toBe(true);
    }
  });
  it('isolates a dead, broken or invalid board, and keeps a failed read distinct from a successful read with no match', async () => {
    const feeds = [board('good-a'), board('dead'), board('broken'), board('invalid'), board('quiet')];
    const fetcher = vi.fn(async (url: unknown) => {
      const slug = slugOf(url);
      if (slug === 'dead') return new Response('not found', { status: 404 });
      if (slug === 'broken') throw new TypeError('network down');
      if (slug === 'invalid') return new Response('<html>not json</html>');
      if (slug === 'quiet') return json({ jobs: [row(2, 'Nurse Manager')] });
      return json({ jobs: [row(1)] });
    });
    const results = await readEmployerFeeds(feeds, fetcher, profile);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected', 'fulfilled']);
    expect(results[4]).toMatchObject({ status: 'fulfilled', value: { total: 1, opportunities: [] } });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('never has more boards in flight than the concurrency limit at the supported maximum, even when more is requested', async () => {
    const feeds = Array.from({ length: EMPLOYER_FEED_LIMITS.feeds }, (_, i) => board(`b${i}`));
    let inFlight = 0, peak = 0;
    const fetcher = vi.fn(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(resolve => setTimeout(resolve, 5)); inFlight--; return json({ jobs: [row(1)] }); });
    const results = await readEmployerFeeds(feeds, fetcher, profile, 50);
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(EMPLOYER_FEED_LIMITS.concurrency);
    expect(fetcher).toHaveBeenCalledTimes(EMPLOYER_FEED_LIMITS.feeds);
  });
  it('bounds what a run retains across all eight boards: 100 listings of at most 20,000 characters each per board', async () => {
    const long = (description + ' Collaborate with the product team on reviewed changes.').padEnd(19990, ' Software development collaboration.').slice(0, 19990);
    const feeds = Array.from({ length: EMPLOYER_FEED_LIMITS.feeds }, (_, i) => board(`big${i}`));
    const fetcher = vi.fn(async () => json({ jobs: Array.from({ length: 150 }, (_, n) => row(n + 1, 'Software Engineer', long)) }));
    const results = await readEmployerFeeds(feeds, fetcher, profile);
    let listings = 0, characters = 0;
    for (const result of results) {
      if (result.status !== 'fulfilled') throw new Error('expected fulfilled');
      expect(result.value.opportunities).toHaveLength(EMPLOYER_FEED_LIMITS.retained);
      expect(result.value.truncated).toBe(true);
      listings += result.value.opportunities.length;
      characters += result.value.opportunities.reduce((sum, item) => sum + item.description.length, 0);
    }
    expect(listings).toBe(EMPLOYER_FEED_LIMITS.feeds * EMPLOYER_FEED_LIMITS.retained);
    expect(characters).toBeLessThanOrEqual(EMPLOYER_RETAINED_CHARACTER_BOUND);
    // A description over the limit is dropped, never retained.
    const over = await readEmployerFeeds([board('over')], async () => json({ jobs: [row(1, 'Software Engineer', 'x '.repeat(10100))] }), profile);
    expect(over[0]).toMatchObject({ status: 'fulfilled', value: { opportunities: [] } });
  });
  it('returns an empty list for no boards and makes no request', async () => {
    const fetcher = vi.fn();
    expect(await readEmployerFeeds([], fetcher, profile)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('the overall discovery time budget (deterministic virtual time; a cap by design, not a hosted measurement)', () => {
  const realNow = Date.now.bind(Date); // the real clock, kept before any fake timers (used only to prove nothing waited in real time)
  const VIRTUAL_EPOCH = Date.UTC(2026, 10, 23, 0, 0, 0); // every fake clock below starts here; budgets and assertions are relative to it
  const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }); });
  const leverPage = () => Response.json(Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}`, text: 'Warehouse Operator', hostedUrl: `https://jobs.example.com/${i}`, descriptionPlain: 'Pick and pack orders at a fictional depot.', categories: { location: 'Austin, TX' } })));
  const lever = (slug: string): EmployerFeed => ({ provider: 'lever', board: slug, company: `Created ${slug}` });
  async function virtually<T>(work: Promise<T>): Promise<T> { let done = false; const tracked = work.finally(() => { done = true; }); for (let guard = 0; !done && guard < 6000; guard++) await vi.advanceTimersByTimeAsync(100); return tracked; }

  it('states the numbers and the margin: 110 s of phase time inside a 150 s Free worker lifetime and the unchanged 180 s lease', () => {
    expect(DISCOVERY_BUDGET).toEqual({ workerLifetimeMs: 150000, reserveMs: 40000, totalMs: 110000 });
    expect(DISCOVERY_BUDGET.totalMs).toBe(DISCOVERY_BUDGET.workerLifetimeMs - DISCOVERY_BUDGET.reserveMs);
    expect(DISCOVERY_BUDGET.workerLifetimeMs).toBeLessThan(180000);
    expect(EMPLOYER_REQUEST_TIMEOUT_MS).toBe(12000);
    expect(SEARCH_REQUEST_TIMEOUT_MS).toBe(15000);
    // Without the budget the supported worst case (eight Lever boards x three pages, two workers, each page at its 12 s timeout) is 144 s of board reads alone.
    expect((EMPLOYER_FEED_LIMITS.feeds * EMPLOYER_FEED_LIMITS.leverPages * EMPLOYER_REQUEST_TIMEOUT_MS) / EMPLOYER_FEED_LIMITS.concurrency).toBeGreaterThan(DISCOVERY_BUDGET.totalMs);
  });
  it('lets a request start only if its own timeout fits in the remaining time, and aborts at the end as a backstop', async () => {
    vi.useFakeTimers({ now: VIRTUAL_EPOCH });
    try {
      const budget = startDiscoveryBudget(30000);
      expect(budget.canStart(12000)).toBe(true);
      await vi.advanceTimersByTimeAsync(18000);
      expect(budget.remaining()).toBe(12000);
      expect(budget.canStart(12000)).toBe(true);
      expect(budget.canStart(15000)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(budget.canStart(12000)).toBe(false);
      expect(budget.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(12000);
      expect(budget.signal.aborted).toBe(true);
      expect(budget.remaining()).toBe(0);
      const disposed = startDiscoveryBudget(1000); disposed.dispose();
      await vi.advanceTimersByTimeAsync(5000);
      expect(disposed.signal.aborted).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('a late page: a Lever board stops before the page it cannot finish, keeps the pages it read, and says so', async () => {
    vi.useFakeTimers({ now: VIRTUAL_EPOCH });
    try {
      const budget = startDiscoveryBudget(30000);
      const fetcher = vi.fn(async () => { await wait(11900); return leverPage(); });
      const result = await virtually(readEmployerFeed(lever('late'), fetcher, profile, budget));
      expect(fetcher).toHaveBeenCalledTimes(2); // starts at 0 s and 11.9 s; at 23.8 s only 6.2 s remain, less than the 12 s page timeout
      expect(result).toMatchObject({ total: 200, truncated: true, timeLimited: true });
      budget.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('a board whose first request cannot finish is skipped (not read, not empty), and what was read before it is kept', async () => {
    vi.useFakeTimers({ now: VIRTUAL_EPOCH });
    try {
      const budget = startDiscoveryBudget(25000);
      const fetcher = vi.fn(async () => { await wait(9000); return leverPage(); });
      const results = await virtually(readEmployerFeeds([lever('a'), lever('b'), lever('c')], fetcher, profile, 1, budget));
      // One worker: board a reads pages at 0 s and 9 s (the third would start at 18 s with 7 s left, under the 12 s page timeout); board b cannot start with 7 s left.
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'skipped', 'skipped']);
      expect(results[0]).toMatchObject({ status: 'fulfilled', value: { timeLimited: true, total: 200 } });
      expect(fetcher).toHaveBeenCalledTimes(2);
      budget.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('the budget abort cancels a request that outlives it as skipped, without disturbing the other boards', async () => {
    const realStart = realNow();
    vi.useFakeTimers({ now: VIRTUAL_EPOCH });
    try {
      const budget = startDiscoveryBudget(20000);
      const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
        if (slugOf(url) === 'hangs') { await new Promise<void>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); }
        await wait(1000); return json({ jobs: [row(1)] });
      });
      const feeds = [board('a'), board('hangs'), board('c')];
      const results = await virtually(readEmployerFeeds(feeds, fetcher, profile, 2, budget));
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'skipped', 'fulfilled']);
      // Released by the budget's own abort in virtual time, not by the request's real 12 s timeout (which would take 12 real seconds).
      expect(realNow() - realStart).toBeLessThan(6000);
      budget.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('without a budget the earlier behavior is unchanged', async () => {
    const fetcher = vi.fn(async () => json({ jobs: [row(1)] }));
    expect((await readEmployerFeeds([board('x')], fetcher, profile)).map(result => result.status)).toEqual(['fulfilled']);
  });
});
