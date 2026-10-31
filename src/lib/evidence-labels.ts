import type { EvidenceStatus } from './cv-evidence';

/** The one vocabulary for how a CV covers a job requirement, used by the CV Check, its summary tiles, the guides and the public CV Check page. */
export const evidenceStatusLabels: Record<EvidenceStatus, string> = {
  direct: 'Covered',
  partial: 'Partly covered',
  missing: 'Not shown in your CV',
  review: 'Needs your judgment',
};
