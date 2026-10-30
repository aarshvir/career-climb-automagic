// Fails when any visible link or button with text has a text colour within about 3:1 of its own opaque background
// (the "white label on a white pill" class of bug that axe cannot see when specificity hides the real colour).
//
// Usage: node scripts/check-invisible-buttons.mjs [baseUrl] [comma-separated routes]
// Needs Playwright with a Chrome channel installed. Set PLAYWRIGHT_MODULE to a file URL if it is not resolvable from this repo.
const base = process.argv[2] ?? 'http://localhost:5199';
const routes = (process.argv[3] ?? '/,/job-loop,/how-it-works,/for-students,/for-mba,/for-career-switchers,/pricing,/faq,/about,/guides,/guides/student-projects-on-cv,/help,/walkthroughs,/contact,/privacy,/terms,/refund,/onboarding,/auth?mode=signup').split(',');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const MIN = 3;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.route(/facebook\.(net|com)|supabase\.co/, route => route.abort());
  for (const route of routes) {
    const page = await context.newPage();
    await page.goto(new URL(route, base).href, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const found = await page.evaluate(min => {
      const parse = value => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
      const lum = ({ r, g, b }) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const background = element => { for (let node = element; node; node = node.parentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a >= .98) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
      const out = [];
      for (const element of document.querySelectorAll('a, button, [role="button"]')) {
        const text = (element.textContent ?? '').trim();
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!text || box.width < 4 || box.height < 4 || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
        const color = parse(style.color), bg = background(element);
        if (!color) continue;
        const value = ratio({ ...color }, bg);
        if (value < min) out.push({ text: text.slice(0, 40), color: style.color, background: `rgb(${bg.r} ${bg.g} ${bg.b})`, ratio: Number(value.toFixed(2)) });
      }
      return out;
    }, MIN);
    for (const item of found) failures.push({ route, viewport: name, ...item });
    await page.close();
  }
  await context.close();
}
await browser.close();
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); console.error(`${failures.length} control(s) with unreadable text.`); process.exit(1); }
console.log(`No unreadable button or link text on ${routes.length} routes at 1440 and 390.`);
