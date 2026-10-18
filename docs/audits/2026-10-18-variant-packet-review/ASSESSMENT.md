# Variant packet review source correction

18 October 2026. Prepared and validated locally; **not committed or deployed by this work**. Job Loop remains the primary product. No backend, schema, payment, media or advertising change accompanies this correction.

## Problem and reproduction

The global career profile and an independently saved CV variant have separate revision counters and fact stores. `job_loop_resolve_cv_selection_bound` projects the chosen variant's revision as the preparation profile revision, and projects independent facts as `vf_<fact UUID>` (migration `20261017130000_job_loop_variant_execution.sql`). The browser's packet guard instead compared every packet to the global profile revision and global claim list.

Consequently, the ordinary sequence “save global profile revision 2 → create variant revision 1 → prepare a packet using that variant's independently confirmed fact” could produce a valid server-bound packet whose browser preview, approval and downloads stayed disabled. The page also incorrectly said the independent source fact was no longer available. The fallback page-count check used the unrelated global page preference.

A new real-`JobLoop` integration case was run against the unchanged page before the fix. It failed on the enabled-preview expectation for global revision 2 / variant revision 1. After correction, the same case opens the exact preview, requires both review confirmations, approves the exact packet and downloads it through the existing client contract.

## Correction

The browser resolves variant packets against fresh owner-checked current variant metadata and independent facts through the existing passive `read_cv_variants` / `read_cv_variant_facts` contracts. It checks the exact variant ID/revision/source hash, lifecycle generation, complete workspace record version, selected fact revisions, literal source eligibility, confirmation, withdrawal and sharing permission. Inherited global claims retain their current global revision/permission and CV-passage-source checks. The resolver uses the existing fact-validation helper; it does not infer eligibility from packet text.

Reads are fenced to the original owner/auth authority/lifecycle/record version, ignore late results after owner departure and return, and never initialize a record or restore preparation consent. Only the currently owned variants referenced by packet history are read: one bounded variant-list request and at most three fact-list requests. Source metadata failure or mixed record versions fail closed with a refresh instruction.

Legacy packets without a CV selection continue using the global profile/claim guard. Review source references and interview evidence resolve through the packet's own current source. The fallback page-count preference comes from the selected variant. Existing packet holds, explicit factual/shareability review, exact approval, owner/session, preview/download cancellation and server authority checks remain in place. Historical packets are retained; unavailable or changed sources remain blocked.

## Validation

- **3,095 tests passed across 164 actual test-result files**, zero failed or pending. The raw JSON's nested-suite count is not reported as a file count.
- **74 focused tests across four files passed**, including 14 new variant review regressions and existing journey, variant integration and preparation tests.
- New negative cases cover current variant revision/source-hash changes, fact revision/withdrawal/confirmation/shareability, inherited global withdrawal, stale owner-return reads, cached-preview revocation, metadata-read failure/recovery, mixed record versions and legacy global behavior. Seven negative cases await the definitive settled source warning and absence of the loading/read-error state before asserting that controls stay disabled; they cannot pass solely because a read started.
- Application TypeScript passed. `git diff --check` passed.
- The production pipeline validated public configuration, built the Vite frontend, and prerendered **38 public pages / 20 guide articles / 58 structured-data hashes**, with zero external requests during prerender. The first host-packager attempt encountered the previously observed OneDrive symbolic-link guard failure. Inspection of **139 actual entries (134 files, 5 directories)** using dirent, `lstat` and `readlink` found zero links. Retrying the **unchanged** packager completed: 132 assets, 8,596,954 worker bytes, **2,910,135 compressed bytes** below the 3,145,728-byte limit. No guard was removed or weakened. The initial full build command's exit was nonzero; all pipeline stages completed through that bounded packager retry.
- All **12 hosting groups** passed with the completed artifact: security/structured-data policy, private routes, actual public content, redirects, real not-found behavior, exact asset bytes/MIME, caching/ETags, HEAD, private/missing paths, unsafe methods, Site identity and compressed size.

The independent review found the negative-test pending-state gap; it was corrected before the final full-suite run. Validation details and exact working-source/artifact hashes are in `verification.json`.

## Rollback and release boundary

Annotated tag `jobvance-before-variant-packet-review-2026-10-18` is preserved at the pre-change HEAD `51f1402e88ebd95f0f0c262b9f0a647e8c6b9432` and pushed to the configured GitHub remote. Public v48 is retained: runtime source `e37c19f5b0208139e1d3cf01d67643e24f371a12`, saved version `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_7921fa6a21848191a550ca466a5bb8b4`; its release receipt remains authoritative. This source rollback is not database/file restoration.

No hosted acceptance, live HTTP readback, fresh native PostgreSQL/Deno run, provider/search call, production candidate mutation, paid usage or media/advertising action was performed. Existing server authorities were inspected but not changed. The additional passive reads introduce a network-availability dependency; failures deliberately block source use until current verification succeeds. Local tests and packaging do not establish production success or a usability/NPS uplift. The coordinator must review and release the bounded site change separately.
