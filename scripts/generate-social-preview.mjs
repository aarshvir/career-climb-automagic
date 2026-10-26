// Regenerates the sharing card (public/og-job-loop-account.png, byte-identical copy at og-jobvance.png)
// from scripts/social-preview.html, then palette-quantises it with Python PIL to stay under ~45 KB.
// Needs a Playwright install: PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/generate-social-preview.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(resolve(root, 'scripts/social-preview.html')).href);
await page.evaluate(() => document.fonts.ready);
const target = resolve(root, 'public/og-job-loop-account.png');
await page.screenshot({ path: target });
await browser.close();
execFileSync('python', ['-c', 'import sys;from PIL import Image;i=Image.open(sys.argv[1]).convert("RGB").quantize(colors=128,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE);i.save(sys.argv[1],optimize=True)', target]);
copyFileSync(target, resolve(root, 'public/og-jobvance.png'));
console.log(`og-job-loop-account.png / og-jobvance.png: 1200x630, ${statSync(target).size} bytes`);
