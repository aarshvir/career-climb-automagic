# Independent saved-check continuation review

15 October 2026. Scope: new saved-check entry/return helper, `CvCheck` entry, `LoopSavedCheckImport` and the related `JobLoop` import/undo changes. This is a bounded JV-03 draft-continuation review. The shared Applications home and per-vacancy worker composition described in `architecture.md` are not implemented by it.

## Findings during implementation

1. **Exact older selections were lost.** The first chooser implementation capped eligible records at 50 before finding `fromCheck`, so a valid owned check beyond that range was incorrectly reported unavailable. The implementation now resolves the requested usable record first and includes it alongside the recent 50 if necessary. The integration regression uses 51 newer records plus the requested older record.
2. **Undo wording overstated its lifetime.** Runtime correctly invalidates its backup when saved record version changes, including a background refresh, but initially promised restoration until save/leave only. The chooser and undo panel now also mention saved-record changes.

These findings were coordinated with the implementer and coordinator. This reviewer made no runtime edits.

## Source/privacy and side-effect boundaries

- `src/pages/LoopSavedCheckImport.tsx:7` validates current ownership, an approved saved check, bounded fields and a canonical opaque ID. The selected version defaults to final wording. Original-source selection has a separate warning and fresh confirmation, so private text removed from the final version is not silently reintroduced.
- The chooser reads only after explicit opening or a valid selected-check entry into the Loop. It checks all returned owners before displaying data. Close/unmount cancels adoption of delayed results; current callbacks additionally check owner/auth authority/generation.
- `src/pages/JobLoop.tsx:274` copies the chosen text into local draft fields only after the explicit action. Current name/contact/target preferences are preserved; blank targets can take the selected role. Existing vacancy URL/location/contact details are cleared with an explicit replacement warning. No employer URL or location is invented.
- Dirty claim edits block replacement. Replacement permission binds the exact current draft fingerprint and selected CV version; it cannot silently cover subsequent field changes. Import clears private saving, output review/disclosure, recipient, model, inbox and Gmail permission controls. It does not create confirmed/shareable claims or start preparation.
- The existing local Loop working-draft memory may retain the draft for route recovery under its owner and lifecycle generation. No CV/vacancy text is added to route URLs or a new browser-storage channel. The account-return entry stores a canonical opaque selection only; backend reads remain owner-scoped.

## Account, lifecycle and undo boundaries

`savedCheckScopeCurrent` checks the mounted state, resolved/nonfailed auth, current owner, monotonic tracking authority and current Loop generation. The chooser is keyed by these values. URL intent is consumed once bound; an erasure/fresh lifetime clears intent, backup and previous permission controls. Data copied into a prior generation is not replayed into the new generation by draft recovery.

The single backup is page state, contains the prior exact draft fields, and binds the captured record version in addition to owner/authority/generation. Restore requires fresh permission, cannot run while busy or over dirty claims, and clears sharing/contact confirmations. A saved-record version change or authoritative mutation attempt invalidates it. Existing packet/download checks still require source freshness and no uncommitted career-record edits; import does not bypass them.

## Independent verification so far

This reviewer independently ran canonical-selector, actual App email/Google return, and free-check source/save suites: **39/39 tests passed across three files** (`saved-check-continuation.test.ts`, `workspace-return.test.tsx`, `cv-check-source-save.test.tsx`). These use synthetic local responses, not live authentication or candidate data.

## Final frozen-source decision

**Clear for the coordinator's broader release checks within this bounded scope.** No remaining material blocker was identified after the two findings above were corrected. The final header handling also preserves intentionally blank name/contact fields in an existing or edited draft. Only an untouched new profile may derive conservative header suggestions from the chosen text, under the visible review note.

This reviewer independently ran the frozen new import suite and existing Loop journey/onboarding suites: **78/78 tests passed across three files** (`job-loop-saved-check-import.test.tsx`, `job-loop-journey.test.tsx`, `job-loop-onboarding.test.tsx`). Combined with the earlier nonoverlapping entry/helper/auth/source run, that is **117/117 tests across six files** in this review. Scoped whitespace validation passed.

The new 19-case suite covers explicit final/source selection; exact CV/vacancy transfer; no extra action beyond the existing intentional Loop `get` during copy; original-source privacy warning; selected older records; owner mismatch/failure; A→B and A→B→A delayed resolution/rejection; unresolved/failed auth requiring a fresh owned read; same-owner lifecycle changes; dirty-claim blocking; replacement/undo reconfirmation after edits; and preserved blank headers. No model, search, storage upload, save, run or employer action is requested by the import itself. The existing intentional Loop entry still has its normal record-initialization behavior; this does not make it a passive read suitable for an Applications home.

Broader hosted OAuth, actual account save delivery, complete Applications home and scoped cloud preparation remain outside this review. These are local synthetic acceptance regressions and source review, not real customer observations. The coordinator owns broader validation, build and publication.
