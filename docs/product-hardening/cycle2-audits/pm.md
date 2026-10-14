# Cycle 2 independent product-manager audit — frozen initial assessment

**Overall: 87.4/100**, the arithmetic mean of ten equally weighted dimensions. This is a product/usability assessment of the bounded free pilot, not a market-validation, ranking, conversion, customer-outcome or production-scale claim. No previous audit grades or other agents' reports were read. Private marketing experiments under `.sites-runtime/marketing-lab` were excluded.

The common product is understandable: bring existing CV text and one vacancy, inspect literal supporting passages, revise, approve, download, then reuse the work. Students, MBA pivots and employed professionals can use that same task without separate applications or a long profile. The most useful remaining fix is more conservative evidence classification: supported team work and explicitly academic work can escape the review queue.

## Assessment boundary and provenance

- Review window recorded by local hashes: **2026-10-14T03:30:12.386Z–03:35:25.187Z** (07:30–07:35 Asia/Dubai).
- Guest journey: `http://127.0.0.1:8383`, own background IAB tab `1`, browser `2`, normal reported 1280×720 viewport; no browser-scoped viewport changes.
- Git base: `9682cd1bbf776be6d2e74b023766fcd4c9056022`; the candidate contains pre-existing uncommitted changes, so the hashes below identify the reviewed files more precisely than the commit alone.
- Full SHA256 manifests of `src`, `public`, `scripts` and `dist`: `.tmp/pm-audit-start-sha256.txt` and `.tmp/pm-audit-end-sha256.txt`. Both manifest hashes were **3053AFB306DDF9AD080F16C519F1293DCE210104666CF45FB4BDE4D27BD830D8**. Comparison found **no source/build hash drift** during the frozen assessment.
- No runtime files were edited. No commit or deployment, signup, paid call, message send, employer submission, real candidate-record change or live support write was performed.

Key reviewed SHA256 hashes:

| File | SHA256 |
| --- | --- |
| `src/lib/cv-evidence.ts` | `CCFC9575CF9A49842811B68C1DADDD8C0205EBCC313A3189AA4715B8F8E9DF12` |
| `src/pages/CvCheck.tsx` | `4F3A60652EF5AC763CA89E530876B2AFAB6482FFA671AFA21BA7364612D7F51C` |
| `src/pages/JobLoop.tsx` | `70946927B2011748B98DE9DB65DC026AA10B71EC10D07892634360794710F722` |
| `src/pages/GuestSupport.tsx` | `9F6E0B9D5C0BF9E041CB3AE79AFBC34C7BA5864A0570D13846725CE5B9C38E5D` |
| `src/pages/HelpCenter.tsx` | `8EB438757F876640BB3A8F6F2C3E7A1D4FEB9D9CD5E70AE458B58AD62B712919` |
| `src/pages/Walkthroughs.tsx` | `B462C788723C86484BC173ABD96BC76B5EF588DF822399DBF4B1EF994C5F0DDE` |
| `src/lib/walkthroughs.ts` | `2ECDF8338B59FDFA617C935ADFDB1F5314C668797461D9E5C97609C47E6A7963` |
| `src/pages/ProductPage.tsx` | `A945404F59236521D082C040AFF9E1E0536146B4863A4A2586E304913A4BFADC` |
| `src/pages/JobLoopOverview.tsx` | `F308C7B706EECEFB4841059DC094279CE5C5B87E3589F0CF1BD1A7324697BA08` |
| `dist/.prerender/manifest.json` | `82D7F78002C336D3DBE486D018855FE3C1783A19FDD7C88F83914B164B22EF75` |

## Equal-weight scores

