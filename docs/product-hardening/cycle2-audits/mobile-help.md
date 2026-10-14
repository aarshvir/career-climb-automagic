# Independent mobile, accessibility and help customer audit

Reviewed 14 October 2026, Asia/Dubai. Independent review with no previous audit reports, peer scores or target score read. No runtime edits were made. The browser journey used only fictional student data at `http://127.0.0.1:8383`.

**Overall: 89.6/100**, the arithmetic mean of ten equally weighted dimensions. The free check, download and reuse journey is complete and understandable. The principal remaining issues are keyboard continuity after source actions and insufficient accessible identification of source-removal choices. Recorded help has useful alternatives, although the burned captions can sit under native playback controls.

| Dimension | Score | Reason |
|---|---:|---|
| Clarity | 91 | The offer, free/no-account boundary, student context and one-vacancy workflow are explicit. There is considerable explanatory text to scan. |
| Activation | 92 | Homepage CTA enters the student check directly; role validation focuses the right field, and a finished CV is unnecessary. |
| Form effort | 87 | Role/company, CV and vacancy are staged clearly; the review/source/privacy controls require sustained reading, especially on a phone. |
| Evidence quality | 82 | Quotes and line references are visible, expected graduation is distinguished from completion, and missing experience remains missing. Simple pandas/presentation requirements still required manual review and related findings included broad extra passages. This is a conservative wording aid, not a strong semantic assessment. |
| Workflow completeness | 92 | Browser journey reached review, actual PDF-preview generation, approval, a completed TXT download, reuse and undo without an account. Actual PDF pagination/readability and account actions were not end-to-end verified. |
| Reuse/time-saving | 94 | Approved-CV reuse reduced the next check to four steps; retained edits/removals were inspectable, and undo restored the previous application for fresh review. |
| Help/walkthroughs | 93 | Search, related anchors, exact click instructions, no-CV/OCR guidance, untimed keyboard steps, actual video, chapters and full transcript are useful. Caption placement is the main observed weakness. |
| UI/accessibility | 84 | Phone controls and text reflowed without horizontal overflow. Step transitions and error focus worked; same-step source actions lost focus, and checkbox names omit the passage being selected. |
| Trust/privacy | 92 | Local versus saved data, explicit approval, fictional examples and separate processing choices are explained. Contact identifies the operator, private queue, retention and receipt limitations. Server privacy enforcement was outside this audit. |
| Reliability | 89 | The observed local journey worked, including a real download and draft return. Existing checks passed after the freeze boundary; live account/cloud flows and all media were unverified. |

## Observed customer journey

1. Homepage starts with students selected and explains CV + one vacancy, free download, no account/card, and user approval. The illustrative comparison is plainly fictional.
2. Followed **Check my CV against a job**. Empty role submission produced “Enter the role you want to prepare for” and focused **Target role**. Entered Graduate Data Analyst / Fictional Learning Labs.
3. Opened **No finished CV yet? Start with your actual facts.** It explains education status, a project/internship, personal contribution, measured versus unmeasured results, and links to a starter outline and unreadable-file help.
4. Pasted a fictional student record: BSc Statistics expected June 2027; university Python/pandas project with 2,000 rows and class presentation; volunteer Excel budget work; skills. Pasted a fictional vacancy requiring Python reports, pandas cleaning, presentation, Excel budgets, completed BSc, two professional years and desirable SQL.
5. The evidence screen showed seven requirements: 0 direct, 3 related, 2 no passage, 2 manual review. It retained academic context, showed the expected degree beside the completed-degree requirement with a status warning, and did not infer professional years or SQL. Simple “Clean datasets with pandas” and “Present findings clearly” required manual review despite relevant source wording. This reduced usefulness but did not falsely certify suitability.
6. In review, selected source line 4, previewed **both** source and current CV, removed it, then used **Undo source-line removal**. Both versions restored. Edited the final CV to remove that volunteer line, then used **Keep these edits in my reusable source**. The source list reflected the deletion.
7. Continued to approval; generated the current PDF preview and saw a one-page/within-maximum result plus a blob preview link. The iframe did not expose document content in the accessibility tree; this audit does not certify its visual PDF layout. Confirmed accuracy and privacy, approved, and downloaded TXT. The browser reported a real saved download at `C:/Users/user/Downloads/CV-Graduate Data Analyst.txt`; file content matched the reviewed CV and omitted the removed line.
8. **Use this CV for another vacancy** selected the approved final CV by default and opened a four-step next-vacancy flow. **Inspect or edit the reused CV** showed the retained deletion. **Undo new application** restored the former application to review.
9. Navigated to Help, searched `pdf`, and followed **No CV yet** from the filtered results. The related anchor cleared the filter and focused the requested section. Help describes OCR, .doc conversion, source-line preview/removal/undo, approval, reuse, privacy and recovery using current control names.
10. Walkthroughs offered recorded video, untimed steps, transcript and task help. Loaded the first-check video; browser metadata showed duration 111.275 seconds and ready state 4 with no media error. A chapter button sought to 89.5 seconds. Space started playback. The complete six-chapter narration was readable in the transcript. **Next step** and **End** moved the untimed example to its final step and retained a useful player focus target. The reusable-career-record tutorial was also selectable and distinguished account saving from the free check.
11. Contact explained the pilot operator, private administration queue, no required name/email, 90-day message consent, receipt status and lack of promised response time. The form was inspected only; no request was stored.
12. At an explicit 390×844 browser viewport, inspected contact, mobile navigation, recovered review, source-line controls, recorded video and the transcript shortcut. Header/menu and controls reflowed; document scroll width was 375 CSS px with a 390 px inner width (vertical scrollbar), so no horizontal overflow was observed. The video itself measured about 295×166 px: the desktop screen capture is small, while chapter buttons and the written alternatives remain usable. Returning to `/check` restored the draft at review with a clear reapproval message. The temporary viewport override was reset.

