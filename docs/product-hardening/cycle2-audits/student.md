# Independent student-customer audit — cycle 2

- Reviewer: student-customer audit agent; independent observations and judgment.
- Persona: university student seeking graduate/intern roles, coursework and a short internship, limited time, no polished CV.
- Start: 2026-10-14T03:28:16.118Z. Browser observations ended and final source hash check: 2026-10-14T03:37:21Z.
- Candidate: actual local UI at http://127.0.0.1:8383, Chrome browser 3, reviewer-created tab 1385099311. No viewport override, account sign-in, saved-candidate inspection, live support submission, or paid model call.
- No prior audit scores or implementation reports were read. No target score was supplied. Only fictional source and vacancy material was entered.
- Runtime source was not edited, committed, or deployed by this reviewer. This report and its screenshot are audit artifacts.
- Initial IAB/Chrome navigation timeouts recovered in Chrome. They are treated as tool/environment limitations, not product defects.

## Independent score

Ten dimensions have equal 10% weight. Overall: **83.5/100**. This is an observed student-journey assessment, not a production security/accessibility certification or a claim that every downloadable file was verified.

| Dimension | Score | Basis |
|---|---:|---|
| Clarity | 89 | Student intent, free/no-account entry, source/evidence/review steps and user responsibility are clear. Source versus final wording introduces some cognitive load. |
| Activation | 86 | Homepage student choice carries to setup; no-CV facts guidance and paste fallback support this persona. Six-step first check is easy to follow. |
| Form effort | 82 | Role, optional employer, plain-text CV and vacancy are sufficient. Evidence and privacy review are necessarily substantial; the final page is long. |
| Evidence quality | 66 | Literal passages and source lines are useful, but an explicit professional-experience requirement was marked direct using explicitly academic work. A generic team overlap also produced a noisy partial finding. |
| Workflow completeness | 85 | Reached edit, source exclusion, recheck, actual-PDF generation status, approval and download requests. Actual downloaded bytes and PDF glyph/layout integrity remain unverified because blob retrieval was unsupported by the browser connector. |
| Reuse/time-saving | 90 | Approved CV reuse reduces the next application to four steps. Added coursework evidence and confidential removals survived reuse. Undo restores the prior application with fresh review. |
| Help/walkthroughs | 89 | Searchable task help, no-CV outline, scanned/old-file recovery, source-line instructions, six selectable interactive steps, a loaded recording and transcript/chapter controls. Full narration/caption playback was not audited. |
| UI/accessibility | 86 | Inspected desktop views are legible; controls have useful names and step headings receive focus. Mobile, screen-reader output, contrast measurement and a full keyboard-only pass are unverified. |
| Trust/privacy | 80 | Clear local/account boundaries, separate accuracy/privacy confirmations, literal removal preview and explicit undo warnings. The academic-to-professional direct signal materially weakens trust. |
| Reliability | 82 | No observed product crash. Malformed PDF recovery, help return and consented refresh recovery worked. Download handoff was observed but actual file completion could not be established. |

## Browser-observed journey

