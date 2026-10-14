# Evidence check: independent reproduction and bounded repair

15 October 2026. Baseline source: `9498b07b964f4c1a0dc160674ec544c7cd5f7144` / v26. Scope: `src/lib/cv-evidence.ts`, one new regression file and this report. No changes to Claude's review or its fixtures, other application modules, provider settings or production records. The baseline rollback is managed by the coordinator.

## What was reproduced

I read E05/E06 in `docs/audits/opus-customer-journey-review/EVIDENCE.md:50`, then executed the actual current evidence module locally against the two supplied text fixtures, with the entered title **Head of Operational Excellence**. The module was transpiled in memory; the fixtures were read without modification. No model or network call was used.

The baseline reproduces Claude's observations exactly:

- 14 findings: **0 direct, 6 partial/related, 2 missing, 6 manual review**.
- `About the role` is a finding rather than a section label.
- The contact line is offered as an action passage for the opening role narrative. The raw action detector finds `test` inside `priya.test@example.com`; the word `UAE` supplies a shared anchor. This is evidence pollution, not proof of work.
- `Proven record of delivering measurable cost savings` cites the general profile's `cost` passage, but omits the specific `Ran a vendor consolidation that saved AED 2.1M a year` bullet.
- `Partner with technology teams on automation and forecasting tools` is marked missing despite the demand-forecasting pilot passage.
- The first role's bullet order changes from **replenishment → KPI → vendor savings → cross-functional team → forecasting** to **KPI → cross-functional team → replenishment → vendor savings → forecasting**. Thus the savings bullet moves from third to fourth.

The initial new 20-case acceptance suite had 9 failing cases against the baseline. Three further contact-boundary cases were added during review. A subsequent browser check found a separate false related credential: `Supported inventory reporting for a team of six analysts.` was offered for `Lean Six Sigma certification required.` solely through `six`. That case and two neighboring generic-credential/status cases failed before the added admission guard; a fourth check protects genuine named qualifications and related degree subjects. A separate reviewer then identified two introduced regressions, documented below; six further cases cover their correction and metadata boundaries. The final new file contains 33 cases.

## Correctness errors and conservative limitations are different

| Observation | Assessment | Bounded correction |
|---|---|---|
| A section label becomes a requirement | Confirmed parser error | Recognize `About the role` as a heading. Preserve following criteria and exact omitted-label offsets. Do not suppress the entire section. |
| Email/URL words are treated as actions or skills | Confirmed source-classification error | Strip contact tokens only in the private comparison representation and exclude contact-only lines. Public quotes retain exact original slices. Genuine work, credentials and explicit technical skills next to contact details remain usable. |
| `demand-forecasting` does not overlap `forecasting` | Literal normalization gap | Compare bounded alphabetic compound components. Preserve short technology names and negative-prefix compounds, including Objective-C and non-SQL. |
| `saved` does not overlap `savings` | Literal inflection gap | Add a limited save/saved/saving/saves family, savings equivalence and the plural costs form. This reveals a related passage; it does not invent delivery, financial ownership or any other missing facet. |
| After compound normalization, `forecasting` is still discarded as a generic action | Confirmed anchor-selection limitation | Allow the subject of explicit forecasting/reporting/budgeting artifact phrases, such as forecasting tools, as a related anchor. Other facets still need their own evidence. A generic shared `led` does not become a relevant passage. |
| A team count of `six` appears as evidence for Lean Six Sigma | Confirmed qualification-candidate admission error | A named qualification needs a shared identity or subject term. A number-word, generic certificate, or current/active status alone cannot nominate a passage. Keep those words in the full comparison so an actual Six Sigma credential still matches. |
| Any partial action overlap changes bullet priority | Confirmed weak basis for changing the candidate's emphasis | Require direct action evidence before automatically reordering a safely bounded experience block. Partial-only results retain the original order. |
| The fixture has zero direct findings | **Not, by itself, a correctness defect** | Do not inflate the count. The current check requires literal facets in one passage and preserves uncertainty, alternatives, qualifications, contribution level and numeric constraints. This remains a wording check rather than a hiring verdict. |

The fixture is topically relevant, but it does not establish every responsibility of leading operational excellence across 40 stores. Coordinating a cross-functional team is not automatically leading change programmes. The Lean Six Sigma credential is absent. An `or` requirement, a numeric scope or an unestablished date/duration still warrants review. No change here promotes those into a direct match.

## Implementation

- `src/lib/cv-evidence.ts:48`: method becomes `english-literal-evidence-v5`, so saved review fingerprints distinguish the changed comparison method.
- `:56`: the exact role-heading label joins the existing known headings; inline criteria remain parsed.
- `:89` and `:102`: bounded save-family and costs/savings forms.
- `tokens()`: alphabetic compound normalization leaves punctuation-sensitive technologies and negative-prefix compounds intact. This changes only comparison terms, never the source text.
- `withoutContactDetails()` at `:278`, `contactOnly()` at `:284`, and `cvPassages()` at `:294`: contact-token removal, contact-only detection and a private `matchText` representation. Action, uncertainty, contribution, ownership and duration checks use that representation. Public evidence still uses the full original logical source line, UTF-16 offsets and one-based line number. Explicit declared skills retain meaningful technical and nontechnical content; pure contact fields do not become skills.
- `:405`–`:430`: explicit artifact subjects can supply a related anchor. Named qualification candidates require an identity/subject anchor; generic status/certificate words and number-words alone are insufficient. Full-match, contribution and uncertainty checks remain required for direct findings.
- `prioritizeCvForVacancy()` and the direct-action gate at `:534`: only direct action findings can influence automatic ordering. Ambiguous wrapped blocks, roles, headings, original line bytes and stale-offset refusal retain their existing safeguards.

