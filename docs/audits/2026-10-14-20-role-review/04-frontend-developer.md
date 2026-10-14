# Frontend Developer review — 77/100

Scope: React routes, state ownership, forms, authentication handoff, document review/download, and private Job Loop continuity. Source snapshot: e661c6493c30c88f2487800ff38aa10c46c9aae6; published runtime reference: 57713fb1cb15b29be8d6dc745e3c87bcb718c4af. This is a frontend readiness judgment, not a product certification. Confidence: medium. The live site, private accounts, browser accessibility and device performance were not exercised.

I independently traced /check from role selection through source extraction, evidence, editing, exact approval and downloads, then followed reuse, account saving and recovery. I traced /loop profile/claim ownership, polling, packet review, downloads and opportunity tracking. Evidence below distinguishes source inspection from synthetic component observations. No runtime files, services or private data were changed or accessed.

The existing direction is sound. MvpApp lazy-loads working routes; document generation and PDF/DOCX reading load heavy libraries on demand. The guest check separates source and reviewed text and binds approval to all relevant input text (check-draft.ts:124). Job Loop guards asynchronous results by owner, generation and packet hash, aborts obsolete downloads, and keeps approval separate from external processing consent (JobLoop.tsx:238, 306). Labelled fields, status/alert regions, wizard heading focus, shared UI controls and substantial journey tests are useful foundations. A replacement framework or separate experience for each audience would add cost without addressing the observed problems.

| Readiness criterion | Score / 20 | Evidence |
|---|---:|---|
| State ownership and preservation | 11 | Recovery and reuse exist, but two reproduced editing losses and an omitted tracking-draft class remain. |
| Async and authentication correctness | 16 | Strong owner/version guards in Loop; /check recovery runs before auth ownership is known. |
| Accessible forms and navigation | 17 | Explicit labels, error association and focus handling; keyboard/screen-reader behavior needs browser verification. |
| Component architecture and testability | 16 | Pure evidence/storage modules and journey tests; wizard transitions span many independent setters. |
| Loading and render efficiency | 17 | Route/library splitting and bounded text inputs; no mobile profiling or bundle timing measured. |

## FE-01 — P1: Signed-in refresh recovery is deleted during authentication bootstrap

**Observed in a synthetic component test; source-confirmed chain.** AuthContext.tsx:41 initializes session to null and line 42 marks authentication loading. /check renders immediately; CvCheck.tsx:98 reads recovery using that null owner. check-draft.ts:107–108 deletes stored recovery when its actual owner differs. CvCheck.tsx:225 also writes the empty initial draft; its initializer never reruns when authentication resolves.

Reproduce: as a fictional signed-in owner, retain a partially completed check with explicit refresh consent; remount with user=null/loading=true; then resolve the same owner. The draft, role and opted-in storage are already gone. This undermines an explicit continuity promise for students, MBA applicants and professionals returning to long edits. It affects unsaved local work; saved account checks are separate.

Change: make recovery hydration a one-time, ownership-aware transition after authentication settles. Prevent retention effects from writing until hydration completes; keep unauthenticated guest checks immediately usable. Do not weaken owner isolation. **Accept:** delayed same-owner bootstrap restores the exact draft and preference, different-owner bootstrap does not expose it, guest recovery still works, and approval remains cleared. Dependencies: AuthContext loading contract and check-draft ownership API. Estimate: **1–2 engineering days**; no service cost.

## FE-02 — P1: Revisiting an unchanged vacancy silently overwrites final CV edits

**Observed in a second synthetic component test.** CvCheck.tsx:248 allows backward navigation. At line 271 runCheck always substitutes sourceText for reviewedText, then line 273 replaces the review draft. confirmCv at line 266 similarly resets the final wording.

Reproduce: reach “Your review,” add a truthful correction, use “One vacancy” in progress, change nothing, and select “Check these inputs.” Returning to review shows the source version and drops the correction without a replacement confirmation or undo. A busy professional can lose confidentiality removals as well as wording improvements. Reapproval is required, so this is not an evidenced unreviewed export bypass.

Change: distinguish initial source composition from recomputing evidence for the working final draft. Preserve final edits when returning through unchanged setup; explicitly preview/confirm replacement when changed source requires regeneration. Centralize these transitions in a small reducer or dedicated workflow hook, keeping the current interface. **Accept:** same-input back/forward navigation preserves literal edits/removals; a deliberate replacement has confirmation and undo; changed inputs invalidate approval and previews. Dependencies: reuse/source-update transitions and current review-key contract. Estimate: **1.5–3 days**; no provider cost.

## FE-03 — P2: Tracking notes and dates fall outside the unsaved-work contract

**Source-confirmed; no live loss claimed.** OpportunityRow owns status, follow-up date and notes locally (JobLoop.tsx:93–97). The parent’s hasUnsavedDraft calculation at lines 286–291 includes profile, claims and new-vacancy inputs only; loop-draft-memory.ts:3–7 has no existing-opportunity tracking drafts. Row keys at JobLoop.tsx:399 also include saved status/date/notes, so a refreshed server change remounts an edited row.

Reproduce: change “My application notes” or a follow-up date on an existing opportunity, leave /loop for help, then return before 30 minutes. Unlike profile/claim/new-vacancy edits, these edits have neither retention nor the parent’s unsaved-work warning. During an active run, a server update to the same opportunity can also replace its local editor.

Change: retain dirty tracking drafts by stable opportunity ID, expose their dirtiness to navigation protection, and reconcile refreshed records without overwriting dirty fields. Keep status attestation separate and reset it on recovery. **Accept:** route return retains notes/date but requires fresh status attestation; account changes clear drafts; concurrent server changes produce a visible reconciliation choice. Dependencies: LoopWorkingDraft schema and OpportunityRow contract. Estimate: **1–2 days**; no additional backend storage needed.

## Ordered delivery

1. Fix FE-01 and FE-02 before widening the pilot; both are reproducible loss of review work.
2. Add FE-03 while observing professionals’ tracking usage in the ten-user pilot.
3. Preserve existing approval, owner-isolation and exact-byte preview tests. Add these transition regressions, then conduct a keyboard/screen-reader pass and slow-device profile before deciding on wider component extraction.

Validation: two synthetic regression observations passed, using only fictional data. Command: `node node_modules/vitest/vitest.mjs run .tmp/20-role-review/04-frontend-developer/recovery.test.tsx --config .tmp/20-role-review/04-frontend-developer/vitest.config.ts --maxWorkers=1 --reporter=json --outputFile=.tmp/20-role-review/04-frontend-developer/results.json`. An initial launcher attempt did not complete and was stopped; the direct runner completed. No whole-suite rerun. Do not build a framework migration, global state platform, parallel persona-specific forms or new paid integrations now.
