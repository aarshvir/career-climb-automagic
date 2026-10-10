# Integrated MVP review — 10 October 2026

Read-only source review of `MvpApp`, `Workspace`, the CV/export libraries, workspace API, public pages, and the current server/migration contracts. Applied the React best-practices skill, focusing on actual state, availability and persistence defects. No code edits, broad test reruns, production access, payment or backend deployment were performed. The coordinator's 141-test result is prior evidence, not a test run by this reviewer. Further concurrent patches may resolve findings below.

## Actionable findings

### P2 — Saving status discards unsaved tracker notes and dates

**Evidence:** `src/pages/Workspace.tsx:63–66,97–104,913`.

Tracker rows are keyed by both ID and `updated_at`. Typing new notes or a follow-up date and then changing status saves only the status. The invalidated query returns a new timestamp, remounts the row and replaces its unsaved local fields with the old server values. The draft disappears without warning.

**Fix:** Use a stable row ID key and protect dirty draft fields, or include the pending notes/date in the status save. Do not blindly synchronize server props over dirty local state. **Acceptance:** type unsaved notes/date, change status, and confirm the draft remains or is persisted.

### P2 — Checkout recovery and repeat purchase lack a new-request path

**Evidence:** `src/pages/Workspace.tsx:197,965–966`; `supabase/functions/create-checkout/index.ts:13,19,26,33`.

The same checkout request ID is reused for the component's lifetime. Completed, expired and ambiguous claimed orders can return instructions to start a new checkout, but the interface has no way to do that. Reopening a completed transaction within the same workspace remains stuck on that old order.

**Fix:** Keep the ID for ordinary retries, and provide an explicit new sandbox checkout action after a terminal or recovery-required result. Reset it after a confirmed completed transaction, without granting credits from browser events. **Acceptance:** complete a sandbox checkout, refresh its server balance, and start another checkout without leaving the workspace. Real payments remain disabled under the user's free-beta instruction.

### P2 — Stripe fallback returns to a route the app does not define

**Evidence:** `supabase/functions/create-checkout/index.ts:37`; `src/MvpApp.tsx:99–134`.

Stripe success and cancellation URLs target `/workspace`, while the active workspace route is `/dashboard`. `/workspace` falls into the not-found page, so the backend reconciliation notice/poll never runs. The preferred Paddle flow already targets `/dashboard`.

**Fix:** Align the fallback's success/cancel URLs with `/dashboard?tab=billing&checkout=…`, or add a parameter-preserving legacy redirect. **Acceptance:** both provider callbacks reach the billing section; a fabricated success URL still grants no capacity. This affects future test-mode integration, not the disabled live checkout.

### P2 — Upload compensation can delete a successfully committed original

**Evidence:** `src/lib/cv-documents.ts:25–42`.

Every metadata insert/select failure causes storage deletion. If the database committed the metadata but its HTTP response was lost, the catch path can remove the original file while leaving a saved row pointing to it. This is a source-derived ambiguous-network-failure scenario, not a failure observed against production.

**Fix:** Generate a stable document ID before persistence. Reconcile an uncertain response by the owned ID/path before compensation; preserve a recoverable pending object when commit status cannot be determined. Delete storage only after confirming metadata was not committed. **Acceptance:** simulate committed insert plus lost response and retain a downloadable original; confirmed insert rejection still cleans its object.

### P2 — Entitlement-only failure disables existing files and tracking

**Evidence:** `src/lib/workspace-api.ts:loadWorkspace`; `src/pages/Workspace.tsx:401–403`.

The entitlement request is inside the same fail-fast aggregate as CVs, packs and tracker records. Its isolated failure rejects the initial workspace load and disables every fieldset control, even if database/storage reads succeeded. Users cannot download already-approved documents or update existing tracking records during an entitlement-service outage.

**Fix:** Load entitlement separately, or return a typed unavailable access state while retaining successfully loaded records. Fail closed for new metered packs/checkout; keep independent saved-record reads and edits usable. **Acceptance:** fail only the entitlement call and still open/download an approved pack and save tracker notes.

### P3 — Privacy copy names the wrong preferred payment provider

**Evidence:** `src/pages/ProductPage.tsx:280`; `supabase/functions/_shared/core.ts:92`.

Privacy copy says Stripe processes checkout, while the new default is Paddle. Update it to describe the current free beta with payments disabled, and accurately identify whichever sandbox provider is subsequently enabled. Do not advertise an available paid pass while checkout is intentionally disabled.

## Integration boundaries checked

No rendered cross-account data leak was identified in this source pass: the workspace is keyed by user ID, queries are user-keyed, protected content unmounts on sign-out, and the header clears its cache after successful local sign-out. This does not establish deployed RLS correctness. Server entitlement writes, pack consumption and payment grants are outside browser authority; live checkout is disabled by default. Approved-export checks and explicit user-reported tracking are present. Those boundaries still require staging/live-backend verification after deployment.
