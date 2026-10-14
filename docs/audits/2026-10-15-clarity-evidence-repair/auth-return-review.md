# Signed-out workspace tab return repair

Date: 2026-10-15. Scope: legacy workspace route continuity through sign-in only.

## Defect and bounded repair

The existing `/applications` alias correctly redirected to `/dashboard?tab=tracker`, but `ProtectedWorkspace` replaced that destination with `/auth?next=%2Fdashboard` for a signed-out visitor. The CV, tailoring and billing aliases had the same loss. In addition, the shared account-return allowlist accepted Loop and administration routes but did not retain workspace tabs for a Google callback.

`src/MvpApp.tsx:33` now derives the sign-in destination from a fixed workspace-tab normalizer. `src/lib/account-return.ts:7` adds exactly `/dashboard` and its `cv`, `tailor`, `tracker`, and `billing` tabs to the existing account-return allowlist. The normalizer retains one valid tab and discards unrelated query and fragment data; missing, repeated or unsupported tabs fall back to `/dashboard`.

The existing email sign-in effect (`src/pages/Auth.tsx`) and successful Google callback (`src/pages/AuthCallback.tsx`) already use this helper. Neither authentication page needed runtime edits. Google return state remains a single-use, 30-minute session-storage entry containing a fixed path and expiry only. It carries no candidate document, account identity, authorization, arbitrary URL or token.

The normal signed-in destination remains `/dashboard`. This repair does not introduce a unified home, alter workspace tabs, or grant access. `ProtectedWorkspace` still waits for resolved authentication and keys the mounted workspace by the authenticated user's ID. Loop/admin allowlists and the separately consented `/check` handoff remain intact.

## Verification

`src/__tests__/auth/workspace-return.test.tsx` exercises the actual App router, Auth page and callback with synthetic local authentication responses. Its 18 cases cover all seven existing legacy aliases; email and Google return to each of the four tabs; auth-loading behavior; stripping unrelated query/fragment data; the unchanged default destination; and rejection of an arbitrary email return URL. The workspace body and surrounding chrome are isolated so no candidate records or external services are accessed.

`src/__tests__/lib/account-return.test.ts` adds two focused cases for the fixed workspace allowlist, single-use/expiry behavior, tampered destinations, ambiguous tab requests and query normalization. The existing Loop, administration and check-return cases remain.

Final scoped result: **49/49 tests passed across four files** (`account-return.test.ts`, `workspace-return.test.tsx`, `check-auth-handoff.test.tsx`, `auth-flow.test.tsx`). App TypeScript passed. Scoped diff whitespace validation passed. The test fixture initially required the real query-provider implementation because the global test setup's QueryClient mock is not constructible; this was corrected in the new test file only.

## Limits

These are local routing/authentication regressions with synthetic SDK/session responses, not hosted email delivery or live Google-provider tests. The Google return uses existing same-tab session storage; blocked storage or a callback opened in a different browser context can still use the safe default. New-tab email confirmation continuity is not added by this change. No database, provider configuration, payment, deployment, Git commit or Git push was performed.
