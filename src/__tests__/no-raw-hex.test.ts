import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The green system is token-driven: public and entry stylesheets use var(--jv-*) instead of raw hex, so greens cannot drift in hue.
// White and black (and tokens' own definitions in src/index.css) are the only literals allowed in these files.
const root = resolve(__dirname, '../..');
const files = ['src/pages/Workspace.css', 'src/pages/ApplicationsHome.css', 'src/components/marketing/HeroStage.css', 'src/pages/JobLoop.css', 'src/pages/CvCheck.css', 'src/styles/marketing.css', 'src/components/marketing/LoopOrbit.css', 'src/components/LoopJourney.css', 'src/components/marketing/BrandCards.css', 'src/pages/AccountPilot.css', 'src/pages/Home.css'];
const allowed = new Set(['#fff', '#ffffff', '#000', '#000000']);

describe('raw hex colours', () => {
  it.each(files)('%s has no off-token hex literals', file => {
    const css = readFileSync(resolve(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("data:[^"]*"\)/g, '');
    const found = (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map(hex => hex.toLowerCase()).filter(hex => !allowed.has(hex));
    expect(found).toEqual([]);
  });
});
