import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The public identity is Jobvance only: no personal GitHub username or personal-account media host in anything the site
 * serves or in the source it is built from. This does not promise complete anonymity (payment, email and hosting providers and
 * necessary business records can identify the business); it guards the public website output.
 *
 * The needles are built from parts so this file does not itself carry them. Failures name the file and the kind of string,
 * never the string.
 */
const needles = [
  { label: 'personal GitHub username', value: ['aar', 'shvir'].join('') },
  { label: 'personal-account media host', value: ['raw.github', 'usercontent.com'].join('') },
];

const root = resolve(__dirname, '../..');
const posix = (path: string) => path.split(sep).join('/');

/** Three admin and analytics migration tests seed the owner admin account the SQL migrations hard-code, so they cannot change
 * without a migration. They are source test fixtures only: nothing under src/__tests__ is bundled into the public site. */
const sourceFixtureExceptions = new Set([
  'src/__tests__/lib/jobvance-admin-dashboard-migration.test.ts',
  'src/__tests__/lib/jobvance-admin-migration.test.ts',
  'src/__tests__/lib/jobvance-analytics-migration.test.ts',
]);

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

/** Case-insensitive match over raw bytes, so text, minified bundles and binary assets are all covered. */
function leaksIn(bytes: Buffer): string[] {
  const text = bytes.toString('latin1').toLowerCase();
  return needles.filter(needle => text.includes(needle.value)).map(needle => needle.label);
}

function scan(paths: string[], isException: (relativePath: string) => boolean = () => false) {
  const found: string[] = [];
  let scanned = 0;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const file of statSync(path).isDirectory() ? files(path) : [path]) {
      const relativePath = posix(relative(root, file));
      if (isException(relativePath)) continue;
      scanned += 1;
      for (const label of leaksIn(readFileSync(file))) found.push(`${relativePath}: ${label}`);
    }
  }
  return { found, scanned };
}

describe('public output carries a Jobvance-only identity', () => {
  it('detects both identity strings in any case, in text or binary content', () => {
    for (const needle of needles) {
      expect(leaksIn(Buffer.from(`before ${needle.value} after`))).toEqual([needle.label]);
      expect(leaksIn(Buffer.from(`BEFORE ${needle.value.toUpperCase()} AFTER`))).toEqual([needle.label]);
      expect(leaksIn(Buffer.concat([Buffer.from([0, 255, 1]), Buffer.from(needle.value), Buffer.from([2, 0])]))).toEqual([needle.label]);
    }
    expect(leaksIn(Buffer.from('https://jobvance.io/walkthroughs/media/job-loop-start.mp4'))).toEqual([]);
  });

  it('keeps the personal GitHub username and media host out of source, public files, content and response headers', () => {
    const { found, scanned } = scan(
      ['src', 'public', 'content', 'index.html', 'vercel.json'].map(path => join(root, path)),
      relativePath => sourceFixtureExceptions.has(relativePath),
    );
    expect(scanned, 'the scan must actually read the source tree').toBeGreaterThan(500);
    expect(found).toEqual([]);
  });

  it('limits the source exceptions to the three owner-admin migration fixtures, which hold no media host', () => {
    for (const relativePath of sourceFixtureExceptions) {
      const content = readFileSync(join(root, relativePath)).toString('latin1').toLowerCase();
      expect(content.includes(needles[1].value), relativePath).toBe(false);
    }
  });

  it('keeps both strings out of the built bundles, HTML, assets, prerendered pages and Worker script', ({ skip }) => {
    const dist = join(root, 'dist');
    const built = existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'server', 'index.js')) && existsSync(join(dist, '.prerender', 'manifest.json'));
    if (!built) {
      // CI runs this file again after the build with the output required, so a missing build cannot pass silently there.
      if (process.env.PUBLIC_IDENTITY_REQUIRE_DIST === '1') throw new Error('The built public output (dist) is required for this check; run the build first.');
      skip();
    }
    const { found, scanned } = scan([dist]);
    expect(scanned, 'the scan must actually read the built output').toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});
