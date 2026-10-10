# Free six-step CV-to-vacancy check

Requested and implemented on 11 October 2026. Public route: `/check`. The homepage, navigation, how-to, pricing and privacy pages link to and describe the new flow. Existing workspace records and commercial billing settings remain intact; billing is disabled.

## Customer journey

1. Choose the target role and optional employer.
2. Read a supported PDF, DOCX or TXT locally (5 MB maximum), or paste text. Correct extraction and remove private material before continuing.
3. Paste one real vacancy (80–20,000 characters).
4. Review literal vacancy and CV passages, their source locations, related wording and unresolved conditions. No numeric match/ATS/hiring score.
5. Edit the CV or add a truthful example after confirming the right to use it. Missing conditions remain questions; recheck the revised text.
6. Review the complete CV and vacancy, acknowledge factual/privacy review, approve, and generate a free PDF/DOCX/TXT and separate evidence report. A prepared-file link provides a manual save option. Optional sign-in and explicit cloud-save consent retain an immutable private check; a separate action can record the vacancy as Saved in Applications.

No account is needed for local analysis or approved downloads. Free checks do not call the metered pack-creation API or consume credits. No advertisements, employer submissions, outreach, analytics sharing, scraping or external AI calls were added.

## Evidence method and limits

`src/lib/cv-evidence.ts` extracts bounded English vacancy passages and compares phrases, explicit conditions and a limited alias vocabulary with actual CV passages. Every returned quote equals an exact input slice, with UTF-16 offsets and one-based CV line location. Counts describe wording findings: direct, related/partial, not located and manual review. They do not verify employment, completed qualifications, achievements or eligibility. Unknown conditions, unsupported scripts and overflow clauses stay visible for human review. Maximum 40 findings; additional vacancy text is retained in the report.

The engine treats assistance differently from leadership/management, skills lists differently from action examples, and negative/pending/study statements differently from completed credentials. Durations are not inferred from employment dates. Bullet prioritization preserves factual wording and section/role boundaries, leaving ambiguous continuations in place. The user must still read the whole vacancy and CV; employer-specific interpretation cannot be established by these rules.

## Privacy, approval and persistence

- Check content stays in memory by default. File extraction happens locally, and the original file is not saved by this flow.
- Only corrected/redacted source text enters the check. The final save preview shows the source CV, final CV, vacancy, role, company and method metadata that will be sent to the existing Supabase account.
- Approval binds all five inputs and the method version. Editing, changing account, clearing the check, or restoring/reopening a check revokes download/save approval. Asynchronous saves and exports discard results if revision or account changes.
- Email auth is embedded; password reset can leave the check open. Google requires specific consent to browser-tab draft storage. Restoration is allowed for 30 minutes; the tab copy is removed on return/clear/tab closure, and an expired copy is discarded when read. This is not a promise of a background timer physically erasing storage while the page is closed.
- New `cv_checks` snapshots have owner-only SELECT/INSERT/DELETE policies, forced RLS, server-controlled IDs/timestamps and no client UPDATE privilege. Request IDs reconcile retries. Existing data tables, pack entitlements and storage objects were not rebuilt.
- The additive migration `20261011000000_free_cv_checks.sql` was applied transactionally through the existing signed-in project dashboard and recorded in migration history. Live verification confirms RLS and forced RLS enabled, three owner policies, anonymous SELECT denied and authenticated UPDATE denied. A duplicate migration-history insertion during a later editor verification was rejected/rolled back; the already-applied migration was then independently verified with a read-only query.

## Verification

Baseline before changes: 166 tests. New tests cover actual evidence integrity/edge cases, free persistence and SQL privileges, document content, the six-step UI, privacy, approval invalidation and auth handoff. See `FREE-CV-CHECK-REVIEW.md` for the independent review and `FREE-CV-CHECK-HOSTED-QA.md` for the synthetic hosted test scope.

Live first-party hosted QA passed 19 groups on 11 October 2026 with fixture tag `86d198f2e11b1df5`: two standard synthetic accounts, two private checks, eight rejected writes, 22 bounded network requests, zero deletes/uploads/payments. Foreign read/write and anonymous access were denied; immutable snapshots survived fresh reads; credit balance was unchanged and billing stayed disabled. Fixture credentials and row IDs were not printed or saved. Synthetic records are retained privately.

Local browser QA read all three supported file types, removed a fictional confidential line before analysis, compared the actual test inputs, showed the support/ownership distinction, and checked the approval gate and current-review regeneration. At a 390 px browser viewport, evidence cards used two summary columns and single-column quote cards without horizontal overflow. PDF/DOCX/TXT preparation completed and exposed the correct prepared-file download attributes. The browser automation provider explicitly does not support capturing Blob downloads; final operating-system file capture could not be verified through it. Generator content/round-trip tests are the file-content evidence. Post-publication verification also exercised the live Save button with the browser’s existing signed-in session, retained one explicitly labelled fictional QA check, reloaded the page, reopened that saved check and confirmed download approval was cleared. Owner Google login was not initiated; mocked auth handoff tests establish that separate boundary. The saved-check list now shows loading until its read completes, rather than briefly implying an empty account.

Publication uses the existing Sites project and audience, followed by GitHub synchronization. Exact release commit/version/URL and final checks are retained in the adjacent private release evidence.
