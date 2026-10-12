import { beforeEach, describe, expect, it } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearLoopWorkingDraft, recoverLoopWorkingDraft, retainLoopWorkingDraft, type LoopWorkingDraft } from '@/lib/loop-draft-memory';
function draft(): LoopWorkingDraft { return { profile: { ...blankLoopProfile('mba'), sourceText: 'Fictional private record draft' }, profileDirty: true, lists: { targets: 'Synthetic role', locations: '', languages: '', excluded: '' }, claimDrafts: { synthetic: { chosenKind: 'academic_project', value: { sourceKind: 'user_answer', sourceQuote: 'Synthetic project', phrasing: 'Synthetic project', context: 'Fictional course', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true } } }, suggestions: [], newClaimKey: 0, opportunity: { title: 'Fictional vacancy', company: '', location: '', jobUrl: '', description: '', withContact: false, contact: { name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: true, inExistingThread: false } } }; }
describe('private route-draft recovery', () => {
  beforeEach(clearLoopWorkingDraft);
  it('recovers a copy for the same owner with facts and contact sharing requiring confirmation again', () => {
    retainLoopWorkingDraft('owner-a', draft(), 1000); const recovered = recoverLoopWorkingDraft('owner-a', 1001)!;
    expect(recovered.profile.sourceText).toBe('Fictional private record draft');
    expect(recovered.claimDrafts.synthetic.value).toMatchObject({ confirmed: false, shareable: false });
    expect(recovered.opportunity.contact.confirmedByUser).toBe(false);
    recovered.profile.sourceText = 'Changed returned object';
    expect(recoverLoopWorkingDraft('owner-a', 1002)!.profile.sourceText).toBe('Fictional private record draft');
  });
  it('destroys a retained draft on account mismatch and never restores it to the previous owner afterward', () => {
    retainLoopWorkingDraft('owner-a', draft(), 1000);
    expect(recoverLoopWorkingDraft('owner-b', 1001)).toBeNull();
    expect(recoverLoopWorkingDraft('owner-a', 1002)).toBeNull();
  });
  it('expires after 30 minutes and supports explicit clearing on sign-out or discard', () => {
    retainLoopWorkingDraft('owner-a', draft(), 1000); expect(recoverLoopWorkingDraft('owner-a', 1801000)).toBeNull();
    retainLoopWorkingDraft('owner-a', draft(), 1000); clearLoopWorkingDraft(); expect(recoverLoopWorkingDraft('owner-a', 1001)).toBeNull();
  });
});
