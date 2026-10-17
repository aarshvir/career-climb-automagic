# Dodo integration — 17 October 2026

The owner authorized Claude's Dodo integration, deployment, keeping payments available, and US marketing preparation. This supersedes the earlier no-checkout instruction. Claude branch `claude/dodo-payments` was fast-forwarded at `c91243b4b14c25ea1452e8cc6e45c3e9f5352bf8`.

## Delivered scope

The integration sells one-time CV Check passes ($9, $19, $39). It does not implement the proposed recurring Job Loop plans. The page keeps Job Loop primary and labels those recurring plans as proposed. The unsupported “Most popular” label was replaced with “30-day pass”.

The variant editor now requires an explicit backend capability before it appears. This prevents unpublished variant actions being shown against the existing live control/worker. The underlying source remains available for coordinated completion; no global CV swap or partial variant schema exposure was introduced.

Only the Dodo provider and tailoring-pass migrations were applied (production versions `20261017110523` and `20261017110527`). Function deployments: `tailor-for-job` v3, `create-checkout` v6, `dodo-webhook` v1, `get-entitlement` v7, all with gateway JWT verification disabled and their source authorization/signature checks retained. Control16, worker12 and OAuth5 were not redeployed. Variant migrations remain unapplied.

## Verification and limits

- Full local suite: 2,417 tests in 134 files passed after the capability gate; app TypeScript passed. Final badge-copy change passed all 21 pricing/audience cases.
- All four payment function entrypoints passed Deno type checking. Final production build and 12 hosting groups passed.
- Runtime edge readback matched uploaded source files. Supabase omitted the uploaded type-only `src/lib/admin-types.ts` dependency from the tailor bundle; the seven runtime files matched.
- New pass tables have RLS and no anonymous/authenticated direct read permission. Five changed billing/tailoring routines are service-only with fixed search paths.
- Live unauthenticated checkout/entitlement requests reject with 401; invalid tailoring rejects with 400. No paid provider request or real candidate mutation was used as a test.
- Actual Dodo dashboard showed Test Mode and overall merchant review pending. The live webhook probe reported payment processing disabled (503). No merchant approval, environment switch or secret was invented or changed. Payment acceptance is therefore NOT certified by this deployment.
- No real checkout, settlement, refund, authenticated hosted first/second Job Loop task or unassisted acceptance is claimed.

## Remaining backend work

Three implementation agents stopped at the account usage limit. Their incomplete recurring/variant work is preserved in Git stash `preserve interrupted recurring backend before Claude Dodo integration`; it is not part of this release. Immutable variant/fact selection through admission, schedule, worker and packets, weekly/three-times-weekly/daily entitlement semantics, recurring AI consent and full hosted acceptance remain open. Do not expose the stored partial work or represent the proposed plans as purchasable recurring service.

Rollback tag `jobvance-before-recurring-product-completion-2026-10-17` and saved v32 are retained. Source rollback does not restore database state; preserve billing events, pass grants and usage commitments.

Exact deployment and private pre/post sources are recorded outside the repository in `jobvance-repair-evidence/dodo-launch-release-receipt.json`. Marketing scripts and the US $10/day, seven-day/$70-cap draft are in the sibling `jobvance-marketing-launch` folder. No marketing account connection, advertising spend, posting or outreach execution is claimed.
