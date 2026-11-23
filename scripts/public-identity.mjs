// Public-output identity check that never stores the strings it looks for.
//
// The owner's GitHub handle and display name must not appear in the public site, but writing them into a check would publish
// them. So the committed file (public-identity-hashes.json) holds only SHA-256 hashes of lowercase phrases. This module turns
// any text into lowercase alphanumeric tokens, hashes every window of one to four adjacent tokens (joined by a space, and
// joined with nothing so camelCase and run-together forms match), and reports the label of any hash it knows.
//
// Plain limits, stated up front:
//  - A hash of a short name is easy to brute-force: anyone can hash a list of names and compare. The hashes keep the check from
//    publishing the strings; they do not hide them from someone determined. The owner's handle is already public in any case.
//  - Matching is on whole tokens. A handle glued to other letters or digits with no separator or case change (for example
//    "xzephyrquill77x") is not found, and nor is any string inside a token longer than MAX_JOINED characters.
//  - It catches the handle and the listed name forms, not every possible way to refer to a person.
//
// A `strict` entry is one whole word (a standalone first name). It matches only as a complete token, in any case and beside
// any punctuation, including a possessive ("name's", straight or curly apostrophe, which tokenise as the name plus "s"). It
// does not match inside a longer word ("name" in "namesake", "xname", "name2") and not across a camelCase join or as part of a
// run-together phrase, so it cannot fire on unrelated words. Multi-word names and the handle keep the looser forms above.
//
// `starts` holds only the first 16 bits of the hash of each phrase's first token. It is a speed filter (a window is hashed in
// full only if its first token passes) and, at 16 bits, confirms nothing about any guessed name.
//
// Usage:
//   node scripts/public-identity.mjs hash "label=phrase" ["strict:label=word" ...] print hash entries for new phrases
//   node scripts/public-identity.mjs scan <path> [<path> ...]                   scan files or folders with the committed hashes
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WINDOW_TOKENS = 4;
export const MAX_JOINED = 48;
// A test runner can present import.meta.url as a non-file URL; fall back to the repository's scripts folder from the working directory.
const here = (() => { try { return fileURLToPath(new URL('.', import.meta.url)); } catch { return join(process.cwd(), 'scripts'); } })();
export const hashesFile = join(here, 'public-identity-hashes.json');

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const startOf = token => sha256(token).slice(0, 4);

/** Separators that carry a space in markup, URLs and code (entities, percent and unicode escapes, string escapes), made visible
 * before tokenising so an escape never glues itself to the word beside it. */
const spaceLike = /&nbsp;|&#160;|&#xa0;|%[0-9a-f]{2}|\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[nrtbfv]/gi;

/** Lowercase alphanumeric tokens. With `splitCase`, lower-to-upper changes ("ZephyrQuill") also start a new token. */
export function tokensOf(text, splitCase = false) {
  let value = text.replace(spaceLike, ' ');
  if (splitCase) value = value.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return value.toLowerCase().match(/[a-z\d]+/g) ?? [];
}

/** One committed entry for a label: the hashes of each phrase (spaced and run-together) and its first-token filter. A strict
 * entry takes one whole word per phrase and is matched only as a complete token. */
export function entryFor(label, phrases, { strict = false } = {}) {
  const hashes = new Set();
  const starts = new Set();
  for (const phrase of phrases) {
    const tokens = tokensOf(phrase);
    if (!tokens.length) throw new Error('A phrase needs at least one letter or digit.');
    if (strict && tokens.length !== 1) throw new Error('A strict entry is one whole word.');
    hashes.add(sha256(tokens.join(' ')));
    if (!strict) hashes.add(sha256(tokens.join('')));
    starts.add(startOf(tokens[0]));
  }
  return { label, ...(strict ? { strict: true } : {}), sha256: [...hashes].sort(), starts: [...starts].sort() };
}

/** Build the lookup from committed entries, or from synthetic entries in a test. The first entry wins when two labels share a hash. */
export function lookupFrom(entries) {
  const labels = new Map();
  const strict = new Set();
  const starts = new Set();
  for (const entry of entries) {
    for (const hash of entry.sha256) if (!labels.has(hash)) { labels.set(hash, entry.label); if (entry.strict) strict.add(hash); }
    for (const start of entry.starts) starts.add(start);
  }
  return { labels, strict, starts };
}

