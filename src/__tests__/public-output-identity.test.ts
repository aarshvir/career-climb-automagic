import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// The checker is plain Node so the same code runs from the command line (node scripts/public-identity.mjs scan dist).
import { committedEntries, entryFor, findIdentityLabels, lookupFrom, scanPaths } from '../../scripts/public-identity.mjs';

/**
 * The public identity is Jobvance only: no owner GitHub handle, owner display name or personal-account media host in anything the
 * site serves or in the source it is built from. This does not promise complete anonymity (payment, email and hosting providers
 * and necessary business records can identify the business); it guards the public website output.
 *
 * Neither the handle nor the display name is written anywhere in this repository. The committed file holds only SHA-256 hashes of
 * lowercase phrases (see scripts/public-identity.mjs for the method and its limits, including that hashes of short names can be
 * brute-forced). The regression below proves the check with an invented handle and name run through the same mechanism.
 * Failures name the file and the kind of string, never the string.
 */
const root = resolve(__dirname, '../..');
const realLookup = lookupFrom(committedEntries());

/** Three admin and analytics migration tests seed the owner admin account the SQL migrations hard-code, so they cannot change
 * without a migration. They are source test fixtures only: nothing under src/__tests__ is bundled into the public site. */
const sourceFixtureExceptions = new Set([
  'src/__tests__/lib/jobvance-admin-dashboard-migration.test.ts',
  'src/__tests__/lib/jobvance-admin-migration.test.ts',
  'src/__tests__/lib/jobvance-analytics-migration.test.ts',
]);

const temporary: string[] = [];
afterAll(() => { for (const path of temporary) rmSync(path, { recursive: true, force: true }); });
function writeTree(files: Record<string, string | Buffer>) {
  const base = mkdtempSync(join(tmpdir(), 'identity-'));
  temporary.push(base);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(base, name, '..'), { recursive: true });
    writeFileSync(join(base, name), content);
  }
  return base;
}

describe('the identity check proves itself on an invented handle and display name', () => {
  // Invented strings, run through the same hashing as the real ones. Nothing here refers to a real person.
  const handle = 'zephyrquill77';
  const name = 'Marisol Wavecrest';
  const host = 'files.invented-host.test';
  const synthetic = lookupFrom([entryFor('invented handle', [handle]), entryFor('invented display name', [name, 'Wavecrest Marisol'])]);
  const labels = (text: string) => findIdentityLabels(text, synthetic).sort();

  it('finds the handle in URLs, addresses, code and mixed case', () => {
    for (const text of [
      'https://github.com/zephyrquill77/site', 'mailto:zephyrquill77@example.com', '@ZephyrQuill77', 'ZEPHYRQUILL77',
      'const owner="zephyrQuill77";', 'zephyrquill77.example.dev', '"author":"Zephyrquill77"',
    ]) expect(labels(text), text).toEqual(['invented handle']);
  });

  it('finds a standalone display name in text, markup, JSON, entities, mixed case, run-together and reversed forms', () => {
    for (const text of [
      'Marisol Wavecrest', 'MARISOL WAVECREST', 'marisol wavecrest', 'Marisol   Wavecrest', 'Marisol&nbsp;Wavecrest', 'Marisol%20Wavecrest',
      '"name":"Marisol Wavecrest","@type":"Person"', 'MarisolWavecrest', 'marisolWavecrest', 'Wavecrest, Marisol', 'Wavecrest Marisol',
      'Founded by Marisol Wavecrest in Dubai', 'Marisol Wavecrest',
    ]) expect(labels(text), text).toContain('invented display name');
    expect(labels('<p><span>Marisol</span> <b>Wavecrest</b></p>')).toEqual(['invented display name']);
    expect(labels('<h1 class="x">Marisol</h1><h2>Wavecrest</h2>')).toEqual(['invented display name']);
  });

  it('does not flag clean output, a single word of the name, or other text', () => {
    for (const text of [
      '', 'Jobvance builds your career record.', '<h1>Marisol</h1> and Wavecrest Road', 'Marisol', 'Wavecrest', 'zephyr quill 77', 'zephyrquill', 'zephyrquill78',
      'const a=1;function f(){return "https://jobvance.io/walkthroughs"}', 'Marisol and the Wavecrest team',
    ]) expect(labels(text), text).toEqual([]);
  });

  it('does not use the real hashes for invented strings, or the invented hashes for real output', () => {
    expect(findIdentityLabels(`${handle} ${name}`, lookupFrom(committedEntries()))).toEqual([]);
    expect(findIdentityLabels('Jobvance https://jobvance.io', synthetic)).toEqual([]);
  });

  it('fails a built-output scan when any built file holds them, and passes clean output', () => {
    const leaky = writeTree({
      'index.html': '<!doctype html><html><body><p>Founder: <span>Marisol</span> <span>Wavecrest</span></p></body></html>',
      'assets/app-abc12345.js': `export const repo="https://github.com/${handle.toUpperCase()}/site";`,
      'assets/about.js': 'const n="MARISOL WAVECREST";',
      'assets/logo.png': Buffer.concat([Buffer.from([137, 80, 78, 71, 0, 255, 1]), Buffer.from(`Author\0${name}\0`), Buffer.from([0, 9, 200])]),
      'server/index.js': `const SECURITY={"Content-Security-Policy":"img-src 'self' https://${host}/${handle}/repo/"};`,
      'clean.js': 'export default function add(a,b){return a+b}',
    });
    const withHost = lookupFrom([entryFor('invented handle', [handle]), entryFor('invented display name', [name]), entryFor('invented media host', [host])]);
    const { found, scanned } = scanPaths([leaky], withHost, { relativeTo: leaky });
    expect(scanned).toBe(6);
    expect(found.sort()).toEqual([
      'assets/about.js: invented display name',
      'assets/app-abc12345.js: invented handle',
      'assets/logo.png: invented display name',
      'index.html: invented display name',
      'server/index.js: invented handle',
      'server/index.js: invented media host',
    ]);
    const clean = writeTree({ 'index.html': '<h1>Jobvance</h1><p>Marisol</p>', 'assets/app.js': 'export const a=1;', 'server/index.js': 'export default {}' });
    expect(scanPaths([clean], synthetic, { relativeTo: clean })).toEqual({ found: [], scanned: 3 });
  });
});

