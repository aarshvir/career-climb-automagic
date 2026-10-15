import { ApiError } from './core.ts';
import type { RunRow, RunState } from './job-loop-repository.ts';
import type { LoopOpportunity } from './job-loop-types.ts';

const fail = (): never => { throw new ApiError(409, 'LOOP_SELECTION_INVALID', 'The saved vacancy selection is unavailable or inconsistent. Start a new reviewed request.'); };
/** Resolve only against the immutable owned snapshot, never a fresh shortlist. */
export function selectedRunOpportunities(run: RunRow): LoopOpportunity[] | null {
  const ids = run.selected_opportunity_ids;
  if (ids === undefined || ids === null) { if (run.selected_generation != null) fail(); return null; }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length
    || ids.some(id => typeof id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(id))) fail();
  if (!Number.isSafeInteger(run.selected_generation) || run.selected_generation! < 0 || run.selected_generation !== run.lifecycle_generation || run.consents.inbox !== false) fail();
  return ids.map(id => {
    const matches = run.snapshot.opportunities.filter(item => item.id === id);
    if (matches.length !== 1 || !['saved', 'prepared'].includes(matches[0].status)
      || !['user_provided', 'listed_on_source', 'unverified'].includes(matches[0].verification)) fail();
    return structuredClone(matches[0]);
  });
}

/** Phase state cannot omit, add, reorder or replace selected sources.
 * Mutable phase vacancy text is never authoritative. */
export function selectedPhaseOpportunities(selected: LoopOpportunity[], state: RunState): LoopOpportunity[] {
  const ids = state.opportunityIds;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length
    || !Array.isArray(state.opportunities) || JSON.stringify(state.opportunities.map(item => item.id)) !== JSON.stringify(ids)) fail();
  const expected = selected;
  if (JSON.stringify(expected.map(item => item.id)) !== JSON.stringify(ids)) fail();
  return expected;
}
