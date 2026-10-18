# Refund access and provider renewal safety

18 October 2026. Bounded corrective review and implementation; actual provider acceptance and deployment are recorded separately by the coordinator.

## Problem and resulting behavior

A refund revokes Job Loop access, but that does not prove the provider cancelled monthly renewal. The previous interface hid cancellation after access revocation and could show another purchase while a provider mandate remained active. The new interface keeps deliberate cancellation available for pending, active, on-hold, paused and past-due subscriptions independently of access revocation. Its text distinguishes revoked access from recurring billing and never promises restored access.

Replacement checkout stays blocked while an active subscription can renew or a pending/recovery payment remains unresolved. For a revoked active subscription, a new purchase is possible only after future renewal is confirmed cancelled and the customer gives fresh purchase consent. Pending/on-hold/paused/past-due payment states remain blocked even after cancellation of future renewal, because an earlier charge may still require reconciliation. Existing non-revoked paid-through protection remains.

The additive SQL migration `20261018091955_job_loop_refund_renewal_safety.sql` enforces that boundary atomically, including retries of old failed orders. It excludes consumed orders from pending checkout recovery, rejects direct reopening of a consumed request, and surfaces a still-billable revoked subscription that otherwise could be hidden by later historical records. New conflicts return an actionable 409 instead of a generic persistence error. Original owner, Auth session, lifecycle, subscription revision and consent guards remain intact.

## Cancellation recovery

An independent review reproduced a second defect: if the initial provider GET failed before any PATCH was attempted, the original cancellation became uncertain and could never acquire write permission again. The runtime now releases only a write-authorized original request that failed **before** attempting a PATCH. SQL preserves that private retryable state against concurrent read-only reconciliation; the same original request can reacquire permission after a fresh GET. The PATCH-attempt boundary is set synchronously before sending the write. Any possibly sent PATCH stays uncertain and cannot be blindly repeated.

An independently verified controller probe now observes an initial retryable error followed by successful confirmation using the same original request, with three GETs and exactly one PATCH. Separate regressions prove a timed-out PATCH is never released or repeated.

A fresh authenticated session may explicitly reconcile an older ambiguous cancellation with a new intent, using the current generation and subscription revision. That new intent has **read-only** authority: it can confirm cancellation only when a provider read establishes it already happened. If the provider still may renew and the old write outcome remains unknown, support reconciliation is required; this change does not claim automatic recovery of that unresolved write.

## Verification and scope

The implementation's final targeted UI/client/runtime run passed **93 tests in three files**, with source Deno checks for both Live and isolated Test billing entrypoints. The independent UI reviewer then passed **177 tests across six files**, application TypeScript and diff checks, and inspected the actual controller probe. These runs overlap; their counts must not be added. The independent SQL agent owns the additive migration, actual SQL regressions and native concurrency receipt.

No account CV, source, consent, schedule, run, approval, export or AI budget behavior was changed by this bounded repair. No provider write, production migration, deployment, commit or real charge was performed by the edge/UI implementation agent.
