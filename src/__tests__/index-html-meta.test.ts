import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The static fallback metadata in index.html is what the signed-out sign-up route (and any page without its own
// metadata) serves before the client renders. It must stay inside the claims ledger: a run prepares at most two CVs,
// only for matching roles, and every CV waits for review.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const descriptions = [...html.matchAll(/<meta[^>]*(?:name="description"|property="og:description"|name="twitter:description")[^>]*content="([^"]*)"/g)].map(match => match[1]);

describe('index.html fallback metadata', () => {
  it('carries one description in all three places', () => {
    expect(descriptions).toHaveLength(3);
    expect(new Set(descriptions).size).toBe(1);
  });
  it('does not promise a CV for each job, vacancy or role', () => {
    for (const text of descriptions) {
      expect(text).not.toMatch(/\bfor each\b|\beach (?:job|vacancy|role)\b|\bevery (?:job|vacancy|role)\b|\bbest-matching\b|ready to download/i);
      expect(text).toMatch(/Automated Job Loop/);
      expect(text).toMatch(/matching-role CVs? for your review/);
      expect(text.length).toBeLessThanOrEqual(160);
    }
  });
});
