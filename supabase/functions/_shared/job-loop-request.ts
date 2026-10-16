import type { LoopAction } from './job-loop-types.ts';

const BOUND_ACTIONS = new Set([
  'start_run', 'start_selected_run', 'request_support', 'link_saved_check',
  'save_schedule', 'pause_schedule', 'cancel_schedule',
  'gmail_connect', 'gmail_disconnect', 'gmail_preview', 'gmail_finalize', 'gmail_create_draft',
  'erase_loop', 'erase_self',
]);

export function generationBoundAction(action: string): boolean { return BOUND_ACTIONS.has(action); }
export function validLoopGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Capture the displayed workspace lifetime before auth/network awaits. Never
 * fetch a newer lifetime and replay an earlier permission or erase intent. */
export function boundLoopAction(action: LoopAction, generation: number | undefined): LoopAction {
  if (!generationBoundAction(action.action)) return action;
  if (action.expectedGeneration !== undefined) {
    if (!validLoopGeneration(action.expectedGeneration)) throw new Error('Refresh Jobvance before continuing. Your saved work is retained.');
    return { ...action };
  }
  if (!validLoopGeneration(generation)) throw new Error('Refresh Jobvance before continuing. Your saved work is retained.');
  return { ...action, expectedGeneration: generation };
}
