# Account and startup repair

Implemented 10 October 2026 against the existing working tree, whose original changes are preserved in `docs/pre-repair-working-tree.patch`.

## Result

- Public pages can import the application even if frontend Supabase settings are missing, malformed, or use a server-only key. The exported `configurationError` supplies a clear sign-in error. An inert `.invalid` client makes no requests and does not persist or invent sessions. Publishing still needs the primary build/deployment configuration gate.
- Authentication no longer probes a hardcoded Supabase host or enumerates email accounts/providers. Email sign-in, signup and password recovery call the supported SDK APIs directly.
- Signing in no longer upserts profiles with `plan: free`. Database signup triggers own initial profiles; server-owned billing retains control of entitlements.
- Signup with email confirmation returns `requiresEmailConfirmation: true` as a successful next step. The interface displays confirmation instructions without claiming a session exists.
- Auth state subscription is registered before initial restoration, ignores stale reads after newer auth events, and unsubscribes on unmount. SDK calls do not run inside the auth-change callback.
- The client uses `flowType: pkce` and `detectSessionInUrl: true`. Callback and recovery screens await the SDK's cached initialization and session read, avoiding duplicated one-time code exchanges and arbitrary delays. Legacy hash-based sessions remain handled by the SDK. Password recovery no longer requires raw tokens in the query string.
- Invalid recovery sessions cannot update a password. Signup and password change use the same password validation. Google sign-in within an iframe gives an explicit full-tab instruction.
- Sign-out uses local scope, preserves other sessions, reports SDK failures, and clears only the current account's legacy application cache after success. The active workspace must clear its query/view state on account changes.

## Files

`src/contexts/AuthContext.tsx`, `src/pages/Auth.tsx`, `src/pages/AuthCallback.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`, `src/utils/authUtils.ts`, new `src/utils/authSession.ts`, `src/integrations/supabase/client.ts`, new `src/integrations/supabase/configuration.ts`, and two tests under `src/__tests__/auth/`.

Three pre-existing type errors were also fixed, with the primary agent's permission, by spreading profile/plan context into logging arguments at `src/contexts/PlanContext.tsx:72,105` and `src/utils/planManager.ts:167`. No App/header/package/migration/production settings were changed by this agent; main.tsx needs no change because its import chain no longer throws for missing configuration.

## Validation

- Auth/bootstrap tests: **18 passed in 2 files**, including a stale-session race, no profile writes, confirmation-required signup UI, provider-free password reset, initialized recovery session, blocked anonymous password update, actual password update, SDK callback initialization order, sign-out failure, scoped cache cleanup, frontend key rejection and inert-client bootstrap without network calls.
- Actual app type check: `tsc --noEmit -p tsconfig.app.json` **passes** as of these edits.
- Scoped authentication lint: **0 errors, 1 Fast Refresh warning** for exporting the existing context hook and provider together.
- No live user account, CV upload, billable API request or production deployment was performed. The primary agent owns whole-app build/browser/server/payment validation.

## Deployment requirements

Configure frontend public Supabase URL and publishable/anon key during the build. Configure the Supabase Site URL and allowed redirects for `/auth/callback` and `/auth/reset` on the actual domain plus approved staging domains. Enable the intended email-confirmation policy and mail delivery, and configure Google OAuth before advertising it. PKCE email links should be opened in the browser that requested them; the UI says so. Actual mail delivery, OAuth allowlisting and live authentication remain release checks with the connected backend.

References checked: [Supabase PKCE flow and automatic URL detection](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [email signup](https://supabase.com/docs/reference/javascript/auth-signup), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), and [sign-out scope](https://supabase.com/docs/reference/javascript/auth-signout).
