import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../styles/marketing.css'), 'utf8');
const tsx = readFileSync(resolve(__dirname, '../pages/AudienceLanding.tsx'), 'utf8');

describe('round 8 layout guards', () => {
  it('gives every child of an audience feature column its own subgrid row (heading and paragraph never share a row)', () => {
    const children = (tsx.match(/<ul className="jv-steps">([\s\S]*?)<\/ul>/)?.[1].match(/<li data-reveal>([\s\S]*?)<\/li>/)?.[1].match(/<(?:p|h2)\b/g) ?? []).length;
    expect(children).toBe(3);
    expect(css).toMatch(/\.audience-features \.jv-steps \{ grid-template-rows: auto auto 1fr; \}/);
    expect(css).toMatch(/\.audience-features \.jv-steps > li \{ grid-row: span 3; grid-template-rows: subgrid;/);
  });
  it('keeps the brand icon safe zones in the generator', () => {
    const generator = readFileSync(resolve(__dirname, '../../scripts/generate-brand-svgs.mjs'), 'utf8');
    expect(generator).toMatch(/MASKABLE_SCALE = 0\.78/);
    expect(generator).toMatch(/MONO_SCALE = 0\.64/);
  });
});
