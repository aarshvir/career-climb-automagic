# Independent first-use and product review

Reviewed 14 October 2026, using CUA browser interactions and fictional inputs only.

## Verdict

The refreshed product gives a first-time guest a coherent route from the homepage to an approved CV. The stable guest journey had no confirmed blocking UI error. The strongest part is the visible relationship between vacancy wording, original CV passages, user edits and final approval. The main remaining opportunity is to reduce how much source-management terminology a new user must understand before completing a first download.

This is one independent expert walkthrough, not a study of real users, a conversion measurement, or evidence of hiring outcomes. Scores below are personal judgments out of 100, with no required target. I did not consult another reviewer's grades or a previous score baseline.

## Scope and method

- Began on the current homepage and followed its primary CTA into the local guest check.
- Used the development preview at `http://127.0.0.1:8383/` for supporting copy/navigation, then repeated the application journey in a fresh tab on the frozen production-client preview at `http://127.0.0.1:8403/`.
- The final frozen journey covered role, pasted CV, pasted vacancy, evidence, a factual wording edit, recheck, rendered PDF preview, approval, TXT and DOCX download requests, then a further edit and approval invalidation.
- Reviewed homepage → Job Loop, its setup-help link, help search, the homepage's first-check walkthrough link, the final interactive lesson step and its task-help link.
- Used the parent's desktop viewport configuration without changing it. This review does not grade phone behavior.
- Did not sign in, inspect existing account data, save a cloud record, call a paid model, send an application or publish anything. This was the pasted-text path; file extraction and cloud Job Loop operations were outside this first-use run.

## Opinion scores

| Parameter | Score / 100 | Reason |
|---|---:|---|
| Initial value and CTA clarity | 93 | The user knows to bring a CV and one vacancy, can see a concrete example, and sees the free/no-account promise beside the action. |
| First-check navigation | 91 | Six named steps, focused headings and back navigation make the route understandable. The final step is considerably denser than the opening steps. |
| Evidence usefulness | 85 | Strong literal examples are useful and cautiously labelled. Two ordinary responsibilities in this fixture still require manual interpretation, with some weak secondary passages. |
| Truthfulness and user control | 94 | Academic context, supporting contribution, skill-only evidence and uncertain experience duration remain distinct. Approval and later invalidation are explicit. |
| Review and download clarity | 89 | The final text, PDF maximum, preview, confirmations and formats are clear. Reusable-source management interrupts this immediate task. File completion could not be independently confirmed through the browser tool. |
| Natural copy and terminology | 88 | Mostly direct, task-based language. “Reusable source,” “reviewed source,” “current draft” and “pack credit” add concepts a first-time guest may not yet need. |
| Job Loop explanation | 92 | Explains reuse, a document per vacancy, private saving and the user's responsibility to submit. The account-free check remains an obvious entry point. |
| Help and walkthrough usefulness | 91 | Help uses the actual control names; search and task anchors work. The correct lesson opens from the homepage. Some procedures are long enough to require careful scanning. |
| Desktop visual confidence | 92 | The frozen homepage has a clear hierarchy and visible primary action; the product illustration explains the mechanism rather than relying on a decorative mockup. |
| Overall first-use judgment | **90** | A credible, usable first check with remaining simplification and semantic-coverage opportunities. |

## Verified outcomes

| Task | Observation |
|---|---|
| Homepage primary CTA | Opened `/check?audience=student`, with six steps and optional student guidance. No sign-up gate. |
| Role and inputs | Role and company carried through. Pasted CV showed 741 characters; vacancy showed 370. The reviewed source remained visible and editable. |
| Requirement extraction | The frozen build found the eight real requirements. The section heading “Responsibilities and requirements:” was excluded. |
| Direct wording | Python reporting and Excel dashboard examples were labelled direct wording, with “Project / academic evidence” and an explicit reminder that this does not establish professional employment experience. |
| Partial and missing evidence | Assisted leadership stayed related/review-needed; basic SQL did not become proof of database-query work; the two-year requirement stayed uncertain; Tableau showed no passage. |
| Final edit and recheck | Changed “Assisted in leading Python reporting…” to “Supported Python reporting…”. The final CV retained the edit; the final evidence labelled it “Added or edited by you during this check.” |
| PDF preview | “Preview current PDF” produced a one-page result within the two-page maximum. The embedded Chrome PDF viewer visibly rendered the fictional CV. |
| Approval gate | Downloads began disabled. Both accuracy/privacy confirmations were needed before approval. “Approved by you” then enabled the formats and reuse controls. |
| TXT and DOCX requests | Each button produced the correct “download requested” status and a format-specific prepared-file fallback. This verifies the product's visible request flow, not filesystem completion. |
| Post-approval edit | A further summary edit followed by recheck cleared both confirmations, approval, the PDF preview and all download controls. |
| Job Loop explanation | Homepage CTA reached `/job-loop`; its setup guide reached and focused `/help#job-loop-start`. The explanation distinguishes a free first check from account-based private saving. |
| Help search | Searching “PDF” returned four matching topics. The instructions use the same labels as the guest flow. |
| Relevant walkthrough | Homepage link used `/walkthroughs?tutorial=first-check#wt-recorded`, selecting “Your first CV check.” Its final interactive step explained PDF preview and approval. “Read task help” reached and focused `/help#first-check`. |

