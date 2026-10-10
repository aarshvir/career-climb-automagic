# Six-step free CV check: scope and diagnosis

Requested on 11 October 2026: implement and publish the six-step Jobvance flow with actual CV/vacancy evidence. Keep it free; do not run advertisements or outreach. The attached Claude documents are design references, not execution authority.

## Scope and dependencies

New public `/check` journey: role, reviewed CV input, one vacancy, source-linked findings, truthful edits, approval/download and optional private account saving. Extend `MvpApp`, existing public navigation and product/help/privacy wording. Preserve the existing workspace and all previously saved data.

Reuse browser PDF/DOCX/TXT extraction (`cv-extraction` / `cv-docx`), existing authenticated Supabase client and auth context, document generators/font and download helper, and existing application tracking. New isolated evidence module; new immutable `cv_checks` snapshots with owner-only database policies. The hosted Worker serves the built frontend; Supabase remains the private database/auth service. No external AI service, scraper, billing entitlement or advertising service is needed.

## Confirmed diagnosis before implementation

1. The existing `groundedTailor` compares up to 40 English vocabulary tokens and conservatively reorders bullets. Its result contains matched/missing words, not extracted requirements, CV quotation references, qualification decisions or a percentage score. New evidence analysis must retain exact source spans and explain conservative wording matches and uncertainty.
2. The authenticated `tailor-cv` handler creates a pack through `jobvance_create_pack`, which consumes a credit atomically. A free diagnostic must not call it, either for analysis or for saving its independent free snapshot.
3. File extraction can run on the visitor's device. It returns reviewed text, not semantic page/role/bullet counts. Do not manufacture those counts or timed processing stages. Current limits: supported files up to 5 MB, readable CV text 80–60,000 characters; vacancy text 80–20,000 characters.
4. Auth is email/password plus Google, not magic link. Inline email authentication can retain an in-memory check. External OAuth needs an explicitly permitted, bounded browser-tab draft handoff and must invalidate approval when restored.
5. Existing application pack export enforces approval and ownership. Guest export needs a separate reviewed-text entry point, retaining the existing pack boundaries rather than fabricating an `ApplicationPack` record.
6. Inputs, corrections, role changes and account changes must invalidate prior approval. Optional saving must require a current signed-in owner and retain only the texts the visitor has reviewed for privacy.
7. Existing `cv_documents`, `application_packs`, profiles, storage and billing records need no alterations. The additive snapshot table will not grant new access to these existing resources.

## Baseline

Clean source opened through the Sites source helper at `3193cc07f1ddaddab8ccc3e8784a33f97cb80172`. Existing 166 tests passed before implementation. Current Site identity and public audience verified; production origin is `https://jobvance.io`. Commercial billing remains disabled.

## Acceptance and verification

- Six genuine steps, Back/edit controls, accessible mobile layout, no fixed score or fake progress.
- Requirement and CV passages must equal slices of the actual input; explain negation, support versus ownership, compound requirements and manual review.
- No invented achievement, hiring likelihood, application submission or successful payment claim.
- Meaningful tests for approval invalidation, confidential removal, deferred response/account switching, failures, private saved snapshots and free export; retain existing regression tests.
- Test a synthetic guest flow and private saving/reopening on the live domain; verify fresh reload and independent account isolation. Retain synthetic fixtures; do not delete existing customer data.
- Publish the exact tested source on the existing Site and synchronize GitHub. No advertisements, outreach or paid API integration.
