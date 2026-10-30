import type { FreeCvCheck } from '@/lib/free-check-api';
import { savedCheckContinuationPath } from '@/lib/saved-check-continuation';

export function usableSavedCheck(check: FreeCvCheck, ownerId: string): boolean {
  return check.user_id === ownerId && check.status === 'approved' && !!savedCheckContinuationPath(check.id)
    && typeof check.job_title === 'string' && check.job_title.trim().length >= 2 && check.job_title.length <= 200
    && typeof check.company === 'string' && check.company.length <= 200
    && typeof check.job_description === 'string' && check.job_description.trim().length >= 80 && check.job_description.length <= 20000
    && [check.reviewed_text, check.original_text].every(text => typeof text === 'string' && text.trim().length >= 80 && text.length <= 60000);
}