## Result on the unchanged supplied fixtures

| Measure | Before | After |
|---|---:|---:|
| Findings | 14 | 13 |
| Direct wording findings | 0 | 0 |
| Related/partial | 6 | 7 |
| No passage | 2 | 1 |
| Manual review | 6 | 5 |
| Contact citations | Present | 0 |
| Specific vendor savings passage shown | No | Yes, as related evidence |
| Demand-forecasting passage shown | No | Yes, as related evidence |
| First role reordered on partial overlap alone | Yes | No |

The final function output equals the complete original fixture string exactly, including its line endings. This preserves the savings bullet's third position instead of moving it down. The savings passage remains partial; the forecasting passage remains partial; the absent Lean credential remains missing; coordinated work is not upgraded to leadership.

## Verification

New file: `src/__tests__/lib/cv-evidence-clarity-regression.test.ts` — **33 passing cases**. It covers the supplied fixture, heading/context preservation, contact-only email/URL evidence, portfolio URL false actions, genuine mixed work and technical/nontechnical skills, hyphen normalization and anti-/contra- prefixes, technology punctuation, save-family ownership/negation/projected/academic boundaries, named-qualification candidate admission, quote offsets and partial-only ordering. The full synthetic browser CV now gives no passage for Lean Six Sigma; the actual qualification still gives a direct wording finding, and a different degree in the same Engineering subject remains related rather than direct.

Final related run: **230 passing cases across 13 files**, exit 0:

```text
vitest run src/__tests__/lib/cv-evidence-clarity-regression.test.ts src/__tests__/lib/cv-evidence.test.ts src/__tests__/adversarial/free-cv-evidence.adversarial.test.ts src/__tests__/lib/evidence-context-regression.test.ts src/__tests__/lib/vacancy-heading-context.test.ts src/__tests__/lib/free-check-export.test.ts src/__tests__/lib/free-check-api.test.ts src/__tests__/cv-check-review-state.test.tsx src/__tests__/cv-check-operation-owner.test.tsx src/__tests__/cv-check-journey.test.tsx src/__tests__/cv-check-source-save.test.tsx src/__tests__/cv-check-work-preservation.test.tsx src/__tests__/cv-check-independent-navigation-save.test.tsx --maxWorkers=2
```

Application TypeScript: `tsc --noEmit -p tsconfig.app.json`, exit 0. All execution used fictional local text and mocked account/document boundaries where the existing component suites require them. No production account, employer action or paid service was used.

### Independent follow-up review

The separate reviewer found two introduced regressions before release: the initial contact heuristic retained only technical skill names and dropped `Skills: Stakeholder management | alex@example.test` and `SKILLS\nFinancial analysis | https://portfolio.example.test`; compound splitting also turned `anti-SQL` into an asserted SQL skill. Four exact cases reproduced those failures. The final heuristic retains meaningful explicit skills regardless of domain while keeping pure Email/Portfolio fields out of evidence, and anti-/contra- compounds remain intact. Two additional metadata-only cases protect that boundary. The reviewer reran its narrow suites and replayed the corrected cases, the team-six credential case, projected savings and pure-contact cases, clearing both findings with no additional material regression identified in scope. These are overlapping local checks, not extra customer sessions or customer-success evidence.

## Remaining scope and risks

1. This is still an English literal check. It does not perform semantic tailoring, rewrite a headline/summary, prove qualifications, reconstruct the original document formatting, infer employment duration or predict an interview. Zero direct findings is still possible for a relevant applicant.
2. Common verbs such as run/ran, present/presented and introduce/introduced remain outside parts of the limited action vocabulary. Consequently some genuine work still receives a conservative manual/related result or an imperfect explanation. This change does not quietly turn the vocabulary into unrestricted synonym matching.
3. Contact-only detection is deliberately conservative and heuristic. Concise statements using unsupported vocabulary beside an email may be omitted from comparison; the full CV text remains unchanged and visible. Mixed actual actions, skills and credential boundaries are tested, rather than claiming every CV layout is understood.
4. Direct-only prioritization produces fewer automatic changes. It is a safer fallback while richer, source-bound tailoring is developed; it is not a claim to have completed Claude's broader F1 proposal.
5. The opening company/role narrative still appears as a manual-review context item when it contains criteria the parser cannot safely classify. Only the definite section-label error is removed here.
6. No hosted session, native download, visual presentation or live backend integration was exercised by this subtask. These local results do not justify a forced 95/98 score or a claim of best-in-class customer outcomes.

No commit, push, deployment or mutation of Claude's evidence files was performed by this subtask.
