// Writes the brand icon set from the master geometry in src/lib/brand-mark.ts.
//   node scripts/generate-brand-svgs.mjs            -> public/favicon.svg and public/icon-mono.svg (no browser needed)
//   node scripts/generate-brand-svgs.mjs --png      -> also public/icon-192.png, icon-512.png, icon-maskable-512.png,
//                                                     apple-touch-icon.png, icon-monochrome-512.png and favicon.ico
//                                                     (renders in Chrome through Playwright, a dev tool that is not a project dependency)
// Optical sizing: the "small" cut (heavier stroke) is for 32px and below (header mark, favicon.svg, 16 and 32px ico frames);
// the "large" cut is for everything 48px and up (192, 512, maskable, apple-touch, the 48px ico frame).
// After rendering PNGs run: python scripts/optimize-brand-pngs.py (keeps the Worker within its size limit).
// Safe zones: the maskable glyph stays inside 190px of a 512px square (the guaranteed 80% circle is 205px); the themed
// (monochrome) glyph stays inside 160px (the themed-icon crop is about 66%, 169px).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const pub = name => resolve(root, 'public', name);
const source = readFileSync(resolve(root, 'src/lib/brand-mark.ts'), 'utf8');
const pick = pattern => source.match(pattern)[1];
const transform = pick(/transform: '([^']+)'/);
const hook = pick(/hook: '([^']+)'/);
const bar = pick(/bar: '([^']+)'/);
const extra = Number(pick(/knockoutExtra: ([0-9.]+)/));
const [cx, cy] = [Number(pick(/cx: (\d+)/)), Number(pick(/cy: (\d+)/))];
const cut = name => ({ stroke: Number(pick(new RegExp(`${name}: \\{ stroke: ([0-9.]+)`))), r: Number(pick(new RegExp(`${name}: \\{ stroke: [0-9.]+, dotRadius: ([0-9.]+)`))) });
const small = cut('small');
const large = cut('large');

const TILE = '#215C43', GLYPH = '#E2EEAF', SIGNAL = '#D4F25A';
/** The tile's corner radius: 25% of the tile, the same value as .jv-brand-mark in marketing.css. */
const RX = 10;
const fit = scale => scale === 1 ? '' : ` transform="translate(20 20) scale(${scale}) translate(-20 -20)"`;
const strokes = `<path d="${hook}"/><path d="${bar}"/>`;
const group = (variant, stroke, inner) => `<g transform="${transform}" fill="none" stroke="${stroke}" stroke-width="${variant.stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const ring = variant => Number((variant.r + extra).toFixed(2));
/** Colour glyph: a tile-coloured ring under the signal dot so the dot reads as its own element. */
const glyph = (variant, scale = 1) => `<g${fit(scale)}>${group(variant, GLYPH, `${strokes}<circle cx="${cx}" cy="${cy}" r="${ring(variant)}" fill="${TILE}" stroke="none"/><circle cx="${cx}" cy="${cy}" r="${variant.r}" fill="${SIGNAL}" stroke="none"/>`)}</g>`;
const tile = (variant, { rx = RX, scale = 1 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="${rx}" fill="${TILE}"/>${glyph(variant, scale)}</svg>`;
/** Single-colour glyph: the ring is a real cut-out (a mask), so the dot keeps a transparent gap on any background. */
const MONO_SCALE = 0.64;
const mono = (variant = small, scale = MONO_SCALE) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><mask id="gap" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40"><rect width="40" height="40" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${ring(variant)}" fill="#000" transform="${transform}"/></mask></defs><g${fit(scale)}><g mask="url(#gap)">${group(variant, '#000', strokes)}</g>${group(variant, '#000', `<circle cx="${cx}" cy="${cy}" r="${variant.r}" fill="#000" stroke="none"/>`)}</g></svg>`;

/** The 16px frame is drawn on whole pixels, not resampled from the 40-unit geometry: a 3px stem (x 10-13), a 2px bar (y 2-4),
 * a hook of radius 3.5 centred on (8, 8) and a lime dot capping its end at (4.5, 8). No knockout ring at this size. */
const tile16 = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${TILE}"/><g fill="none" stroke="${GLYPH}"><path d="M8 3h5" stroke-width="2"/><path d="M11.5 3v5a3.5 3.5 0 0 1-7 0" stroke-width="3"/></g><circle cx="4.5" cy="8" r="1.75" fill="${SIGNAL}"/></svg>`;
writeFileSync(pub('favicon.svg'), tile(small) + '\n');
writeFileSync(pub('icon-mono.svg'), mono() + '\n');
console.log('brand svgs written');

if (process.argv.includes('--png')) {
  // PLAYWRIGHT_MODULE may point at an installed copy outside this project (for example the design-review tools).
  const specifier = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
  const { chromium } = await import(specifier);
  const MASKABLE_SCALE = 0.78;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const html = markup => `<!doctype html><html><body style="margin:0;background:transparent">${markup.replace('<svg ', '<svg width="100%" height="100%" style="display:block;position:fixed;inset:0" ')}</body></html>`;
  const render = async (markup, size, out, opaque = false) => {
    const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    await tab.setContent(html(markup));
    await tab.screenshot({ path: out, omitBackground: !opaque });
    await context.close();
  };
  await render(tile(large), 192, pub('icon-192.png'));
  await render(tile(large), 512, pub('icon-512.png'));
  await render(tile(large, { rx: 0, scale: MASKABLE_SCALE }), 512, pub('icon-maskable-512.png'), true);
  await render(tile(large, { rx: 0 }), 180, pub('apple-touch-icon.png'), true);
  await render(mono(), 512, pub('icon-monochrome-512.png'));
  // favicon.ico: 16 and 32 from the small cut, 48 from the large cut.
  const frames = [];
  for (const [size, variant] of [[16, small], [32, small], [48, large]]) {
    const out = resolve(root, `.tmp-fav${size}.png`);
    await render(size === 16 ? tile16() : tile(variant), size, out);
    if (size !== 48) writeFileSync(pub(`favicon-${size}.png`), readFileSync(out)); // linked directly, so browsers never pick a blurry ico frame
    frames.push({ w: size, data: readFileSync(out) });
    rmSync(out);
  }
  await browser.close();
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const directory = Buffer.concat(frames.map(frame => { const entry = Buffer.alloc(16); entry[0] = frame.w; entry[1] = frame.w; entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6); entry.writeUInt32LE(frame.data.length, 8); entry.writeUInt32LE(offset, 12); offset += frame.data.length; return entry; }));
  writeFileSync(pub('favicon.ico'), Buffer.concat([head, directory, ...frames.map(frame => frame.data)]));
  console.log('brand pngs and favicon.ico written');
}