| Dimension | /100 | Evidence and practical limit |
| --- | ---: | --- |
| Clarity | 88 | Home and Job Loop explain the shared CV/vacancy/review task, free entry, manual submission and optional account. The homepage's “career-switchers” framing is narrower than the busy-professional audience elsewhere; the private offer remains conditional on actual services. |
| Activation | 90 | A guest reaches source-linked evidence before signup or card entry. Role, CV text and vacancy are sufficient; no finished CV is required. Six steps still require substantial reading of supplied text. |
| Form effort | 87 | First use needs a role and two text inputs; employer is optional. Reuse combines the next role and vacancy into one step and reduces the journey to four steps. Source inspection shows three primary private-profile details, optional preferences collapsed, and one copied fact offered at a time; that authenticated form was not operated here. |
| Evidence quality | 78 | Literal quotes and line numbers, conservative qualification/negation/experience-duration handling and full source retention are useful. Two reproduced context/ownership cases receive green direct status and disappear from the review filter. |
| Workflow completeness | 89 | Guest evidence, editing, accuracy/privacy approval, format gating, actual TXT export and another vacancy were exercised. Tracking and stored-output completion are supported separately by supplied hosted synthetic evidence, not by this guest browser journey. |
| Reuse/time-saving | 90 | Explicit approved-final/source choice, no inherited vacancy/approval, inspectable reused CV and four-step repeat path were observed. Reusable-source edits and selected-line removal are explained. No measured real-world time saving is claimed. |
| Help/walkthroughs | 91 | Public task help is searchable, direct instructions use current field/control names, and five walkthrough tasks share interactive steps, transcripts and recorded media. First-check media reported readyState 4 and duration 111.275 seconds. Support offers a private receipt without signup and explains storage versus review. Full video playback and a live support submission were not exercised. |
| UI/accessibility | 86 | Clear desktop hierarchy, labeled inputs, progress, visible textual status labels, skip link and heading focus were observed. No horizontal document overflow at the normal viewport. This was not a full screen-reader, keyboard-only, zoom, mobile or formal contrast audit. |
| Trust/privacy | 90 | Device-local check, optional temporary recovery, separate private save, truthful-example consent, source/final-CV privacy confirmation and manual submission are clearly separated. Private-source storage, model consent and mailbox choices are explained in public help. Live privacy enforcement rests on separately supplied service evidence. |
| Reliability | 85 | The observed guest path remained stable after initial browser startup. TXT download completed and retained all synthetic source wording. Current PDF preview was created and its PDF-only download gate worked, but the IAB inline PDF panel was blank and was not treated as a rendered-PDF pass. Hosted evidence supports cloud rules and support boundaries; broad/paid discovery, live mailbox and production-scale reliability remain unverified. |

## What was directly observed

1. Homepage selected student guidance led to the free six-step check. “No finished CV yet?” supplies a plain-text starter route; no employment history is required.
2. A synthetic mixed-career CV and one vacancy produced seven source-linked findings. Explicitly absent employee-management experience and an unfinished MBA went to manual review. A numeric savings condition remained manual. Employment dates were not summed into five years of relevant experience.
3. Review retained every supplied line and allowed manual editing, optional truthful examples and explicit source maintenance. Approval required both factual review and privacy confirmation. PDF, DOCX, TXT and evidence-report controls were separate.
4. “Preview current PDF” produced a one-page receipt and blob preview link. IAB showed an empty inline PDF frame, so actual rendered-page appearance was not accepted as verified. No finding is raised solely from that browser behavior.
5. Approval enabled the export/reuse controls. “Use this CV for another vacancy” defaulted to the approved final CV, cleared the previous role/vacancy, reduced the journey to four steps, and offered inspection and undo. Returning from help/contact/walkthrough/auth navigation restored the current working draft and required new approval.
6. A fresh repeat application was independently approved without previewing PDF. DOCX/TXT became available while PDF stayed disabled. Actual TXT download completed at `C:/Users/user/Downloads/CV-Operations analyst.txt`, SHA256 **C3DD5C8EB2990391D9D65C586CC0D7E08860539350A124D9CFF52BC1D2C2A808**. The file preserved the complete synthetic CV, including team support, academic context, unfinished MBA, absent experience and unimplemented estimate. No evidence questions were inserted into the CV.
7. Help, public contact and walkthroughs were reachable without signup. Contact states no name/email is required, uses explicit up-to-90-day storage consent, promises neither review nor a response time, offers receipt lookup, and states no emails are sent. The form was not submitted.
8. The private-loop offer disclosed a ten-seat shared cloud pilot, bounded employer feeds, disabled checkout and unavailable broad paid search/mail access. Its CTA reached the sign-in boundary; no account was created or used.

## Reproducible issues and minimum useful fixes

### PM-01 — P2: supported team development is promoted out of the review queue

**Location:** `/check`, The evidence; `src/lib/cv-evidence.ts`, `analyzeRequirement` direct-status branch.

**Reproduce:** Enter target role “Operations analyst”. Paste the fixture below as CV text, then paste the two-requirement fixture as the vacancy. Continue to The evidence. For “Develop Python reports for operations planning.” the app displays **Direct wording found** beside “Supported a team that developed Python reports for operations planning.” It asks only the generic contribution/level reminder. Select **Focus on review questions**: the passage is hidden, and the two-case fixture shows no questions.

**Impact:** The quote is truthful and remains visible in the unfiltered view; this is not fabricated CV content or an eligibility verdict. However, the green status/count and review-only shortcut give support of another team's work the same treatment as personally doing the requested development. This affects projects, MBA team assignments and professional cross-functional work alike.

**Minimum fix:** Preserve an ownership/contribution review state for support/assistance/observation language whose nested action supplies the requested task. The current special handling for leadership, management and supervision should cover this demonstrated development pattern without broadly downgrading an applicant's explicit personal action.

