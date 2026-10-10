# Single-file Supabase dashboard sources

These JavaScript files are generated from the reviewed TypeScript handlers and shared logic. They preserve the pinned public Supabase import and inline local modules so the signed-in dashboard editor needs no relative filesystem imports. They contain environment variable names, never credentials or account tokens. Deploying them is a separate action; generating them changes no remote project.

For the **free beta**, use `tailor-cv.js` and `get-entitlement.js`. `create-checkout.js` may be installed as an explicitly disabled purchase endpoint. `paddle-webhook.js` and optional `stripe-webhook.js` are future/sandbox integrations and are unnecessary for a free-only launch. Keep `JOBVANCE_BILLING_ENABLED=false`; seller, commercial and merchant review flags remain absent/false.

The retirement bundles are `trigger-make-run.js`, `check-email-provider.js`, and `lemon-squeezy-webhook.js`. Each performs no network/database work and returns 410. Their local config disables them and enables platform JWT verification. An already-deployed endpoint must still be deleted or explicitly replaced through the reviewed dashboard workflow; local `enabled=false` does not change a remote deployment.

In the intended restored or staging Supabase project, choose **Edge Functions → Deploy a new function → Via Editor**. Use the exact filename stem as the function name (for example `tailor-cv`). Paste the complete matching `.js` file into the editor's entry file. The code is valid JavaScript inside an `index.ts` entry. Before deployment, set the function's platform JWT verification to match `supabase/config.toml` (`false` for these handlers): user handlers verify with `getUser` internally; webhooks verify provider signatures. Verify the actual setting in that project's interface. The local TOML is not automatically applied by copying editor content. Review the rendered code and diagnostics before clicking Deploy. [Supabase dashboard guide](https://supabase.com/docs/guides/functions/quickstart-dashboard).

Apply the new migration through the SQL editor before testing these handlers, as described in `../MVP-BACKEND-DEPLOYMENT.md`. No browser token extraction, service-key copying into scripts, CLI login or merchant key is needed for the signed-in **free-beta** dashboard procedure. Keep the built-in server credentials inside Supabase. Use the application to sign in as a synthetic test user; do not extract that session's bearer token for shell testing.

The dashboard guide states that editor changes have no built-in version control/rollback. Preserve the reviewed local source, applied migration version and deployment record. If an existing function is being replaced, download/save its current source through the dashboard first. A function created or edited in the dashboard is not evidence that the entire application journey works: complete the free-beta hosted checklist and inspect function logs for public error codes.

Regenerate after **any** shared/core or handler change. A pinned, repeatable builder generates all eight bundles, writes SHA-256 artifact/source hashes in `manifest.json`, and optionally tests the generated handlers:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-supabase-ui.ps1 -Verify
```

Alternatively, with Deno 2.9.6, run once per function name:

```text
npm exec --yes --package deno -- deno bundle --platform=deno --external=https://esm.sh/@supabase/supabase-js@2.57.4 --output docs/supabase-ui/tailor-cv.js supabase/functions/tailor-cv/index.ts
```

Replace `tailor-cv` in both paths with the other desired name. The bundler reports itself experimental; the generated artifacts therefore have their own hermetic handler verification, in addition to the source tests. To rerun those checks in PowerShell:

```powershell
$env:JOBVANCE_TEST_UI_BUNDLES = 'true'
npm exec --yes --package deno -- deno test --allow-env supabase/tests/edge-auth.deno.ts
Remove-Item Env:JOBVANCE_TEST_UI_BUNDLES
```

These tests intercept every API request. They do not deploy functions, access the restored project, send CVs, or use real merchant accounts. Before replacing an existing deployed function, use the dashboard's source view/download to preserve a private backup outside version control. Do not publish old source that could contain embedded credentials; never extract browser tokens.
