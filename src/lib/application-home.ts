import type { ApplicationPack, TrackedApplication } from './cv-database';
import type { FreeCvCheck } from './free-check-api';
import type { LoopPacket, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
import { isApplicationSourcePath } from './application-source-selection';

export type ApplicationHomeSource = 'checks' | 'packs' | 'trackers' | 'loop';
export type ExistingApplicationLoop = { existingState: 'absent' } | { existingState: 'erasing'; erasureGeneration: number } | { existingState: 'active'; snapshot: LoopSnapshot };
export interface ApplicationHomeDocument { id: string; label: string; state: string; text: string; evidence?: string; createdAt: string | null; reasons: string[] }
export interface ApplicationHomeProgress { id: string; title: string; company: string; status: string; notes: string; appliedAt: string | null; followUpAt: string | null; href: string | null }
export interface ApplicationHomeRow {
  id: string; source: ApplicationHomeSource; sourceLabel: string; title: string; company: string;
  vacancy: string; employerUrl: string | null; documents: ApplicationHomeDocument[]; progress: ApplicationHomeProgress[];
  lastRecordedAt: string | null; href: string | null; action: string; note: string;
}
export interface ApplicationHomeInput { checks: FreeCvCheck[]; packs: ApplicationPack[]; trackers: TrackedApplication[]; loop: ExistingApplicationLoop | null }
const validGeneration = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const href = (value: string): string | null => isApplicationSourcePath(value) ? value : null;
const recorded = (...dates: (string | null | undefined)[]): string | null => dates.filter((date): date is string => !!date && Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
export function applicationEmployerUrl(value: string | null): string | null {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function applicationHomeSource(id: string): ApplicationHomeSource | null {
  return id.startsWith('check:') ? 'checks' : id.startsWith('pack:') ? 'packs' : id.startsWith('tracker:') ? 'trackers' : id.startsWith('loop:') ? 'loop' : null;
}
/** Local selection only: opaque source identity; an invalid or ambiguous query never selects another item. */
export function readApplicationHomeSelection(search: string): { id: string | null; invalid: boolean } {
  if (!search) return { id: null, invalid: false };
  const query = new URLSearchParams(search), values = [...query.entries()];
  if (values.length !== 1 || values[0][0] !== 'item') return { id: null, invalid: true };
  const id = values[0][1], uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  if (new RegExp(`^(?:check|pack|tracker):${uuid}$`).test(id)) return { id: id.toLowerCase(), invalid: false };
  const loop = new RegExp(`^loop:(0|[1-9][0-9]*):${uuid}$`).exec(id);
  return loop && validGeneration(Number(loop[1])) ? { id: id.toLowerCase(), invalid: false } : { id: null, invalid: true };
}
function trackerProgress(row: TrackedApplication): ApplicationHomeProgress {
  return { id: row.id, title: row.job_title, company: row.company, status: row.status, notes: row.notes, appliedAt: row.applied_at, followUpAt: row.follow_up_at, href: href(`/dashboard?tracked=${row.id}`) };
}
function packetDocument(packet: LoopPacket, snapshot: LoopSnapshot): ApplicationHomeDocument {
  const current = !!snapshot.profile && snapshot.profile.revision === packet.profileRevision && Object.keys(packet.claimVersions).length > 0 && Object.entries(packet.claimVersions).every(([id, version]) => snapshot.claims.some(claim => claim.id === id && claim.revision === version && claim.status === 'active' && claim.confirmed && claim.shareable));
  const pages = !!snapshot.profile && packet.holdReasons.length === 0 && (packet.formatStatus ? Object.values(packet.formatStatus).some(format => format.ready) : packet.pageCount !== null && packet.pageCount > 0 && packet.pageCount <= snapshot.profile.pageTarget);
  const state = packet.status === 'revoked' ? 'Revoked output' : packet.status === 'held' || packet.holdReasons.length ? 'Held for review' : !current ? 'Source facts changed — review needed' : packet.status !== 'approved' ? 'Review required' : !pages ? 'Approved text — format check needed' : 'Approved output saved — reopen to review formats';
  return { id: packet.id, label: 'Prepared CV', state, text: packet.cvText, evidence: packet.evidenceText, createdAt: packet.createdAt, reasons: packet.holdReasons };
}
/** Read-only projection. Only actual foreign keys join records; similar wording is never an identity. */
export function buildApplicationHome(ownerId: string, input: ApplicationHomeInput): ApplicationHomeRow[] {
  const checks = input.checks.filter(row => row.user_id === ownerId), packs = input.packs.filter(row => row.user_id === ownerId), trackers = input.trackers.filter(row => row.user_id === ownerId);
  const rows: ApplicationHomeRow[] = checks.map(row => {
    const linked = trackers.filter(tracker => !tracker.pack_id && tracker.cv_check_id === row.id);
    return {
      id: `check:${row.id}`, source: 'checks', sourceLabel: 'Saved CV check', title: row.job_title, company: row.company, vacancy: row.job_description, employerUrl: null,
      documents: [{ id: `${row.id}:final`, label: 'Reviewed final CV', state: row.status === 'approved' ? 'Reviewed check saved' : 'Saved draft', text: row.reviewed_text, createdAt: row.created_at, reasons: [] }, { id: `${row.id}:original`, label: 'Original source CV', state: 'Original input — may include details removed from the final CV', text: row.original_text, createdAt: row.created_at, reasons: [] }],
      progress: linked.map(trackerProgress), lastRecordedAt: recorded(row.updated_at, row.created_at, ...linked.map(tracker => tracker.updated_at)), href: href(`/check?savedCheck=${row.id}`), action: 'Reopen this CV check', note: linked.length ? 'Reported progress comes from the tracking entry linked to this saved check. Reopening starts a fresh review.' : 'A saved CV check does not record an application being sent. Reopening starts a fresh review.',
    };
  });
  for (const row of packs) {
    const linked = trackers.filter(tracker => !tracker.cv_check_id && tracker.pack_id === row.id);
    rows.push({ id: `pack:${row.id}`, source: 'packs', sourceLabel: 'Application pack', title: row.job_title, company: row.company, vacancy: row.job_description, employerUrl: applicationEmployerUrl(row.job_url),
      documents: [{ id: `${row.id}:tailored`, label: 'Tailored CV', state: row.status === 'approved' ? 'Approved pack saved — reopen to review downloads' : 'Draft — review required', text: row.tailored_text, createdAt: row.created_at, reasons: [] }, { id: `${row.id}:original`, label: 'Original source CV', state: 'Original input', text: row.original_text, createdAt: row.created_at, reasons: [] }],
      progress: linked.map(trackerProgress), lastRecordedAt: recorded(row.created_at, ...linked.map(tracker => tracker.updated_at)), href: href(`/dashboard?pack=${row.id}`), action: 'Open this application pack', note: linked.length ? 'Reported progress comes from the tracking entries linked to this pack.' : 'No tracking entry is linked to this pack.',
    });
  }
  const packIds = new Set(packs.map(row => row.id)), checkIds = new Set(checks.map(row => row.id));
  // A contradictory pair of source IDs cannot safely attribute progress to either document.
  const standaloneTrackers = trackers.filter(tracker => {
    if (tracker.pack_id && tracker.cv_check_id) return true;
    return !(tracker.pack_id && packIds.has(tracker.pack_id)) && !(tracker.cv_check_id && checkIds.has(tracker.cv_check_id));
  });
  for (const row of standaloneTrackers) rows.push({
    id: `tracker:${row.id}`, source: 'trackers', sourceLabel: 'Tracked application', title: row.job_title, company: row.company, vacancy: '', employerUrl: applicationEmployerUrl(row.job_url), documents: [], progress: [trackerProgress(row)], lastRecordedAt: recorded(row.updated_at, row.created_at), href: href(`/dashboard?tracked=${row.id}`), action: 'Update this tracked application', note: row.pack_id && row.cv_check_id ? 'This tracking entry has conflicting document links and is shown separately.' : row.cv_check_id ? 'The linked saved check is not in the currently loaded check list. This tracking entry is retained separately.' : row.pack_id ? 'The linked pack is not in the currently loaded pack list. This tracking entry is retained separately.' : 'This tracking entry has no linked CV pack.',
  });
  if (input.loop?.existingState === 'active' && validGeneration(input.loop.snapshot.lifecycleGeneration)) {
    const snapshot = input.loop.snapshot, generation = snapshot.lifecycleGeneration!;
    for (const row of snapshot.opportunities) {
      const packets = snapshot.packets.filter(packet => packet.opportunityId === row.id);
      rows.push({ id: `loop:${generation}:${row.id}`, source: 'loop', sourceLabel: 'Job Loop vacancy', title: row.title, company: row.company, vacancy: row.description, employerUrl: applicationEmployerUrl(row.url), documents: packets.map(packet => packetDocument(packet, snapshot)),
        progress: [{ id: row.id, title: row.title, company: row.company, status: row.status, notes: row.notes, appliedAt: null, followUpAt: row.followUpAt, href: href(`/loop?opportunity=${row.id}&generation=${generation}`) }],
        lastRecordedAt: recorded(row.checkedAt, ...packets.map(packet => packet.createdAt)), href: href(`/loop?opportunity=${row.id}&generation=${generation}`), action: 'Open this Job Loop vacancy', note: 'Documents show recent loaded output attempts. Earlier outputs may exist. Approval and available formats are checked again in Job Loop.',
      });
    }
  }
  return rows.sort((a, b) => (b.lastRecordedAt ? Date.parse(b.lastRecordedAt) : -Infinity) - (a.lastRecordedAt ? Date.parse(a.lastRecordedAt) : -Infinity) || a.id.localeCompare(b.id));
}