**Acceptance:** The exact fixture yields partial/manual review, an explicit own-contribution question, and remains visible in **Focus on review questions**. A positive fixture “Developed Python reports for operations planning.” can remain direct. Neither fixture is rewritten, and existing negation/credential safeguards remain intact.

### PM-02 — P2: qualified academic-project wording can be treated as professional experience

**Location:** `/check`, The evidence; `src/lib/cv-evidence.ts`, `cvPassages` context classification and professional-experience guard.

**Reproduce:** With the same fixture, “Professional experience building Excel dashboards.” receives **Direct wording found** from “Built Excel dashboards for a university supply-chain project.” There is no academic-evidence badge or project-specific explanation. **Focus on review questions** hides it. The source context matcher recognizes adjacent “university project” but misses this explicit subject-qualified university project.

**Impact:** Academic source text survives intact, but the professional-experience distinction promised on the homepage does not remain in the actionable review queue. A user relying on the summary/filter can overlook the precise qualification that makes the experience unsuitable evidence for a professional-employment requirement.

**Minimum fix:** Recognize explicit qualified academic-project context conservatively, and make professional-employment requirements reviewable when the supplied evidence is academic/project work or context is uncertain. Keep a plain capability requirement distinct: academic Excel work can still be relevant to “Build Excel dashboards” while retaining its label.

**Acceptance:** The exact professional-experience fixture receives related/manual status, an academic/project label and an explanation that it does not establish professional employment. It remains in the review filter. “University project”, “university supply-chain project”, “MBA consulting project” and a project headed within an existing CV should retain their complete context. A clearly professional work example is not incorrectly relabeled academic.

Shared fixture (all fictional):

```text
Alex Example
Operations analyst | 2017–2025
Supported a team that developed Python reports for operations planning.
Coordinated weekly meetings with finance stakeholders.
Built Excel dashboards for a university supply-chain project.
MBA candidate, expected graduation 2027.
Customer service volunteer, 2024.
No direct experience managing employees.
Estimated annual savings of $50,000 in a classroom case study; the recommendation was not implemented.
```

```text
Operations Analyst
Requirements:
Professional experience building Excel dashboards.
Develop Python reports for operations planning.
```

**Observed summary:** 2 direct, 0 related, 0 missing, 0 manual; review-only view: “Nothing else in this view. Read the full job description before you approve your CV.” The generic no-qualification-verification caveat remains visible. No P0 or P1 shared-task blocker was established.

## Separately supplied cloud/service evidence

This section is not browser-observed proof, and it does not establish a real candidate's usability or outcomes.

- `docs/INTEGRATED-JOB-LOOP-HOSTED-VALIDATION.json`, SHA256 **E50B0FF0897F99F731EF3B9EA341E664B8CAFFFED2BD909DA3A37749603AC512**, records a passed hosted rules-only synthetic run beginning 2026-10-13T18:24:52.688Z: 75 checks spanning fictional records/claims/manual vacancies, actual document bytes, approval, owner isolation, repeat/tracking, scheduler dispatch/pause/cancel and withdrawal. It records zero paid calls, messages and application submissions. The parent reports candidate backend versions control 11 / worker 8 remain unchanged.
- `../jobvance-repair-evidence/cycle2-guest-support-live.json`, SHA256 **1DCA723B46C2AAF7082D8A718006D73AC761CF9D906DDCC852A45A36F5C4F108**, records nine passed actual HTTP checks ending 2026-10-14T03:28:39.365Z: fictional anonymous receipt create/read, wrong secret denial, idempotent retry, conflicting retry denial, invalid type/origin denial, anonymous-admin denial and forged-header gateway rejection. It records zero paid calls/sends and no persisted secret keys.
- The parent additionally supplied actual-SQL observations of private service-only table/RPC access, RLS, active daily retention and administrator operations limited to a tagged fictional receipt. Those SQL operations were not performed or independently rerun in this audit.

## Initial HTML and verification limits

Current `dist/.prerender/manifest.json` maps `/`, `/job-loop`, `/help`, `/walkthroughs` and `/contact` to route-specific HTML. Each inspected output contains one H1, real route content and a route-specific canonical at `https://jobvance.io`. The ordinary `dist/index.html` is the client shell; it was not confused with the mapped public prerender output. This is build-file evidence only; hosting delivery, crawl/index state, search ranking and traffic were not tested.

No authenticated browser flow, full PDF/DOCX content inspection, broad search integration, mailbox integration, paid model call, recovery expiry, mobile accessibility or real-user study was conducted. The initial browser navigation timed out before the homepage rendered on one explicit follow-up; it did not recur during the journey and is not treated as a proven production reliability defect.

These initial scores and issue observations are frozen. Any later source fix or focused retest should be recorded separately and must not overwrite the initial assessment.
