import { beforeEach, describe, expect, it } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearLoopWorkingDraft, recoverLoopWorkingDraft, retainLoopWorkingDraft, type LoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
function draft(lifecycleGeneration = 0): LoopWorkingDraft { return { lifecycleGeneration, profile: { ...blankLoopProfile('mba'), sourceText: 'Fictional private record draft' }, profileDirty: true, lists: { targets: 'Synthetic role', locations: '', languages: '', excluded: '' }, claimDrafts: { synthetic: { chosenKind: 'academic_project', value: { sourceKind: 'user_answer', sourceQuote: 'Synthetic project', phrasing: 'Synthetic project', context: 'Fictional course', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true } } }, suggestions: [], newClaimKey: 0, opportunity: { title: 'Fictional vacancy', company: '', location: '', jobUrl: '', description: '', withContact: false, contact: { name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: true, inExistingThread: false } } }; }
describe('private route-draft recovery', () => {
  beforeEach(clearLoopWorkingDraft);
  it('recovers the exact imported identity with edited wording, without silently detaching it', () => {
    clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
    const value = draft(4); value.pendingCheckLink = { ownerId: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: 4, checkId: '11111111-1111-4111-8111-111111111111', vacancy: { title: 'Original role', company: 'Original company', description: 'Original vacancy' } };
    retainLoopWorkingDraft('owner-a', value, 1000);
    expect(recoverLoopWorkingDraft('owner-a', 4, 1001)?.pendingCheckLink).toEqual(value.pendingCheckLink);
    expect(recoverLoopWorkingDraft('owner-a', 4, 1001)?.opportunity.title).toBe('Fictional vacancy');
    clearTrackingDraftMemory();
  });
  it('rejects the complete imported draft after an A to B to A auth transition', () => {
    clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
    const value = draft(4); value.pendingCheckLink = { ownerId: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: 4, checkId: '11111111-1111-4111-8111-111111111111', vacancy: { title: 'Original role', company: '', description: 'Original vacancy' } };
    retainLoopWorkingDraft('owner-a', value, 1000); setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a');
    expect(recoverLoopWorkingDraft('owner-a', 4, 1001)).toBeNull(); clearTrackingDraftMemory();
  });
  it('recovers a copy only for the same owner and lifetime, requiring sharing confirmation again', () => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000); const recovered = recoverLoopWorkingDraft('owner-a', 4, 1001)!;
    expect(recovered.profile.sourceText).toBe('Fictional private record draft');
    expect(recovered.lifecycleGeneration).toBe(4);
    expect(recovered.claimDrafts.synthetic.value).toMatchObject({ confirmed: false, shareable: false });
    expect(recovered.opportunity.contact.confirmedByUser).toBe(false);
    recovered.profile.sourceText = 'Changed returned object';
    expect(recoverLoopWorkingDraft('owner-a', 4, 1002)!.profile.sourceText).toBe('Fictional private record draft');
  });
  it('does not let a later mutation of the input draft relabel its lifetime or text', () => {
    const input = draft(4); retainLoopWorkingDraft('owner-a', input, 1000);
    input.lifecycleGeneration = 6; input.profile.sourceText = 'Mutated after retention';
    expect(recoverLoopWorkingDraft('owner-a', 4, 1001)!.profile.sourceText).toBe('Fictional private record draft');
  });
  it('destroys a retained draft on account mismatch and never restores it to the previous owner afterward', () => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000);
    expect(recoverLoopWorkingDraft('owner-b', 4, 1001)).toBeNull();
    expect(recoverLoopWorkingDraft('owner-a', 4, 1002)).toBeNull();
  });
  it.each([2, 6])('destroys a same-owner draft when the displayed epoch is %i rather than its originating epoch', epoch => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000);
    expect(recoverLoopWorkingDraft('owner-a', epoch, 1001)).toBeNull();
    expect(recoverLoopWorkingDraft('owner-a', 4, 1002)).toBeNull();
  });
  it('accepts zero as the first active lifetime', () => {
    retainLoopWorkingDraft('owner-a', draft(0), 1000);
    expect(recoverLoopWorkingDraft('owner-a', 0, 1001)?.lifecycleGeneration).toBe(0);
  });
  it.each([undefined, null, -1, 0.5, '4', Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects malformed retained lifetime %s and clears earlier memory', epoch => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000);
    retainLoopWorkingDraft('owner-a', { ...draft(), lifecycleGeneration: epoch } as unknown as LoopWorkingDraft, 1001);
    expect(recoverLoopWorkingDraft('owner-a', 4, 1002)).toBeNull();
  });
  it.each([undefined, null, -1, 0.5, '4', Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects malformed displayed lifetime %s without adopting a current one', epoch => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000);
    expect(recoverLoopWorkingDraft('owner-a', epoch as number, 1001)).toBeNull();
    expect(recoverLoopWorkingDraft('owner-a', 4, 1002)).toBeNull();
  });
  it('expires after 30 minutes and supports explicit clearing on sign-out or discard', () => {
    retainLoopWorkingDraft('owner-a', draft(4), 1000); expect(recoverLoopWorkingDraft('owner-a', 4, 1801000)).toBeNull();
    retainLoopWorkingDraft('owner-a', draft(4), 1000); clearLoopWorkingDraft(); expect(recoverLoopWorkingDraft('owner-a', 4, 1001)).toBeNull();
  });
});
