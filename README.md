# Jobvance

Jobvance is an application-preparation workspace. Users upload and review a CV, compare its existing experience with a real job description, approve and download the resulting document, and record their own application progress.

The current release is a **free beta with live payments disabled**. Guest CV checks and reviewed downloads are free. The private Job Loop has ten pilot seats, reusable confirmed career facts, limited employer discovery, scheduled preparation, exact document review, follow-ups and activity history. Rules mode works without a paid AI service. Candidates approve documents and submit applications themselves.

## Independent source and hosting

This repository contains the frontend, backend functions, additive database migration, document parsing/export code, automated checks and deployment documentation. It can be developed and hosted independently of Lovable. No builder account, preview auth broker or builder-specific runtime is required.

The frontend is a portable static application. Supabase remains its authentication, database and private-storage backend; changing the frontend host does not migrate or delete existing accounts and files.

The independent frontend is hosted at [Jobvance.io](https://jobvance.io), using the existing Supabase backend. The integrated release scope, observed checks and operating procedure are in [the implementation contract](docs/INTEGRATED-JOB-LOOP-CONTRACT.md), [validation](docs/INTEGRATED-JOB-LOOP-VALIDATION.json) and [pilot operations](docs/INTEGRATED-JOB-LOOP-OPERATIONS.md). Historical cloud evidence and the [11 October audit](docs/audits/2026-10-11/README.md) describe the earlier release; those scores are a baseline, not a score for these changes.

Students, MBAs and experienced professionals have distinct starting pages at `/for-students`, `/for-mba` and `/for-career-switchers`. Proposed future prices are Free Starter, Focus at $15/month and Job Loop at $29/month; there is no purchase or automatic conversion. All available pilot features remain free. The shared AI/search ledger cannot reserve more than $50 in a UTC calendar month; other products, hosting bills and domain renewals are outside that ledger. See [the pricing review](docs/SUBSCRIPTION-PRICING-REVIEW.md).

## Stack

- React 18, TypeScript, Vite and React Router.
- Tailwind CSS and shadcn/Radix interface components.
- TanStack Query for account-scoped workspace data.
- Supabase Auth, Postgres with row-level ownership policies, private Storage and Deno Edge Functions.
- PDF.js and local DOCX/TXT parsing; reviewed PDF, DOCX and TXT exports.
- Vitest/Testing Library, ESLint, TypeScript and isolated PostgreSQL/edge-handler tests.

Paddle is the prepared default payment adapter; Stripe is an optional adapter. Both remain unavailable for real-money purchases in the free beta. Payment-provider code is separate from the CV workflow.

## Run locally

Use **Node 24**, or Node **22.13 or newer within the 22.x series**, and npm. Install from the checked-in npm lockfile:

```sh
npm ci
npm run dev
```

The development server uses [http://127.0.0.1:8080](http://127.0.0.1:8080).

Create an ignored `.env.local` file using the names in `.env.example`. Supply the public configuration for your intended Supabase project:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Optional `VITE_SUPPORT_EMAIL` sets the published support contact. `VITE_PADDLE_CLIENT_TOKEN` is a public client token for an explicitly configured future sandbox checkout; it is not needed for the free beta.

Public pages still render when backend configuration is missing, but sign-in and account services show an unavailable state. This is a configuration failure, not a demo account. The production build intentionally rejects missing or privileged frontend settings.

Only public Supabase/paddle client values belong in `VITE_*` settings. Service-role keys, payment API keys and webhook secrets stay in Supabase's server-side settings. Never commit `.env`, `.env.local`, private backups or secret values.

## Build and verify

```sh
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

The production build validates frontend settings, generates the public sitemap and writes static output to `dist/`. The preview server checks that build locally; it does not publish a website. `build:dev` is a development-mode build and should not replace the production validation gate.

Backend SQL tests use an isolated fixture, not your hosted database:

```sh
npm run test:run -- --config supabase/tests/vitest.backend.config.ts
```

Native edge-handler checks and their limits are described in [backend deployment guidance](docs/MVP-BACKEND-DEPLOYMENT.md). Unit/fixture tests do not establish hosted auth, file isolation, mail delivery, domain configuration or merchant approval.

## Source map

| Location | Responsibility |
|---|---|
| `src/main.tsx`, `src/App.tsx`, `src/MvpApp.tsx` | Startup, shared providers and active routes |
| `src/pages/Workspace.tsx` | CV upload/review, tailoring, approval, downloads and application tracking |
| `src/pages/JobLoop.tsx`, `src/pages/JobLoopPanels.tsx` | Private career record, preparation queue, schedule, actual progress and support |
| `src/pages/AudienceLanding.tsx`, `src/pages/SubscriptionPricing.tsx` | Audience-specific entry and free/proposed access tiers |
| `src/pages/ProductPage.tsx` | Public product, help and policy pages |
| `src/contexts/AuthContext.tsx`, `src/utils/auth*` | Auth state, signup, callback and recovery behavior |
| `src/integrations/supabase/` | Standard Supabase client and frontend configuration validation |
| `src/lib/cv-*` | CV types, parsing, storage and explicit import of legacy originals |
| `src/lib/document-*` | Export formats, downloads and the bundled font/license |
| `src/lib/workspace-api.ts` | Typed requests, ownership filters and access availability |
| `src/lib/payment-checkout.ts` | Optional provider-specific browser checkout |
| `supabase/functions/` | Authenticated tailoring/access and disabled-by-default payment adapters |
| `supabase/migrations/20261010000000_grounded_application_mvp.sql` | Reviewed additive MVP schema, ownership and credit controls |
| `src/__tests__/`, `supabase/tests/` | Frontend and isolated backend checks |
| `docs/` | Repair contract, verification status and backend deployment instructions |

Legacy source and historical research remain for reference. The active app starts through `MvpApp`; historical marketing plans and old dashboard implementations are not the current product contract.

## Supabase backend setup

Follow [MVP backend deployment](docs/MVP-BACKEND-DEPLOYMENT.md) against the intended project and its actual migration history. The required free-beta functions are `tailor-cv` and `get-entitlement`. They validate sessions on the server. The new `cv-documents` bucket is private, with per-account folders, supported PDF/DOCX/TXT uploads and a 5 MB limit.

Apply only the reviewed additive migration after checking whether it is already installed. Do **not** replay `0000_init_schema.sql`, reset an existing database, or run the legacy `setup-db` scripts to migrate the production project. Those historical paths are not the new release procedure.

Set `APP_URL` and `ALLOWED_ORIGINS` to the actual independent frontend origins. In Supabase Auth, set the correct Site URL and allow the actual domain's `/auth/callback` and `/auth/reset` redirects, plus intended local/staging origins. Configure email delivery and Google OAuth separately; use a full browser tab for Google sign-in. Supabase handles PKCE sessions without a preview editor.

Keep `JOBVANCE_BILLING_ENABLED=false` for this beta. Existing disabled/retired automation endpoints must not be restored from historical patches. Backend source and the prepared dashboard-editor bundles in `docs/supabase-ui/` are available without a builder; the hosting change does not require new frontend framework code.

## Publish the frontend independently

1. Choose a static host and connect the intended source repository/branch, or upload the validated `dist/` artifact.
2. Configure the two public Supabase variables in that host's **build** environment. Run `npm ci` and `npm run build`; publish `dist/`.
3. Serve existing assets directly and route application paths such as `/dashboard`, `/auth/callback` and `/auth/reset` to `index.html`. The build also generates the standalone Cloudflare Worker in `dist/server/index.js`, embedding the frontend and enforcing the reviewed response headers in `vercel.json`. This configuration file is reused as a portable policy, without a Vercel runtime dependency. `node scripts/check-host-worker.mjs` verifies the built Worker. Other static hosts can serve the frontend output with equivalent routing and headers.
4. Add the exact new origin to Supabase's allowed origins and auth redirects. Test the independent preview before changing DNS.
5. Connect `jobvance.io` through the host's custom-domain flow, then update the required records in Hostinger. Confirm HTTPS, asset delivery and direct refreshes of nested routes.
6. Verify two synthetic accounts, signup/confirmation, recovery, upload, one free pack, approval, all export formats, tracking and reload. Keep live purchases disabled.

The frontend deployment, backend deployment and DNS cutover are separate changes. Publish and verify the intended source revision; a successful build alone does not complete any of them.

## Further documentation

- [Active user-request tracker](docs/USER-REQUEST-TRACKER.md) — reconciles chat instructions, shipped evidence, remaining implementation and standing constraints; read before resumed work.
- [Twenty-role audit and prioritized product plan](docs/audits/2026-10-14-20-role-review/CONSOLIDATED-REVIEW.md) — 14 October 2026 review; recommendations remain backlog work unless separately recorded as implemented.
- [Repair contract](docs/MVP-REPAIR-CONTRACT.md)
- [Auth repair and redirect requirements](docs/AUTH-REPAIR.md)
- [Backend deployment and verification limits](docs/MVP-BACKEND-DEPLOYMENT.md)
- [Release status](docs/MVP-RELEASE-STATUS.md)
- [Independent hosting and domain cutover](docs/INDEPENDENT-HOSTING.md)
- [Actual hosted API checks](docs/HOSTED-API-VERIFICATION.md)
