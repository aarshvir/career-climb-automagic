# CV heading polish with export preservation

26 October 2026. **Reviewed source preparation; not a live release.** Public v61 and native worker37 remain unchanged. This corrects the blocker found in Claude PR25 instead of merging the unsafe two-line polish unchanged.

The original proposal shortened an otherwise valid education CV from87to77characters and a skills CV from95to78. Both then failed the existing80-character composer and renderer floor, removing PDF/DOCX/TXT output. The repaired composer uses `SKILLS` and suppresses only an exact trim/case duplicate section context. Distinct employers, degrees, punctuation, course details, facts and source order remain.

The composer also builds the exact original presentation from the same selected facts and validated wording. It restores that entire presentation when cosmetic shortening crosses the lower bound, or when the original was already above60,000characters. It adds no filler and changes neither length fence. Previously oversized output therefore stays held even when shorter headings would bring it just below the maximum. Renderer, historical packets, approval, source hashes, claim eligibility/withdrawal/shareability and revisions are unchanged.

## Verification and limits

- Eight actual composer/renderer cases cover87/95/exact80valid exports,79held,60,001held, distinct contexts, preserved chronology/facts and unchanged input/claim authority.
- A separate reviewer reran13cases against final engine SHA`d8db4aa7019d63d64a01ace798cfad237b6937297d4739512e98cac9386196b1`, parsing actual PDF/DOCX/TXT for ten output fixtures. Original87/95/exact80TXT bytes remain exact;60001stays held although cosmetic text would be59984. This is bounded automated artifact evidence, not browser/Word-pagination/hosted acceptance.
- Application TypeScript, targeted lint and28source/28generated Deno handler cases pass. Standard bundles/manifests are regenerated. Full-suite result is recorded in verification.json once complete.
- The initial full run before refreshing the pinned source manifest stopped11mocked hosted-harness cases at `source-proof-matches-release-manifest`;3471other cases passed. The manifest check was retained and the standard builder refreshed the source proof before the final run. No hosted or paid run occurred.

No migration, native deployment, site publication, provider call, merchant/ad/candidate mutation or purchase was performed. Only the worker bundle runtime bytes change from this patch; seven manifests capture the shared source input. The separate prepared product-name batch already in main still requires coordinated seven-handler exposure with the reviewed frontend. Do not deploy a worker alone and claim that name batch complete. Rollback tag`jobvance-before-cv-heading-preservation-2026-10-26` atdcfc56c and savedv61 are preserved.

The premium site remains Claude's sole active implementation. This source fix neither approves its replacement identity nor certifies a completed redesign. Open journey/discovery/repeated-day, indexing, marketing and customer-evidence requirements remain tracked.
