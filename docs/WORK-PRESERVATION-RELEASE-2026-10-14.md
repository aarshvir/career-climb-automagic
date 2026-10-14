# CV work preservation — 14 October 2026

Published **version 22** on [Jobvance.io](https://jobvance.io), source `6f11154d0023902077f967acba9d1f9dfc7ad83b`, at 07:26 UTC. This fixes the two locally reproduced lost-work defects U06/U07 from the [v21 usability assessment](audits/2026-10-14-usability-reset/ASSESSMENT.md). It is one bounded slice of JV-01, not completion of that package or the wider product plan.

## Changed behavior

- A saved draft is read only after the persisted sign-in resolves. A failed session restoration keeps the owned draft hidden and intact until retry. The public introduction remains visible while this happens.
- Draft persistence is bound to the identity that owns the current state. Switching accounts or signing out clears the preceding account's work before persistence resumes. Signing in from an open guest check retains its wording but clears approval and save consent.
- Returning to an unchanged CV or rechecking the same/changed vacancy analyses the current final wording. Removed lines stay removed. Automatic source prioritization runs only for a newly prepared CV, not over an existing edit.
- An intentionally empty final editor stays empty, including after consented refresh, and remains accessible for correction. It cannot be approved or silently reconstructed from source.
- Reset, authentication pauses and owner changes cancel pending interface operations. A late extraction, PDF, download, save or deletion result cannot clear a newer operation's busy state or replace the new owner's displayed work. This fences interface results; it does not cancel a request already accepted by the backend.

Source replacement remains a deliberate source-step action and starts preparation again. A general undo for arbitrary source replacement is still unfinished; existing source-adoption/line-removal undo remains in place.

## Review and checks

Three separately assigned agents reviewed the bounded implementation and wrote regression cases. They did not score the product or repeat the earlier persona audit. Their 17 new tests cover delayed and failed session recovery, different owners, sign-out, guest continuation, exact wording/removals, empty final edits, initial prioritization, consented refresh, stale operation success/failure and reset during extraction.

The independent review caught an inaccessible empty-final editor and two busy-state locks involving cancellation/authentication recovery. These were fixed and retested. The production build also rejected a temporary session shell without a main heading; its introduction and page metadata were restored before publication. An obsolete copy assertion was updated while retaining the actual stored-draft assertions.

Validation for the released source:

- **150 tests in eight files passed**, including 17 new regressions; TypeScript passed.
- Production build rendered 38 public pages and 20 guides without external requests. All 12 hosting check groups passed; compressed Worker 2,763,206 bytes, below the 3 MiB limit.
- **49 live HTTP checks passed**, comparing deployed bodies/headers with the exact built Worker. These include the actual CV-check JavaScript and CSS, public pages, private route shells and blocked source paths. Only the previously verified complete Cloudflare suffix script is normalized; other bytes must match.
- Deployment archive inspected: 131 members, with no source, repository metadata, environment files, dependencies or internal documentation. Its SHA-256 is `f89e2cc7123e3f6ede6f4d0d35a1bdaf526ccb88dbb16f497e1d41e18af3cba6`.

Exact version, deployment, archive and rollback details: [release receipt](releases/2026-10-14-work-preservation.json). [Live readback](releases/2026-10-14-work-preservation-live-check.json). Local archives and original receipt also remain in `../jobvance-repair-evidence/` outside this checkout.

## Limits and next work

Auth/extraction/PDF/save boundaries in the new component tests are local mocks. HTTP readback verifies release integrity, not a fresh production signup/OAuth journey, native browser download delivery, actual unassisted candidate success, or usability scores. Prior media checks are historical evidence for unchanged assets; no new media audit, paid call or production candidate mutation was performed.

JV-01 remains **partial**: tracking-note/date navigation, arbitrary source-replacement undo, and keeping local export independent of a stalled optional save (including ambiguous retry identity) remain open. **JV-02 durable erasure fencing and bounded resumable cleanup is the next priority.** The shared application/home, first-check continuation, grouped review, direct vacancy preparation and public-entry simplification remain unfinished.

Rollback: the existing saved **v21** remains deployable, and remote tag `jobvance-before-work-preservation-2026-10-14` preserves source/documentation HEAD `a26ddb58f20e77da2a6ee2ebcacbc739cdefb52d` (runtime baseline `7ef48164bc7e9238809b4c199b3f136605ffaf56`). Earlier v20/v19/v14/v18 references and tags remain. No schema change was made. Source rollback is not a database/file restore rehearsal.
