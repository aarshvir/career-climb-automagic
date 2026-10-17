# Deep Tailor integration review — 17 October 2026

Reviewed Claude `github/claude/deep-tailor` against the current main baseline, then reviewed the root agent's Loop provider/worker/composition integration. The branch was merged by the coordinator; this review did not deploy or make paid calls. Original Claude simulation files are preserved.

## Findings repaired

- A confirmed answer was originally an unscoped string that could be attached to another employer or used to strengthen an unrelated bullet. Each answer now requires an explicit original CV line. Aligned source references are checked by request validation, assembly and browser response validation. Summaries must cite the actual chosen source. Reuse binds the original CV, job description, title and company.
- Negative, uncertain and projected evidence cannot be reworded into an asserted result. Mixed ownership passages such as “Supported a team that led…” keep exact wording in Loop.
- Six accumulated answers could previously silently omit the new answer while consuming another allowance. Overflow and already-included answers now stop before the AI call. A synchronous operation guard prevents duplicate requests before React rerenders.
- Removing an added line previously removed the first matching string even when duplicated. Ambiguous matches now preserve all text and request an exact manual edit. Reverted answer-based changes withdraw those answers from subsequent requests.
- The standalone tailoring handler now requires valid account authentication before reservation or provider processing. No gateway JWT configuration change is required.
- Loop originally reduced metered rewrite receipts to ID/text pairs before composition. Full original revision, quote, approved phrasing, context, kind and result status now survive retries and must match the current source at composition.

## Loop contract

Only active, confirmed, shareable eligible claim wording and context are sent with the vacancy. The full raw CV, unshared facts, name and contact line are excluded from the model prompt. Each proposed rewrite is validated against its own approved phrasing, not pooled evidence from another claim or employer. Numeric facts must be retained; introduced names, qualifications and stronger ownership are rejected by bounded lexical checks.

Source claims and their revisions remain unchanged. Candidate-facing CV text may use the proposed wording; the evidence report retains the approved wording, original quote and separately labelled proposal. Rendering PDF/DOCX/TXT is preparation and does not approve the artifact. Existing exact-text approval, current source/version authority and download gates remain required.

## Verification

- 57 tests passed across `job-loop-deep-tailor`, `job-loop-deep-tailor-integration`, `job-loop-providers` and `job-loop-engine` after the integration repair.
- 138 tests passed across `job-loop-recurring-product`, `cv-tailor`, `pass-handlers`, `cv-check-ai-tailoring` and `deep-tailor-support` in a separate focused run; these counts overlap other runs and must not be added as unique tests.
- The latest CV component run passed 21 tests, including the subsequently added batched duplicate-click regression. App TypeScript passed after the implementation changes.
- Integrated tests execute actual provider-response parsing, composition and PDF/DOCX/TXT rendering with fictional records and a network fixture. They confirm private fields are absent from provider payloads, source records remain unchanged, altered/revoked receipt authority rejects, and generated text remains unapproved.
- Malformed answer references, absent bindings, unequal counts, non-existent/header source lines, cross-employer placement, negated ownership, forecast promotion and response citations for unknown answers have explicit regressions.

## Limits

This is a bounded code and fixture-based integration review. It is not an independent semantic-fidelity guarantee, provider quality benchmark, hosted end-to-end acceptance, real customer study, observed multi-day delivery or release sign-off. Lexical validators cannot prove every paraphrase preserves meaning; exact artifact review remains necessary. No actual paid model output was generated in this subtask. Historical tests and release receipts retain their original scope; coordinator full-suite/build/deployment evidence is separate.

The following persona file is a new source-informed forecast for unchanged invented personas P001–P050. It is not a rerun of real people, a survey, or an empirically measured NPS. Do not optimize its ratings to meet the owner's +60 target. Recurring subscription purchase mapping, broad industry/visa coverage and actual repeated multi-day usefulness remain incomplete or unobserved.
