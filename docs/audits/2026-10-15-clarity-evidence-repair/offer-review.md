# Independent current-offer and start-path review

Reviewed 2026-10-15. Scope: the coordinator's current diff in ProductPage, SubscriptionPricing, JobLoopOverview, Workspace, JobLoopPanels, CvCheck's final-step introduction, current-offer and public-site-meta. Runtime was read only. This is a bounded review, not a new overall score or live customer study.

## Verdict

No release-blocking finding in the reviewed offer/start-path changes. The homepage examples now affect the displayed example only, and the pricing/access surfaces offer the current free workflow instead of presenting unavailable purchases. The separate Job Loop import remains a product limitation and is now disclosed.

## Evidence and checks

- `src/pages/ProductPage.tsx:130`, `:136`, `:138`, `:151`: neutral `/check` starts; example selection updates the preview and announces that it changes the example only. The redundant audience setup cards have been removed. The added regression clicks all three examples and checks every rendered `/check` destination after each click.
- `src/pages/ProductPage.tsx:147` and `src/pages/JobLoopOverview.tsx:22`: account setup/import and the lack of automatic saved-free-check transfer are stated explicitly. This is a disclosure, not implementation of cross-workflow transfer.
- `src/pages/SubscriptionPricing.tsx:11`, `:20`, `:23`, `:25` and `src/lib/current-offer.ts`: the current offer is free check/download plus limited free cloud preparation. No speculative dollar prices, pack quotas, disabled checkout controls, or guaranteed daily AI allowance are rendered. The ten-account capacity statement is retained rather than converted into a personal entitlement.
- `src/pages/Workspace.tsx:707`, `:713`, `:942`: zero or unavailable entitlement disables new saved-pack generation and provides a neutral free-check link. It does not remove saved originals, approved downloads or manual tracking. Checkout imports and purchase controls are removed even if an entitlement reports billing configured.
- `src/pages/JobLoopPanels.tsx:41`: shared budget display becomes an availability message and free-check link. It does not change server budget limits. Optional AI availability is expressly not a personal allowance; rules-based preparation retains its own limits.
- `src/pages/CvCheck.tsx:458`: the final-step introduction describes preview/approval/download plainly; this one-sentence change does not remove the existing approval controls.
- `src/lib/public-site-meta.ts:4`, `:11`: home/pricing descriptions agree with optional saving and the current free offer.

Legacy proposal constants remain in `src/lib/subscription-plans.ts`, and legacy `PlanSelection.tsx` contains old prices. A source search found no active import of that page; `src/MvpApp.tsx:161` redirects its former route to `/pricing`. These files were not mistaken for a currently rendered offer.

## Test additions and results

Owned test updates:

- `src/__tests__/audience-and-pricing.test.tsx`: free offer assertions, no speculative quotas/prices or dead purchase buttons, and all three homepage examples leaving every check link neutral.
- `src/__tests__/workspace-journey.test.tsx`: retired checkout expectations replaced with no-checkout behavior even for configured Stripe/Paddle. Parameterized zero/unavailable entitlement cases exercise original-file download, approved PDF download, existing tracking, and the free fallback without creating a pack or starting checkout. The legacy checkout-success URL still cannot grant access.

Result: **2 test files / 19 tests passed**. Application TypeScript checking and scoped whitespace checking also passed. No runtime edits, Git operations, paid calls, production writes or publication were performed by this reviewer.

## Nonblocking wording note

“Separate account setup” can sound like a second account/login. Prefer “Separate Job Loop setup” and “Set up Job Loop in your account” while retaining the explicit import and no-transfer explanation. This is a comprehension hypothesis, not measured conversion feedback; sent to the coordinator for the small copy decision.

## Limits

Tests use local fictional data and mocked services. They verify rendered controls, destinations and calls in these components, not payment-backend shutdown, hosted authentication, actual file bytes or production download availability. Mobile visual quality, search ranking and real customer comprehension are not established by this run. The independent evidence algorithm and authentication-routing reviews belong to other reviewers.
