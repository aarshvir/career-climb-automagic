# Hosted API verification with private synthetic fixtures

Scope: the already deployed first-party Supabase project `gvftdfriujrkpptdueyb`, using its already published **anon** key and new synthetic email/password QA accounts only. This is an API verification, not a browser journey, CORS test, Google login, merchant test or deployment.

`scripts/verify-hosted-api.mjs` reads the publicly published frontend configuration at the reviewed GitHub raw URL, in process memory. It validates the exact project URL, decoded `role=anon` and matching project ref. Other roles/keys are rejected. It never reads a local `.env`, browser cookies/session storage, Google credentials, owner tokens, private keys, service-role keys or management credentials. The canonical Origin header is `https://jobvance.io`, already configured for the API; the test does not prove a newly published site's actual browser origin is allowed.

New accounts use unique reserved `example.com` addresses and strong random passwords. Passwords and returned sessions stay in process memory and are not printed or saved. If ordinary signup declines, returns no session or requires email confirmation, the script stops immediately. It does not weaken confirmation policies, use admin signup, request an alternate provider, retrieve inbox codes or call Google. Keep the resulting accounts/fixtures private; no permanent delete is performed.

If normal signup succeeds, the script checks the deployed free entitlement and disabled billing before uploading generated TXT content. It exercises one owned private upload and reviewed-text row, authenticated download/public denial, one grounded application pack, identical-request retry with one stored pack and one debit, approval, explicit synthetic tracker status and fresh API reload. Disabled checkout must return billing unavailable without a payment session. A second distinct synthetic account must be unable to read/edit the first account's records, download its private file, invoke the privileged credit RPC or write its own premium plan. No employer is contacted and no application is submitted.

Output is restricted to public project/origin information, constant check labels, counts, a non-credential QA fixture tag and sanitized status/error codes. It includes no email address, password, token, private row ID, response body or CV content. The fixture tag is stored in the QA accounts' metadata for later private reconciliation. Records remain private and retained as requested; any later cleanup requires a separate instruction.

Local validation before a hosted run:

```text
node --check scripts/verify-hosted-api.mjs
node scripts/verify-hosted-api.mjs --self-test
```

Authorized hosted run:

```text
node scripts/verify-hosted-api.mjs
```

Run only within the approved synthetic first-party QA scope. If automatic approval review rejects an action, stop and report that specific action/reason; do not use another authentication path or browser-session extraction to work around it. A network, signup, schema or handler failure leaves any already created private QA records in place and reports counts, rather than claiming completion or attempting destructive cleanup.

## Execution result

**Passed on 10 October 2026 at 15:35 Dubai time** (11:35 UTC), in approximately nine seconds. Local syntax validation and eight offline safety/self-tests passed before the authorized run. Automatic approval review allowed this specific synthetic first-party API test; no owner/Google login was initiated.

The hosted run passed 13 grouped checks:

- Published anon role/project configuration was validated; standard signup returned sessions for two distinct synthetic accounts without confirmation bypass, and both sessions matched their newly created accounts.
- The first synthetic account started with exactly one free pack and billing disabled. An anonymous entitlement request was denied.
- One generated private TXT upload and reviewed-text CV row were confirmed. Its owner could download it; the public download path was denied.
- The deployed tailoring handler saved one owned pack. An identical request returned the same pack; a fresh query showed exactly one persisted pack and the balance moved from one credit to zero.
- Approval and an explicitly synthetic tracker status update persisted and survived fresh API reads. This records a QA status; no real employer application occurred.
- The deployed checkout returned `BILLING_UNAVAILABLE` and no payment session.
- The second account could not read the first account's CV, pack or tracking rows; could not edit its pack; and could not download its private file.
- The browser role was denied access to the privileged credit RPC and to writing its own premium plan. A follow-up read confirmed its server-owned profile remained free.

Retained private QA state: **2 accounts, 1 uploaded TXT, 1 CV row, 1 application pack, 1 tracker row; 0 permanent deletes**. Non-credential fixture tag: `6f86754fc8a6d961`. Passwords, sessions, addresses, private row IDs and CV content were neither printed nor saved by the script. No service-role/owner credential, browser session, Google endpoint, merchant API or deployment operation was used.

This result is **backend API verification only**. It does not establish browser E2E, the new native site's actual CORS/redirect behavior, payment processing success, document rendering/export correctness or merchant/seller eligibility. The independently published frontend still needs its own browser journey check using its observed origin.
