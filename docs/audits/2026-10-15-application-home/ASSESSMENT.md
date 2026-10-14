# Saved-check continuation: bounded repair assessment

15 October 2026. The current work follows the owner’s request to connect the confusing journey and reduce repeated entry, plus the reconciled Claude brief. It implements the explicit saved-check → Loop draft continuation, not the whole shared Applications home.

## Customer result

A candidate can continue an approved check saved in their own account, inspect its exact reviewed CV and vacancy, and deliberately copy them into the Loop drafts. Removed final-CV details are not silently restored. Existing drafts require replacement confirmation and offer scoped undo. Existing profile/edited header choices, including blank contact lines, survive; genuinely untouched new profiles can derive header fields with a visible note. Old vacancy links/recruiter details are cleared rather than attached to the new job. Account saving, fact permissions and model processing remain separate decisions.

## Independent review and corrections

- [Implementation](import-implementation.md): frozen runtime and 19 new integration regressions.
- [Entry/copy review](entry-review.md): fresh separately assigned reviewer; exact auth/selection and copy/privacy review, 71 passes.
- [Architecture/security review](saved-check-independent-review.md): separate reviewer; 117 passes across focused files.
- [Shared-home design](architecture.md): identifies non-activating read, actual identity links and scoped preparation dependencies; design only.

Review found an older-than-50 exact selector exclusion and a blank-header preservation mismatch; both were fixed with regressions. Root additionally checked the actual guest route and preserved its specific sign-in destination. Undo copy now states that changes to saved records also end its lifetime. No paid provider, production candidate mutation or external communication was used.

## Acceptance

Full suite: 1,290/1,290 in89 files; TypeScript; 12 hosting groups. Actual local signed-out app route and isolated chooser/browser mobile checks are documented in [release note](../../CHECK-CONTINUATION-RELEASE-2026-10-15.md). Production publication and integrity readback must be attached there before calling the slice shipped. No new numerical customer score is assigned. No complete hosted authenticated or unassisted customer journey is claimed.

## Next coherent work

One Applications home with side-effect-free existing-record reads; additive exact saved-check/pack/tracker links and honest independent read failures; exact chosen-vacancy preparation backed by server request identity; source-bound per-application composition and grouped review. Existing privacy/retention, original-loop parity, presenter and three-model review gaps remain tracked. Do not expand persona products or start another decorative redesign.