## Remaining product improvements

1. **Make future reuse visibly optional during the first review.** On both review and approval, “Keep reviewed edits for future applications” introduces a replacement operation, a reusable source and source-line removal before the immediate task is finished. The explanation is accurate, but a new user may wonder whether this is required to proceed. A collapsed “Reuse these edits later (optional)” block after the main download action would preserve the capability with less interruption. This is a usability judgment, not a functional failure.

2. **Improve the usefulness of manual-review cards without overstating certainty.** “Work with senior analysts to check data quality” and “Present findings to stakeholders” both needed manual review in this small fixture. Showing the original wording is appropriate. The first card also included a graduate summary as a secondary passage, which adds little evidence. A short explanation of the missing distinction, or fewer weak secondary passages, would make the review more actionable while keeping the conservative status.

3. **Remove unexplained commercial vocabulary from the free guest completion step.** “Saving uses no pack credit” appears under optional private saving although the current path promises a free check and download. A guest has not been taught what a pack credit is. “Saving this check is free” communicates the relevant consequence more directly if that is the intended behavior.

4. **Give long help procedures a short overview before the detailed instructions.** The task index, search and anchored focus work well. Individual topics still contain several compound instructions with multiple exact control names. A compact sequence such as “Add CV → check details → review facts → save” would help readers establish orientation before following the full steps.

No unsupported claim that the check verifies eligibility, predicts an interview, or sends applications was observed in this scope. The source-management controls and cautionary language should be simplified carefully without losing the distinctions that make the review trustworthy.

## Resolved and inconclusive observations

- **Resolved in the frozen build:** the earlier development preview treated the ordinary heading “Responsibilities and requirements:” as a ninth requirement with a meaningless review question. The frozen build excluded it and showed eight requirements. It is not an open finding here.
- **Development reload contamination:** the earlier guest draft returned to step one while shared-site edits were being applied. The parent confirmed that a shared-module edit could trigger a full development reload. This is excluded from the stable product verdict.
- **Rapid automation observation, unclassified:** immediately filling CV text and clicking the continue control in the same CUA call once left the frozen flow on the CV step without an alert; a separately observed click advanced. Normal-paced, separately inspected subsequent actions worked. This is insufficient to claim a human-facing runtime bug.
- **Browser-tool limits:** controlling the optional new `blob:` PDF tab was rejected by the browser URL policy; the inline preview was inspected instead. CUA's download-event wait timed out and reset its session after the TXT action, while the product subsequently displayed the correct request/fallback state. TXT/DOCX filesystem completion and downloaded-document contents were not independently inspected. Neither tool limitation is reported as a product error.

## Receipts

Local screenshots are ignored audit artifacts under `.tmp/design-refresh/`:

- `first-use-home-frozen.jpg`
- `first-use-evidence-frozen.jpg`
- `first-use-pdf-preview-frozen.jpg`
- `first-use-approved-download-frozen.jpg`
- `first-use-help.jpg` (supporting task-help view on the development preview)

The screenshots contain fictional input only. This report makes no runtime edits and creates no commit.

## Reproduction fixture

Target role: Junior Data Analyst. Company: Fictional Harbor Analytics.

```text
Alex Morgan — Fictional test CV
Dubai, UAE | alex.morgan@example.com
Summary
Recent mathematics graduate seeking a junior data analyst role.
Education
BSc Mathematics, Fictional City University, 2025.
University project — Retail reporting, January–April 2025
Developed Python reports for a university project. Cleaned a dataset of 2,000 fictional retail transactions with pandas. Created an Excel dashboard and presented findings to four classmates.
Internship — Fictional Bay Services, June–August 2025
Assisted in leading Python reporting during an internship. Updated weekly Excel reports and supported a supervisor with data quality checks.
Skills
Python, pandas, Excel, basic SQL.
Volunteer work
Coordinated university project meetings.
```

```text
Fictional Junior Data Analyst vacancy — Harbor Analytics
Responsibilities and requirements:
Develop Python reports.
Lead Python reporting.
Create Excel dashboards.
Use SQL to query databases.
Work with senior analysts to check data quality.
Present findings to stakeholders.
Two years of professional data analysis experience required.
Knowledge of Tableau is desirable.
```