1. Homepage default Students selection described projects/internships and explicitly said an account/card was unnecessary. Selected “Check my CV against a job.”
2. Entered Graduate Data Analyst / Fictional Cedar Analytics. Student setup guidance said employment history was unnecessary.
3. Opened “No finished CV yet?” Guidance accepted a short career record and linked to the starter outline and upload help.
4. Uploaded a deliberately malformed fictional PDF. The UI returned: “We could not read this PDF file. It may be damaged or password-protected…” and restored editable paste/file controls. Pasting facts then worked.
5. Pasted the fictional source below and vacancy A. Evidence showed eight requirements: two direct, three related, one no-passage and two manual review. Expected graduation remained expected; the two-year SQL requirement was not treated as a proven duration; missing Tableau was not invented.
6. On Your review, selected source line 13, previewed both source/final versions, applied removal and verified the ORCHID-TEST line disappeared. Undo restored it with a warning; reapplied the same removal.
7. Added the fictional methods-project example with explicit accuracy/shareability confirmation. It appeared under ADDITIONAL EXPERIENCE without a fabricated business outcome. “Keep these edits in my reusable source” updated the open source.
8. Rechecked and reached final approval. PDF preview generation reported one page within the selected two-page maximum and exposed the exact-preview iframe/link. Confirmed accuracy/privacy, approved, and observed downloads enable. PDF and TXT requests produced named fallback links.
9. TXT download-event retrieval timed out. The fallback link’s downloadMedia call reported “Blob downloads are not supported by this browser.” No matching file appeared in the narrowly checked default Downloads path. Consequently file completion/content was **not verified**; the UI itself correctly said “download requested,” not “download complete.” Source confirms a blob/anchor download and fallback link, but does not prove browser file delivery.
10. Reused Approved final CV. The four-step next-vacancy form contained the sanitized source plus the added example, with blank new role/vacancy fields. Undo restored the previous vacancy and CV at review and required fresh approval.
11. Visited Help, searched “scanned” (one relevant topic), opened the walkthrough, loaded its recording, moved through its interactive steps and read the transcript. Returned through Free CV check; the complete sanitized draft returned with approval cleared.
12. Opted into temporary refresh recovery and refreshed. The same sanitized draft and vacancy returned; the UI stated refresh recovery was on and required review again.
13. Reapproved for reuse and checked vacancy B without retyping a CV. Reached its separate final approval page with unchecked approval boxes. Then edited that vacancy into boundary fixture C to test professional versus academic evidence. This exposed S1.
14. Left the fictional check at the evidence view. No account records were saved.

## Findings

### S1 — P2: Explicitly academic work can receive a direct professional-experience finding

**Evidence:** browser observed, source corroborated. Screenshot: [student-professional-academic.jpg](evidence/student-professional-academic.jpg).

**Reproducible task:** Use the source below, including COURSEWORK PROJECT and line 7. Check vacancy C, especially “Professional experience creating Power BI dashboards is required.”

**Expected:** Preserve the academic context and explain that this passage does not establish professional experience. Related/manual review is reasonable; generic dashboard work may be a direct wording finding when the employer does not require professional experience.

**Actual:** The professional requirement was labelled **Direct wording found**, quoting “Created a Power BI dashboard for the class project and presented findings to four classmates. This was academic work, not professional employment.” No academic evidence tag appeared for that passage. The explanation said, “This example mentions the work the employer asks for. Check that it describes your own contribution and the right level of responsibility.” The summary counted two direct findings and zero to review for the two-clause fixture.

**Impact:** A time-limited student can receive a positive signal for a requirement their own CV explicitly distinguishes from employment. Global wording disclaimers do not resolve this particular contradictory signal.

**Secondary source:** src/lib/cv-evidence.ts:245 does not recognize COURSEWORK PROJECT as a section heading. The context expression at line 289 recognizes university/classroom/academic/coursework/student project but not “class project”; the sentence used here therefore has unspecified context. The professional-experience direct guard at line 407 relies on the context classification.

**Bounded acceptance:** Browser and focused regression checks cover COURSEWORK PROJECT, ACADEMIC PROJECT and CLASS PROJECT headings; attached academic disclaimers remain in scope. An explicit professional/commercial/employment-experience requirement must not be direct using only those passages. Retain the original quote and academic context. A generic dashboard task can still be direct with a visible academic tag. Preserve real internship/employment behavior.

### S2 — P3: A generic team overlap produces an unhelpful partial match

**Evidence:** browser observed; anchor matching at src/lib/cv-evidence.ts:364–369 and partial explanation at line 428 corroborate the mechanism.

**Reproducible task:** Check vacancy B with the sanitized source and additional example.

**Expected:** A passage about coordinating coding-club workshops should not be positive supporting evidence for creating research charts solely because both mention a team. Use no passage/manual review unless a useful task/object anchor exists.

**Actual:** “Create charts for a small research team.” was Related passage — review needed, supported by “Coordinated three university coding club workshops with a team of two volunteers.” The explanation stated that the CV covers part of the requirement.

**Impact:** Adds review work and obscures what the student actually needs to show, even though it does not directly claim qualification.