## Actionable findings

### MH-01 — P2: Same-step source actions lose keyboard focus

**Observed, corroborated by source.** At step 5, open source-line removal, select a line, preview, and select **Remove selected lines**. The button disappears and browser focus becomes the web area/body. **Undo source-line removal** and **Keep these edits in my reusable source** also leave focus on the body when the same step remains active. Approval similarly disables the focused button and leaves focus on the web area. The status message updates, but keyboard users lose their place for the next action.

Frozen `src/pages/CvCheck.tsx` lines 185–208 and 294–298 perform these updates. The focus effect at frozen line 220 only runs when `step` changes, so setting step 5 while already on step 5 does not restore focus. Move focus deliberately to a stable review heading/current-CV target after source changes and to a useful download/result target after approval. Verify the next Tab continues near that result. This is a continuity defect, not a failure to change the data.

### MH-02 — P2: Source-removal checkbox names omit the passage

**Observed in the accessibility tree and source.** The picker exposes checkbox names such as **Remove source line 3**, with no passage description. The visible enclosing label contains the CV text, but `aria-label` overrides that label text. A screen-reader user navigating the checkbox controls cannot identify the content being removed from the control announcement alone, which matters for a privacy-sensitive removal choice.

Frozen `src/pages/CvCheck.tsx` line 349 creates this structure. Include the actual literal passage in the accessible name, or connect its text through `aria-describedby` while retaining the line number. The large enclosing labels already provide adequate touch targets; a 16 px visual checkbox alone is not being reported as a target-size failure.

### MH-03 — P3: Native video controls cover burned captions

**Observed screenshot, supplemental check of unchanged walkthrough code/media after the source freeze.** At about 0:06 in the first-check recording, playback controls overlaid the bottom burned-caption line, making the caption dark/obscured against the control bar. This is especially awkward when keyboard users keep focus on the video or phone users touch controls. The optional English track starts disabled because captions are burned in (`default={!asset.hasBurnedCaptions}`, `src/pages/Walkthroughs.tsx` line 29).

Place burned captions in a safe area above native controls, or provide a reliably visible caption treatment that avoids duplicate text. Preserve the existing transcript and chapter alternatives. Playback itself worked; audio quality and the complete recording were not assessed.

## Provenance, drift and verification limits

- Git HEAD throughout: `9682cd1bbf776be6d2e74b023766fcd4c9056022`. The working tree was already dirty; this is not a clean commit/build certification.
- Initial key-source SHA-256 snapshot: **2026-10-14T07:39:20.1963099+04:00**. All eleven listed files matched exactly at the UI freeze: **2026-10-14T07:43:45.3501481+04:00**. Full hashes are in the adjacent JSON.
- The parent began changes after this freeze. At **07:44:55+04:00**, CvCheck, check-draft and HelpCenter had different hashes. Scores and the core findings above describe the frozen UI, not a homogeneous later working tree. No fix was independently rescored here.
- First-check video playback was rechecked after an HMR reset, around 07:45, solely to inspect visible burned captions. Walkthroughs and its manifest hashes were unchanged at the last comparison. MH-03 is explicitly supplemental; it is not evidence for the later CV flow.
- Existing tests ran **07:44:02–07:44:15+04:00**, after the frozen UI boundary: four files, **65 passed** (`help-center`, `walkthroughs`, `cv-check-journey`, `guest-support`). They support the then-current working tree and are not presented as proof that the frozen version passed those same checks. UI geometry/focus/caption defects were observed in a real browser, not inferred from these tests.
- No signup, login, live candidate record write, support submission, outreach, employer application, paid model call or recurring run occurred. No full screen-reader session, real phone/virtual keyboard, browser zoom matrix, real uploaded PDF/DOCX/scanned CV, account deletion/save, cloud execution, every video or audio listening was completed. Those boundaries remain unverified.

## Separate targeted fix verification

The original scores above remain frozen. After the main agent changed the implementation, captured `src/pages/CvCheck.tsx` SHA-256 `21CC4035208CE26238ED13A5C4850EA45EAC2AA5A48C575D3B1F263970D701E8` at **07:48:17.9545333+04:00** and repeated the fictional source-removal flow in the actual browser.

- **MH-01 targeted recheck passed:** applying source-line removal focused the **Your review** H2; the next Tab focused **Your CV to review**. Undo removal and keeping reviewed edits also focused that heading. Approval focused **Approve & download**, rather than the body.
- **MH-02 targeted recheck passed at DOM-association level:** source line 4 retained the name **Remove source line 4** and its `aria-describedby` resolved to the full literal volunteer passage. A spoken screen-reader session was not performed.
- Later development HMR reset the open check during a final geometry inspection. No broader regression conclusion or score change is inferred from this narrow recheck. MH-03 remains open in this audit.
- At **07:49:45.4932410+04:00**, CvCheck still had the same recheck hash. Walkthroughs.tsx remained unchanged, while `src/lib/walkthroughs.ts` had drifted to `6D308D397FFCE0D130666DA539E7D6672BF59EE09AC2458CB6036BB883127FD6`; no revised walkthrough manifest/media is certified by this audit.
