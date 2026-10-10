# Free CV check — bounded hosted API verification

This script checks deployed database permissions and free-flow persistence, separately from guest browser testing. It does not prove CV analysis quality, browser downloads, email delivery or payment processing. Run only for the explicitly authorized first-party Jobvance project after the additive `cv_checks` migration is applied.

## Exact scope

- API origin: `https://gvftdfriujrkpptdueyb.supabase.co`; browser Origin header: `https://jobvance.io`.
- Public configuration comes only from the existing reviewed repository branch or its `main/.env.production`. The URL must match the exact project, and the published legacy JWT must have the `anon` role and matching project reference. Service-role/secret keys are rejected, even if published accidentally.
- Creates at most two fresh `example.com` synthetic accounts using standard signup. Passwords and access tokens remain only in process memory; they are never logged, saved or passed in command arguments. An ordinary auth `/user` request confirms each fixture identity.
- Stops on signup refusal, missing session, email confirmation requirements, unexpected credentials, failed checks or network errors. There is no confirmation bypass, admin operation, owner login, existing-user login, Google login or browser-session import.
- Allowed API paths are exactly `/auth/v1/signup`, `/auth/v1/user`, `/rest/v1/cv_checks` and `/functions/v1/get-entitlement`, with a fixed method allowlist. Every read is scoped to known freshly created fixture users/rows. Query keys, selected columns and payload sizes are bounded; redirects are rejected.
- Creates two private synthetic approved snapshots. Probes duplicate request uniqueness and reloads the existing row. Invalid-size insert probes, owner update denial, foreign read isolation, foreign owner-impersonation insertion denial, foreign update denial and anonymous read denial exercise the live boundary.
- Reads entitlement once before and once after. Credits must remain unchanged and billing must remain disabled. It calls no credit-consumption, pack-generation, checkout or payment endpoint.
- No CV file upload, external CV transmission, employer application, email outreach, customer record read or permanent deletion. All fixture snapshots and accounts are retained for later authorized reconciliation. Failed denial checks can leave additional synthetic records, so inspect the sanitized result rather than assuming only the intended two writes occurred.

## Commands

Offline guard checks, with **zero network requests**:

```powershell
node scripts/verify-free-check-hosted.mjs --self-test
```

Authorized hosted checks using the previously reviewed public branch configuration:

```powershell
node scripts/verify-free-check-hosted.mjs
```

To read the same repository's public main configuration instead:

```powershell
node scripts/verify-free-check-hosted.mjs --config-source=main
```

No credentials or alternate hosts are accepted as flags. No browser-account mode is included: guest browser verification remains independent, and the script never persists a password for browser reuse.

## Approval scope wording

If network execution requires a sandbox approval, use a narrowly scoped explanation: “Run the authorized first-party Jobvance free-CV-check verification against the fixed Supabase project using its published anonymous configuration. Create two fresh synthetic example.com accounts and retain private QA snapshots; test owner isolation, immutable snapshots, server length limits and unchanged free credits. No customer data, existing credentials, email sends, applications, payments or deletion.”

The script's result contains sanitized counts, fixed check labels, status and a non-credential fixture tag only. It never prints response bodies, CV text, addresses, passwords, tokens or private record IDs. A stopped run is incomplete evidence; rerunning uses new synthetic accounts rather than an alternate authentication route. Run the browser guest journey separately to validate upload/text extraction, requirement review, approval revocation and PDF/DOCX/TXT downloads.
# Executed result

Passed on 11 October 2026 using `--config-source=main`: 19 grouped checks, 22 bounded network requests, 2 fresh synthetic accounts, 2 immutable private snapshots, 8 rejected writes. Cross-account and anonymous access were denied, fresh reads preserved the snapshots, credits were unchanged and billing remained disabled. No file uploads, payments, outreach or deletions occurred. Credentials and private row IDs were not printed or persisted. Retained fixture tag: `86d198f2e11b1df5`.