**Bounded acceptance:** The exact fixture should no longer treat “team” alone as partial task evidence. A real chart-creation statement should remain discoverable. Do not suppress useful specific tool/object matches.

### S3 — P3: Student setup guidance disappears after the help return

**Evidence:** browser observed, source corroborated.

**Reproducible task:** Start from the homepage’s student CTA (/check?audience=student), reach review, visit Help or Walkthroughs, and return using the header Free CV check (/check).

**Expected:** Restore the selected audience guidance along with the open draft, or provide an easy way to select it again.

**Actual:** CV, vacancy and edits returned correctly, but the University student guidance panel was absent. src/pages/CvCheck.tsx:96–97 derives guidance only from the current URL query; the restored draft does not supply it.

**Impact:** Small loss of useful coursework/internship framing precisely when a first-time student has sought help. No application text was lost.

**Bounded acceptance:** Returning through help retains student guidance for the active draft, including consented refresh recovery, without altering source facts or silently assigning an audience to an unrelated new check.

## Exact fictional fixtures

### Original source (15 nonempty lines; confidential material is fictional)

```text
Mina Rowan (fictional student)
mina.rowan@example.com
EDUCATION
BSc Data Science, Fictional North University, expected June 2027.
COURSEWORK PROJECT
Analysed 1,200 simulated bus journeys using Python, pandas and SQL for a university project, September to December 2025.
Created a Power BI dashboard for the class project and presented findings to four classmates. This was academic work, not professional employment.
INTERNSHIP
Data Intern, Fictional Birch Studio, June to August 2026.
Assisted an analyst with Excel data cleaning and prepared weekly summaries for my supervisor.
VOLUNTEERING
Coordinated three university coding club workshops with a team of two volunteers.
CONFIDENTIAL: ORCHID-TEST unannounced client budget AED 7,000. Do not include in application materials.
SKILLS
Python, pandas, SQL, Excel, Power BI.
```

Added example: “In a two-person university methods project, I checked 60 simulated survey responses for duplicate entries and documented the cleaning steps. No measured business outcome.”

### Vacancy A

```text
Graduate Data Analyst — Fictional Cedar Analytics
Responsibilities
Analyse datasets using Python and SQL.
Create Power BI dashboards.
Prepare weekly summaries using Excel.
Present findings to stakeholders.
Requirements
BSc in Data Science or related subject, completed or in progress.
Two years of professional SQL experience is required.
Experience leading commercial analytics projects.
Tableau experience is desirable.
```

### Vacancy B

```text
Data Insights Intern — Fictional Elm Research
Responsibilities
Use Excel to clean survey data and document cleaning steps.
Create charts for a small research team.
Requirements
Current university student in Data Science.
Experience checking survey responses is desirable.
Clear communication and honest reporting of study limitations.
```

### Boundary vacancy C

```text
Data Insights Intern — Fictional Elm Research
Requirements
Professional experience creating Power BI dashboards is required.
Responsibilities
Prepare weekly summaries using Excel.
```

## Scope limits and source identity

**Observed in browser:** the guest flow and cases listed above, actual UI labels/states, source-line removal/undo, source replacement, next-vacancy reuse/undo, help search, interactive walkthrough controls/transcript, malformed-PDF recovery and consented refresh recovery.

**Secondary source only:** specific context/anchor logic, URL-only audience guidance and blob download implementation. No test result is claimed; no tests were run by this reviewer.

**Unverified:** actual downloaded bytes; visual review of every generated PDF glyph/page; DOCX opening; valid PDF/DOCX file extraction; 5 MB/character-limit boundaries; real scanned-PDF OCR (the UI explicitly delegates it); actual video narration/caption playback; mobile/screen-reader/complete keyboard operation; account saving, cross-account boundaries, live support/CORS, cloud preparation, paid AI, email and employer submission.

Comparable initial/end hashes showed **no source drift** during these observations. Initial eight-file baseline was collected at 03:28:25Z; the additional export/download/extraction/homepage files were hashed during secondary inspection and again at the final check. Hashes in student.json identify the exact observed source; scores/findings apply to that build only.

