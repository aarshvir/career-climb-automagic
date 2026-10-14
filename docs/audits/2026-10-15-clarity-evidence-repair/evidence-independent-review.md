# Independent evidence-engine release review

Date: 2026-10-15. Scope: the current `src/lib/cv-evidence.ts` clarity diff and its new regression fixtures. Read-only runtime review; no provider calls or real candidate data.

## Initial decision: two bounded corrections required

1. **Mixed contact lines lose legitimate nontechnical skills.** `contactOnly` (`src/lib/cv-evidence.ts:284`) retains explicitly declared skills next to an email or URL only when a token appears in the `TECH` set. Local synthetic comparison against the committed source reproduced:
   - `Skills: Stakeholder management | alex@example.test` versus `Stakeholder management required.`: committed source returns partial with the original quote; initial clarity diff returns missing with no evidence.
   - `SKILLS\nFinancial analysis | https://portfolio.example.test` versus `Financial analysis required.`: the same partial-to-missing regression.
   The customer consequence is disappearance of real management/analysis evidence merely because contact details share the line. Preserve meaningful declared-skills content after removing contact tokens, and retain the exact original source quote.
2. **A negative compound gains unsupported technology evidence.** The hyphen splitter (`src/lib/cv-evidence.ts:268`) protects `non-`, `no-`, `not-`, `without-` and `un-`, but not `anti-`. `Skills: anti-SQL databases` versus `SQL required.` changes from missing to direct in a local synthetic comparison. Protect the negative compound so splitting cannot manufacture a positive SQL claim. This is a wording-engine regression, not a claim that this rare spelling is common in customer CVs.

Both findings were sent to the implementation owner and coordinator before release; this reviewer made no runtime edits.

## Other reviewed behavior

The new qualification identity filter (`src/lib/cv-evidence.ts:412`) correctly stops `Supported six analysts.` from being offered for `Six Sigma certification required.` in the local comparison. Generic completion/current/certificate words cannot alone admit a passage for a differently named qualification. Full matching and the existing credential-completion guards still control direct evidence.

Contact details are removed from comparison text rather than from source text. `publicPassage` returns the complete original line/bullet and its original offsets. Support/contribution, pending/negative qualifications, projected results, academic context and duration checks remain in the admission path. Restricting automatic bullet ranking to direct evidence reduces reordering caused by weak overlap and preserves source text.

This is a bounded code/fixture review. It does not validate real applicant qualification, hosted provider behavior, employer acceptance or conversion rates.

## Final decision after correction

**Clear for the coordinator's release checks within this scope.** The implementation owner corrected both findings and added the exact regressions. Declared nontechnical skills now survive contact-token removal while named contact fields still do not become evidence; `anti-` and `contra-` compounds are protected from splitting into unsupported technology claims.

This reviewer independently ran four narrow suites: `cv-evidence-clarity-regression.test.ts`, `cv-evidence.test.ts`, `evidence-context-regression.test.ts` and `independent-review-evidence.test.ts`. **124/124 tests passed.** Scoped whitespace validation passed. Independently replaying the exact cases confirmed:

- Stakeholder-management/email and financial-analysis/portfolio lines are partial evidence again, with exact original quotes and offsets.
- `anti-SQL` does not produce SQL evidence; a team of six does not produce Six Sigma qualification evidence.
- Projected savings that were not implemented remain review items; a pure contact field produces no evidence.

No additional material regression was identified in the requested diff. This is not a claim of complete natural-language coverage or production-provider validation. The coordinator owns broader tests, build and publication.
