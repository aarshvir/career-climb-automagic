import { syncCvVariantRecoveryOwner, syncCvVariantRecoveryGeneration, resetCvVariantRecovery } from './loop-cv-variant-recovery';
import { useEffect, useRef, useState } from 'react';

export interface TrackingDraft { status: string; followUp: string; notes: string }
export interface TrackingDraftScope { surface: 'workspace' | 'loop'; ownerId: string; applicationId: string; authority: number; lifecycleGeneration?: number }
const TTL = 30 * 60 * 1000, LIMIT = 100;
const statuses = new Set(['saved', 'prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn']);
const fields = ['status', 'followUp', 'notes'] as const;
type EditableField = typeof fields[number];
let owner: string | null | undefined;
let sessionIdentity: string | null | undefined;
let authority = 0, loopGeneration: number | undefined;
let timer: ReturnType<typeof setTimeout> | null = null;
const drafts = new Map<string, { scope: TrackingDraftScope; value: TrackingDraft; fields: EditableField[]; expiresAt: number }>();
const validGeneration = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const sameTrackingDraft = (a: TrackingDraft, b: TrackingDraft) => a.status === b.status && a.followUp === b.followUp && a.notes === b.notes;
export const trackingDraftIdentity = (scope: TrackingDraftScope) => JSON.stringify([scope.surface, scope.ownerId, scope.applicationId, scope.authority, scope.lifecycleGeneration]);
function allowed(scope: TrackingDraftScope) {
  return owner === scope.ownerId && authority === scope.authority && !!scope.applicationId &&
    (scope.surface === 'workspace' || validGeneration(scope.lifecycleGeneration) && scope.lifecycleGeneration === loopGeneration);
}
function valid(value: TrackingDraft) {
  return value && statuses.has(value.status) && typeof value.notes === 'string' && value.notes.length <= 5000 &&
    typeof value.followUp === 'string' && (value.followUp === '' || /^\d{4}-\d{2}-\d{2}$/.test(value.followUp));
}
function scheduleExpiry(now = Date.now()) {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (drafts.size) timer = setTimeout(() => { pruneExpired(); }, Math.max(1, Math.min(...[...drafts.values()].map(row => row.expiresAt)) - now));
}
function pruneExpired(now = Date.now()) {
  for (const [key, row] of drafts) if (row.expiresAt <= now || row.expiresAt > now + TTL) drafts.delete(key);
  scheduleExpiry(now);
}
/** AuthProvider calls this only on confirmed SDK identity changes. A failed or
 * unknown bootstrap must not replace this authority. Tracking notes stay in memory;
 * variant recovery uses a separate, explicitly opted-in session store. */
export function setTrackingDraftOwner(next: string | null, confirmedSessionIdentity?: string | null) {
  if (owner === next && (confirmedSessionIdentity === undefined || confirmedSessionIdentity === sessionIdentity)) return;
  sessionIdentity = confirmedSessionIdentity;
  owner = next; authority++; syncCvVariantRecoveryOwner(next, authority); loopGeneration = undefined; drafts.clear(); scheduleExpiry();
}
/** Resolved parents may initialize a standalone tree, never replace a newer SDK
 * identity. In particular, an old render/cleanup cannot re-adopt its old owner. */
