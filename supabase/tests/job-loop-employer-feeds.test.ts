// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_EMPLOYER_FEEDS, EMPLOYER_FEED_LIMITS, EMPLOYER_RETAINED_CHARACTER_BOUND, employerFeeds, employerFeedsConfig, readEmployerFeeds, type EmployerFeed } from '../functions/_shared/job-loop-providers.ts';
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
