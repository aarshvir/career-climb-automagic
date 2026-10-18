import { useEffect, useRef, useState } from 'react';
import { callJobLoop } from '@/lib/job-loop-api';
import { resolveCurrentCvVariantFacts, type CvVariantFactsRead } from '../../supabase/functions/_shared/job-loop-cv-variant-facts';
import type { LoopClaim, LoopCvVariant, LoopPacket, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

export interface VariantPacketSource { variant: LoopCvVariant; facts: CvVariantFactsRead }

/** Resolve the packet's own source, retaining the legacy global-record fence.
 * Independent variant facts use the same vf_ namespace as the SQL projection. */
export function currentPacketClaims(packet: LoopPacket, snapshot: LoopSnapshot, source?: VariantPacketSource): LoopClaim[] | null {
  if (packet.status === 'revoked' || Object.keys(packet.claimVersions).length === 0) return null;
  let claims: LoopClaim[];
  if (!packet.cvSelection) {
    if (!snapshot.profile || packet.profileRevision !== snapshot.profile.revision) return null;
    claims = snapshot.claims;
  } else {
    const selection = packet.cvSelection;
    if (!source || source.variant.generation !== snapshot.lifecycleGeneration || source.facts.generation !== snapshot.lifecycleGeneration
      || source.facts.recordVersion !== snapshot.recordVersion || source.variant.id !== selection.variantId
      || source.variant.revision !== selection.variantRevision || source.variant.sourceHash !== selection.sourceHash
      || packet.profileRevision !== selection.variantRevision || source.facts.variant.id !== selection.variantId
      || source.facts.variant.revision !== selection.variantRevision || source.facts.variant.sourceHash !== selection.sourceHash) return null;
    const inherited: LoopClaim[] = [];
    for (const ref of source.variant.claims) {
      const claim = snapshot.claims.find(item => item.id === ref.id);
      if (!claim || claim.revision !== ref.revision || claim.status !== 'active' || !claim.confirmed || !claim.shareable
        || (claim.sourceKind === 'cv_passage' && snapshot.profile?.sourceText !== source.variant.profile.sourceText)) return null;
      inherited.push(claim);
    }
    try {
      claims = [...inherited, ...resolveCurrentCvVariantFacts(source.variant, source.facts.facts, selection.factRefs)
        .map(fact => ({ ...fact, id: `vf_${fact.id}` }))];
    } catch { return null; }
  }
  return Object.entries(packet.claimVersions).every(([id, revision]) => claims.some(claim => claim.id === id
    && claim.revision === revision && claim.status === 'active' && claim.confirmed && claim.shareable)) ? claims : null;
}

/** Current private source metadata is not included in the global snapshot.
 * Read at most the three owned variants referenced by visible packet history;
 * these passive calls never select a source or restore preparation consent. */
export function useVariantPacketSources(snapshot: LoopSnapshot | null, owner: string | undefined, authority: number, ready: boolean) {
  const ids = [...new Set(snapshot?.packets.filter(packet => packet.status !== 'revoked').flatMap(packet => packet.cvSelection ? [packet.cvSelection.variantId] : []) ?? [])].sort();
  const context = ready && owner && authority >= 0 && Number.isSafeInteger(snapshot?.lifecycleGeneration) && snapshot!.lifecycleGeneration! >= 0 && ids.length
    ? JSON.stringify([owner, authority, snapshot!.lifecycleGeneration, snapshot!.recordVersion, ids]) : '';
  const current = useRef(context), epoch = useRef(0);
  if (current.current !== context) { current.current = context; epoch.current++; }
  const [read, setRead] = useState<{ context: string; sources: Record<string, VariantPacketSource>; pending: boolean; error: string }>({ context: '', sources: {}, pending: false, error: '' });
  useEffect(() => {
    if (!context || !snapshot || !owner) return;
    const at = epoch.current, expectedGeneration = snapshot.lifecycleGeneration!, expectedVersion = snapshot.recordVersion;
    let active = true;
    const stillCurrent = () => active && current.current === context && epoch.current === at;
    setRead({ context, sources: {}, pending: true, error: '' });
    void (async () => {
      const result = await callJobLoop(owner, { action: 'read_cv_variants', expectedGeneration }, stillCurrent);
      if (!stillCurrent()) return;
      if (!result.cvVariants || result.cvVariants.generation !== expectedGeneration || result.cvVariants.recordVersion !== expectedVersion) throw new Error('Refresh records before reviewing this saved CV.');
      const variants = result.cvVariants.variants.filter(variant => ids.includes(variant.id));
      const entries = await Promise.all(variants.map(async variant => {
        const result = await callJobLoop(owner, { action: 'read_cv_variant_facts', expectedGeneration, variantId: variant.id }, stillCurrent);
        if (!result.cvVariantFacts || result.cvVariantFacts.generation !== expectedGeneration || result.cvVariantFacts.recordVersion !== expectedVersion
          || result.cvVariantFacts.variant.id !== variant.id || result.cvVariantFacts.variant.revision !== variant.revision
          || result.cvVariantFacts.variant.sourceHash !== variant.sourceHash) throw new Error('Refresh records before reviewing this saved CV.');
        return [variant.id, { variant, facts: result.cvVariantFacts }] as const;
      }));
      if (stillCurrent()) setRead({ context, sources: Object.fromEntries(entries), pending: false, error: '' });
    })().catch(() => {
      if (stillCurrent()) setRead({ context, sources: {}, pending: false, error: 'The saved CV source could not be checked. Refresh records before approving or downloading.' });
    });
    return () => { active = false; };
  }, [context, snapshot]);
  return context && read.context === context ? read : { context, sources: {} as Record<string, VariantPacketSource>, pending: !!context, error: '' };
}
