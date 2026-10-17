import type { LoopOpportunity, LoopProfileInput } from './job-loop-types.ts';
import { safePublicUrl } from './job-loop-providers.ts';
import { matchesDiscoveryTarget } from '../../../src/lib/employer-discovery.ts';

/** Merge exact source identities or canonical URLs only. Never infer that two
 * jobs are the same from employer/title, nor erase candidate application history.
 * A source that failed, omitted or capped a listing cannot establish expiry. */
export function reconcileDiscovery(profile: LoopProfileInput, known: LoopOpportunity[], found: LoopOpportunity[]) {
  const indexed = new Map(known.map(item => [item.sourceKey, item]));
  const byUrl = new Map<string, LoopOpportunity>();
  const bySource = new Map(known.map(item => [item.sourceKey, item]));
  // Deliberately reviewed manual descriptions take precedence over machine reads.
  for (const item of [...known].sort((a,b) => Number(b.source === 'manual') - Number(a.source === 'manual'))) {
    const url = safePublicUrl(item.url); if (url && !byUrl.has(url)) byUrl.set(url, item);
  }
  const updates = new Map<string, LoopOpportunity>(); const refreshedIds = new Set<string>();
  let added = 0; let deferred = 0; let duplicates = 0;
  const foundUrls = new Set<string>(); const foundSources = new Set<string>();
  const preferred = [...found].sort((a,b) => Number(b.source === 'employer_api') - Number(a.source === 'employer_api'));
  for (const item of preferred) {
    const url = safePublicUrl(item.url);
    if (!url || foundSources.has(item.sourceKey) || foundUrls.has(url)) { duplicates++; continue; }
    foundSources.add(item.sourceKey); foundUrls.add(url);
    const existing = byUrl.get(url) ?? bySource.get(item.sourceKey);
    if (existing?.source === 'manual') { duplicates++; continue; }
    if (existing) {
      const refreshed = { ...item, id: existing.id, sourceKey: existing.sourceKey, status: existing.status, notes: existing.notes, followUpAt: existing.followUpAt };
      indexed.set(existing.sourceKey, refreshed); updates.set(existing.id, refreshed); refreshedIds.add(existing.id); byUrl.set(url, refreshed);
    } else if (matchesDiscoveryTarget(profile, item)) {
      if (indexed.size >= 100) { deferred++; continue; }
      indexed.set(item.sourceKey, item); updates.set(item.id, item); refreshedIds.add(item.id); byUrl.set(url, item); bySource.set(item.sourceKey, item); added++;
    }
  }
  let stale = 0;
  for (const [key, item] of indexed) {
    if (item.source !== 'employer_api' || refreshedIds.has(item.id) || item.verification !== 'listed_on_source' || !['saved','prepared'].includes(item.status)) continue;
    // Preserve the last observed timestamp and all history. Unknown availability
    // is not a closed vacancy and can recover on a later successful source read.
    const uncertain = { ...item, verification: 'unverified' as const };
    indexed.set(key, uncertain); updates.set(item.id, uncertain); stale++;
  }
  const preparation: LoopOpportunity[] = []; const preparationUrls = new Set<string>();
  for (const item of [...indexed.values()].sort((a,b) => Number(b.source === 'manual') - Number(a.source === 'manual'))) {
    if (!['saved','prepared'].includes(item.status) || item.verification === 'closed_confirmed') continue;
    if (item.source !== 'manual' && (!refreshedIds.has(item.id) || !matchesDiscoveryTarget(profile, item))) continue;
    const url = safePublicUrl(item.url); if (url && preparationUrls.has(url)) continue;
    if (url) preparationUrls.add(url); preparation.push(item);
  }
  return { opportunities: [...indexed.values()], updates: [...updates.values()], preparation, added, deferred, duplicates, stale };
}
