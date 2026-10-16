# Saved-check and Loop application detail

15 October 2026. **Unpublished source, continuing the contract integration. Public v30 is unchanged.** The saved-check linking migration remains unapplied and the control action is undeployed. This read-only interface can display an exact relationship once it exists; it does not create that relationship or complete the import/save journey.

## Implemented behavior

The Applications home groups an owned saved check and a current-lifetime Loop vacancy only when there is one exact, valid server-recorded `sourceCheckId`, the expected manual source/key, a unique opportunity identity and an exact continuation path. Similar titles, companies, URLs and raw IDs never cause a merge. Packs and unrelated vacancies remain separate.

The joined detail keeps the saved check's original and final CV, the Loop vacancy's own text, all loaded output attempts and both sources' progress. Held/revoked output states remain intact. Check tracking and Loop progress have separate labels and update links, including when their raw IDs happen to match. A wording difference is shown rather than silently replacing one source with the other. Both continuation actions are available together near the heading. No approval, submitted status or combined progress is inferred.

An exact Loop bookmark resolves to the joined detail in the same generation. It cannot open a fresh lifetime's relationship. When a check is loading, missing, deleted or unreadable, the independently loaded Loop vacancy remains accessible without invented check content. Contradictory links remain separate. Search finds either source's role/company. A failed tracker read shows its own warning without hiding the relationship explanation or Loop progress.

## Validation and limits

- Added 13 projection/identity cases and four actual component cases, covering exact joins, unchanged input objects, distinct applications with identical titles, source failure/delay, foreign checks, contradictory provenance, old generations, exact continuation URLs and independent progress. These are local synthetic fixtures, not customer sessions.
- The existing independent-review regression files remain in the suite; rerunning them is **not** a new independent reviewer sign-off. Initial new-test failures were a parameterized fixture shape and an ambiguous text query; those test definitions were corrected without weakening production behavior.
- The actual React component was inspected through the in-app browser using an isolated local fixture that rejects mutation actions and replaces account/database/provider adapters. The initial Loop bookmark opened the joined saved application; its pack remained a separate list item. Both CV and Loop actions, distinct vacancy wording and two progress sections were visible.
- At 390 × 844, the document width was 375 px, with no horizontal overflow. A deliberate list choice focused Application details and its settled top was about 100 px. Searching by the linked Loop employer retained the joined application. The temporary viewport was reset and the inspection tab closed. Screenshots are private sibling evidence files `check-loop-home-mobile.png` and `check-loop-home-desktop.png`.
- All 1,503 tests in 101 files and TypeScript passed. Vite and prerender passed; worker packaging initially rejected a symbolic-link entry. A subsequent read-only enumeration found none, and unchanged packaging plus all 12 hosting groups passed on retry. The cause was not established and the guard was not weakened. Results are recorded in `home-verification.json`. SQL, Deno and native concurrency were unchanged and were not rerun for this frontend-only step; their previous contract-stage receipts remain historical evidence.

## Remaining release gates

The import's pending source ID and exact vacancy fingerprint still need to survive profile saving, undo and route recovery under owner/auth/generation authority. The candidate needs explicit consent to persist that link, a clear choice when source vacancy wording changes, and protection from delayed saves clearing newer drafts. This is the next implementation step; do not rebuild this home projection or the tested SQL/control contract.

Then test the complete first/second-application flow and obtain independent review before coordinated migration/control/site exposure. The known agent usage limit still prevents a fresh independent sign-off; no paid workaround was used. No hosted authenticated write, production mutation, provider call, export, full first/second customer task or score increase is certified by this local inspection. Selected-vacancy preparation and application-specific composition remain subsequent work.