export function committedEntries() {
  const file = JSON.parse(readFileSync(hashesFile, 'utf8'));
  if (file.version !== 1 || !Array.isArray(file.entries) || file.entries.length < 2 || file.entries.some(entry => !entry.label || !entry.sha256?.length || !entry.starts?.length)) throw new Error('The committed identity hashes are missing or malformed.');
  return file.entries;
}

export const committedLookup = () => lookupFrom(committedEntries());

/** Labels of every known identity string found in `text`. Text that contains markup is also read with the tags replaced by a space
 * and with them removed, so words split by tags (or by a tag inside a word) still join. */
export function findIdentityLabels(text, lookup) {
  const found = new Set();
  const startCache = new Map();
  const hashCache = new Map();
  const mayStart = token => {
    let known = startCache.get(token);
    if (known === undefined) { known = lookup.starts.has(startOf(token)); startCache.set(token, known); }
    return known;
  };
  const labelOf = (phrase, size, splitCase) => {
    let hash = hashCache.get(phrase);
    if (hash === undefined) { hash = sha256(phrase); hashCache.set(phrase, hash); }
    const label = lookup.labels.get(hash);
    // A strict (single whole word) entry counts only as one real token, never from a camelCase split or a run-together window.
    return label !== undefined && lookup.strict.has(hash) && (size > 1 || splitCase) ? undefined : label;
  };
  const streams = text.includes('<') ? [text, text.replace(/<[^>]*>/g, ' '), text.replace(/<[^>]*>/g, '')] : [text];
  for (const stream of streams) {
    for (const splitCase of [false, true]) {
      const tokens = tokensOf(stream, splitCase);
      for (let start = 0; start < tokens.length; start++) {
        if (tokens[start].length > MAX_JOINED || !mayStart(tokens[start])) continue;
        let spaced = tokens[start];
        let joined = tokens[start];
        for (let size = 1; ; size++) {
          const label = labelOf(spaced, size, splitCase);
          if (label) found.add(label);
          if (size > 1) { const other = labelOf(joined, size, splitCase); if (other) found.add(other); }
          const next = tokens[start + size];
          if (size >= WINDOW_TOKENS || next === undefined || joined.length + next.length > MAX_JOINED) break;
          spaced += ` ${next}`;
          joined += next;
        }
      }
    }
  }
  return [...found];
}

function* filesUnder(path) {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) { yield path; return; }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) yield* filesUnder(child);
    else if (entry.isFile()) yield child;
  }
}

/** Scan files or folders; returns { found: ["path: label"], scanned } and never prints the matched text. */
export function scanPaths(paths, lookup, { isException = () => false, relativeTo = process.cwd() } = {}) {
  const found = [];
  let scanned = 0;
  for (const path of paths) {
    for (const file of filesUnder(path)) {
      const shown = relative(relativeTo, file).split(sep).join('/');
      if (isException(shown)) continue;
      scanned += 1;
      const text = readFileSync(file).toString('latin1');
      for (const label of findIdentityLabels(text, lookup)) found.push(`${shown}: ${label}`);
    }
  }
  return { found, scanned };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'hash') {
    const groups = new Map();
    for (const raw of args) {
      const strict = raw.startsWith('strict:');
      const arg = strict ? raw.slice('strict:'.length) : raw;
      const at = arg.indexOf('=');
      if (at < 1) throw new Error('Use label=phrase or strict:label=word.');
      const label = arg.slice(0, at);
      const group = groups.get(label) ?? { strict, phrases: [] };
      if (group.strict !== strict) throw new Error('A label is either strict or not.');
      group.phrases.push(arg.slice(at + 1));
      groups.set(label, group);
    }
    console.log(JSON.stringify([...groups].map(([label, group]) => entryFor(label, group.phrases, { strict: group.strict })), null, 2));
  } else if (command === 'scan' && args.length) {
    const { found, scanned } = scanPaths(args, committedLookup());
    console.log(JSON.stringify({ scanned, matches: found }, null, 2));
    process.exitCode = found.length ? 1 : 0;
  } else {
    console.error('Usage: public-identity.mjs hash "label=phrase" "strict:label=word" ... | scan <path> ...');
    process.exitCode = 2;
  }
}