describe('a standalone first name is matched as a whole token only', () => {
  // An invented first name, run through the same strict hashing the committed first-name entry uses.
  const first = 'Marisol';
  const strictLookup = lookupFrom([entryFor('invented first name', [first], { strict: true })]);
  const hit = (text: string) => findIdentityLabels(text, strictLookup);

  it('matches the whole word in any case, with possessives, adjacent punctuation, escapes and tags', () => {
    for (const text of [
      'Marisol', 'marisol', 'MARISOL', 'mArIsOl', 'Hello Marisol and the team', 'Marisol.', 'Marisol,', '(Marisol)', '"Marisol"', 'Marisol: hello', 'by-Marisol', 'Marisol-Wavecrest', 'thanks, Marisol!',
      "Marisol's", 'Marisol\u2019s', 'Marisol\u2018s', "MARISOL'S", "marisol\u2019S", "Marisol' notes", 'Marisol&rsquo;s', 'Marisol&#8217;s', 'Marisol&apos;s', 'Marisol%E2%80%99s',
      '"Marisol\u2019s"', '"\u201cMarisol\u201d"', 'Hi\nMarisol', 'say\u00a0Marisol', 'Marisol&nbsp;here', '%0AMarisol',
      '<b>Marisol</b>', '<p class="x">Marisol</p>', "<span>Marisol</span>'s", '<h1>Hello <em>Marisol</em></h1>', 'Mari<wbr>sol', 'Mari<span>sol</span>', 'Mari<!-- -->sol', '{"name":"Marisol"}', 'name=Marisol&x=1', 'user_Marisol_2',
    ]) expect(hit(text), text).toEqual(['invented first name']);
  });

  it('does not match inside a longer word, with digits, or across a camelCase join or spaced-out letters', () => {
    for (const text of [
      'Marisolina', 'Marisols', 'Remarisol', 'xmarisol', 'marisolx', 'unmarisolable', 'Marisol2', '2Marisol', 'marisol99', 'Marisolve', 'amarisolb',
      'MarisolWave', 'wavecrestMarisol', 'XMarisol', 'MARISOLWAVE', 'Mari sol', 'Mari-sol', 'M a r i s o l', 'Mari\u00a0sol', 'Maris ol', 'marisol_x'.replace('_', ''),
      '', 'Jobvance builds your career record.', 'Wavecrest', 'Marisa', 'Marissol',
    ]) expect(hit(text), text).toEqual([]);
  });

  it('does not match a run-together phrase or a split of the word, in markup or not', () => {
    expect(hit('Mari Sol')).toEqual([]);
    expect(hit('<i>Mar</i><b>isolx</b>')).toEqual([]);
    expect(hit('Ma<span>risolx</span>')).toEqual([]);
  });

  it('combines with the display-name and handle entries, each under its own label', () => {
    const lookup = lookupFrom([entryFor('invented display name', ['Marisol Wavecrest']), entryFor('invented first name', [first], { strict: true })]);
    expect(findIdentityLabels('Marisol Wavecrest', lookup).sort()).toEqual(['invented display name', 'invented first name']);
    expect(findIdentityLabels('Wavecrest alone', lookup)).toEqual([]);
    expect(findIdentityLabels('MarisolWavecrest', lookup)).toEqual(['invented display name']);
    expect(findIdentityLabels('Hello Marisol', lookup)).toEqual(['invented first name']);
  });

  it('refuses to build a strict entry from more than one word', () => {
    expect(() => entryFor('invented', ['Marisol Wavecrest'], { strict: true })).toThrow(/one whole word/);
  });

  it('fails a built-output scan when a built file holds the first name, and passes clean output', () => {
    const leaky = writeTree({
      'index.html': '<!doctype html><html><body><p>Hello from <strong>Marisol</strong>\u2019s team</p></body></html>',
      'assets/app-abc12345.js': 'export const owner="Marisol\u2019s";',
      'assets/unrelated.js': 'export const a="Marisolina and remarisol";',
      'server/index.js': 'const m="MARISOL";',
    });
    expect(scanPaths([leaky], strictLookup, { relativeTo: leaky }).found.sort()).toEqual([
      'assets/app-abc12345.js: invented first name',
      'index.html: invented first name',
      'server/index.js: invented first name',
    ]);
    const clean = writeTree({ 'index.html': '<h1>Jobvance</h1><p>Marisolina</p>', 'assets/app.js': 'export const a=1;' });
    expect(scanPaths([clean], strictLookup, { relativeTo: clean })).toEqual({ found: [], scanned: 2 });
  });
});

