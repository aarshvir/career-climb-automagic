import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const robots = readFileSync(resolve(__dirname, '../../../public/robots.txt'), 'utf8');
const groups = robots.split(/\n\s*\n/).map(block => block.trim()).filter(block => /^User-agent:/im.test(block)).map(block => {
  const lines = block.split('\n').map(line => line.trim());
  return { agents: lines.filter(line => /^User-agent:/i.test(line)).map(line => line.replace(/^User-agent:\s*/i, '')), rules: lines.filter(line => /^(Allow|Disallow):/i.test(line)) };
});
const groupFor = (agent: string) => groups.find(group => group.agents.includes(agent));

describe('robots.txt names the search and assistant crawlers that should find Jobvance', () => {
  // Search and answer bots, user-triggered agents, and the assistants' crawlers. Named so the intent survives an edge setting that adds a blanket AI-bot block.
  const wanted = ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'Claude-SearchBot', 'Claude-User', 'ClaudeBot', 'PerplexityBot', 'Perplexity-User', 'Applebot', 'Google-Extended', 'Twitterbot', 'facebookexternalhit', '*'];

  it.each(wanted)('%s may crawl the public site and keeps the same private-route rules', agent => {
    const group = groupFor(agent);
    expect(group, agent).toBeDefined();
    expect(group!.rules).toContain('Allow: /');
    expect(group!.rules).toEqual(groupFor('*')!.rules);
  });

  it('keeps private routes disallowed and lists the sitemap once', () => {
    for (const path of ['/admin', '/loop', '/dashboard', '/auth']) expect(groupFor('*')!.rules).toContain(`Disallow: ${path}`);
    expect(robots.match(/^Sitemap:/gim)).toHaveLength(1);
    expect(robots).toContain('Sitemap: https://jobvance.io/sitemap.xml');
  });
});
