// Writes public/favicon.svg and public/icon-mono.svg from the master geometry in src/lib/brand-mark.ts.
// Run: node scripts/generate-brand-svgs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'src/lib/brand-mark.ts'), 'utf8');
const pick = (pattern) => source.match(pattern)[1];
const transform = pick(/transform: '([^']+)'/);
const hook = pick(/hook: '([^']+)'/);
const bar = pick(/bar: '([^']+)'/);
const extra = Number(pick(/knockoutExtra: ([0-9.]+)/));
const [cx, cy] = [Number(pick(/cx: (\d+)/)), Number(pick(/cy: (\d+)/))];
const small = { stroke: Number(pick(/small: \{ stroke: ([0-9.]+)/)), r: Number(pick(/small: \{ stroke: [0-9.]+, dotRadius: ([0-9.]+)/)) };
const large = { stroke: Number(pick(/large: \{ stroke: ([0-9.]+)/)), r: Number(pick(/large: \{ stroke: [0-9.]+, dotRadius: ([0-9.]+)/)) };

const glyph = (variant, stroke, ring, dot) => `<g transform="${transform}" fill="none" stroke="${stroke}" stroke-width="${variant.stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${hook}"/><path d="${bar}"/>${ring ? `<circle cx="${cx}" cy="${cy}" r="${Number((variant.r + extra).toFixed(2))}" fill="${ring}" stroke="none"/>` : ''}<circle cx="${cx}" cy="${cy}" r="${variant.r}" fill="${dot}" stroke="none"/></g>`;

writeFileSync(resolve(root, 'public/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#215C43"/>${glyph(small, '#E2EEAF', '#215C43', '#D4F25A')}</svg>\n`);
writeFileSync(resolve(root, 'public/icon-mono.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${glyph(small, '#000', null, '#000')}</svg>\n`);
console.log('brand svgs written');
void large;