export function registerTrackingDraftOwner(next: string | null) { if (owner === undefined) setTrackingDraftOwner(next); }
export function trackingDraftAuthority(ownerId: string) { return ownerId === owner ? authority : -1; }
/** Observe only; an async operation must never advance recovery authority. */
export function trackingLoopGeneration(ownerId: string) { return ownerId === owner ? loopGeneration : undefined; }
export function trackingDraftScope(surface: 'workspace' | 'loop', ownerId: string, applicationId: string, lifecycleGeneration?: number): TrackingDraftScope {
  return { surface, ownerId, applicationId, authority: trackingDraftAuthority(ownerId), ...(surface === 'loop' ? { lifecycleGeneration } : {}) };
}
export function setTrackingLoopGeneration(ownerId: string, generation: number) {
  if (owner !== ownerId || !validGeneration(generation) || loopGeneration === generation) return;
  // A delayed older response cannot move recovery authority backwards.
  if (loopGeneration !== undefined && generation < loopGeneration) return;
  loopGeneration = generation; syncCvVariantRecoveryGeneration(ownerId, generation);
  for (const [key, row] of drafts) if (row.scope.surface === 'loop') drafts.delete(key);
  scheduleExpiry();
}
export function retainTrackingDraft(scope: TrackingDraftScope, value: TrackingDraft, now = Date.now(), editedFields: readonly EditableField[] = fields) {
  if (!allowed(scope) || !valid(value) || scope.surface === 'workspace' && value.status === 'prepared') return;
  pruneExpired(now);
  const key = trackingDraftIdentity(scope);
  drafts.delete(key);
  drafts.set(key, { scope: { ...scope }, value: { status: value.status, followUp: value.followUp, notes: value.notes }, fields: fields.filter(field => editedFields.includes(field)), expiresAt: now + TTL });
  while (drafts.size > LIMIT) drafts.delete(drafts.keys().next().value!);
  scheduleExpiry(now);
}
export function recoverTrackingDraft(scope: TrackingDraftScope, now = Date.now()): TrackingDraft | null {
  pruneExpired(now);
  if (!allowed(scope)) return null;
  const row = drafts.get(trackingDraftIdentity(scope));
  return row ? { ...row.value } : null;
}
/** An old save may acknowledge only its exact submitted text/date/status. */
export function clearTrackingDraft(scope: TrackingDraftScope, submitted?: TrackingDraft) {
  if (!allowed(scope)) return;
  const key = trackingDraftIdentity(scope), row = drafts.get(key);
  if (row && (!submitted || sameTrackingDraft(row.value, submitted))) drafts.delete(key);
  scheduleExpiry();
}
export function pruneTrackingApplications(surface: TrackingDraftScope['surface'], ownerId: string, applicationIds: string[], generation?: number) {
  if (owner !== ownerId || surface === 'loop' && generation !== loopGeneration) return;
  const present = new Set(applicationIds);
  for (const [key, row] of drafts) if (row.scope.surface === surface && !present.has(row.scope.applicationId)) drafts.delete(key);
  scheduleExpiry();
}
export function clearTrackingDraftMemory() { resetCvVariantRecovery(); drafts.clear(); owner = undefined; sessionIdentity = undefined; authority++; loopGeneration = undefined; scheduleExpiry(); }

/** The row key includes trackingDraftIdentity(scope). Only editable fields are
 * recovered; status attestation remains fresh local component state. */
export function useTrackingDraft(scope: TrackingDraftScope, baseline: TrackingDraft) {
  const [recovered] = useState(() => { recoverTrackingDraft(scope); return allowed(scope) ? drafts.get(trackingDraftIdentity(scope)) : undefined; });
  const [draft, setDraft] = useState<TrackingDraft>(() => { const value = { ...baseline }; if (recovered) for (const field of recovered.fields) value[field] = recovered.value[field]; return value; });
  const current = useRef(draft), previousBaseline = useRef(baseline), observedBaseline = useRef(baseline);
  current.current = draft;
  const identity = trackingDraftIdentity(scope);
  function remember(value: TrackingDraft) {
    const changed = fields.filter(field => value[field] !== previousBaseline.current[field]);
    if (!changed.length) clearTrackingDraft(scope);
    else retainTrackingDraft(scope, value, Date.now(), changed);
  }
  useEffect(() => {
    let next = current.current;
    if (!sameTrackingDraft(observedBaseline.current, baseline)) {
      const before = previousBaseline.current;
      next = { ...current.current };
      for (const field of fields) if (next[field] === before[field]) next[field] = baseline[field];
      observedBaseline.current = baseline; previousBaseline.current = baseline;
      if (!sameTrackingDraft(next, current.current)) { current.current = next; setDraft(next); }
    }
    remember(next);
  }, [identity, draft.status, draft.followUp, draft.notes, baseline.status, baseline.followUp, baseline.notes]);
  function edit(patch: Partial<TrackingDraft>) {
    const next = { ...current.current, ...patch }; current.current = next; setDraft(next);
    remember(next);
  }
  function acknowledge(submitted: TrackingDraft, submittedBaseline: TrackingDraft) {
    if (!allowed(scope)) return;
    clearTrackingDraft(scope, submitted);
    const nextBaseline = { ...previousBaseline.current };
    for (const field of fields) if (nextBaseline[field] === submittedBaseline[field]) nextBaseline[field] = submitted[field];
    previousBaseline.current = nextBaseline;
    remember(current.current);
  }
  return { draft, edit, recovered: !!recovered, current, baseline: previousBaseline, acknowledge };
}