describe('public output carries a Jobvance-only identity', () => {
  it('keeps the committed hashes free of the strings they stand for and in a usable shape', () => {
    const entries = committedEntries();
    expect(entries.map((entry: { label: string }) => entry.label)).toEqual(['personal GitHub username', 'personal display name', 'personal first name', 'personal-account media host']);
    // The standalone first name is a strict, single-word entry; the others are not.
    expect(entries.filter((entry: { strict?: boolean }) => entry.strict).map((entry: { label: string; sha256: string[] }) => [entry.label, entry.sha256.length])).toEqual([['personal first name', 1]]);
    for (const entry of entries) {
      expect(entry.sha256.length).toBeGreaterThan(0);
      for (const hash of entry.sha256) expect(hash).toMatch(/^[a-f\d]{64}$/);
      for (const start of entry.starts) expect(start).toMatch(/^[a-f\d]{4}$/);
    }
  });

  it('keeps the owner handle, display name and personal media host out of source, public files, content and response headers', () => {
    const { found, scanned } = scanPaths(
      ['src', 'public', 'content', 'index.html', 'vercel.json', 'scripts/wire-public-walkthroughs.mjs', 'scripts/public-identity.mjs', 'scripts/public-identity-hashes.json'].map(path => join(root, path)),
      realLookup,
      { relativeTo: root, isException: relativePath => sourceFixtureExceptions.has(relativePath) },
    );
    expect(scanned, 'the scan must actually read the source tree').toBeGreaterThan(500);
    expect(found).toEqual([]);
  });

  it('limits the source exceptions to the three owner-admin migration fixtures, which hold the handle only', () => {
    for (const relativePath of sourceFixtureExceptions) {
      expect(findIdentityLabels(readFileSync(join(root, relativePath)).toString('latin1'), realLookup), relativePath).toEqual(['personal GitHub username']);
    }
  });

  it('keeps all of them out of the built bundles, HTML, assets, prerendered pages and Worker script', ({ skip }) => {
    const dist = join(root, 'dist');
    const built = existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'server', 'index.js')) && existsSync(join(dist, '.prerender', 'manifest.json'));
    if (!built) {
      // CI runs this file again after the build with the output required, so a missing build cannot pass silently there.
      if (process.env.PUBLIC_IDENTITY_REQUIRE_DIST === '1') throw new Error('The built public output (dist) is required for this check; run the build first.');
      skip();
    }
    const { found, scanned } = scanPaths([dist], realLookup, { relativeTo: root });
    expect(scanned, 'the scan must actually read the built output').toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});
