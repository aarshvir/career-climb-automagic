# Discovery relevance guard — 2026-10-13

This is a deterministic relevance filter for automatically found vacancies. It uses the existing declared target titles, desired work locations, explicit years, excluded terms and optional compensation preference. It does not change the profile, API or database contract. Candidate-added manual vacancies remain the candidate's choice even when they conflict with the discovery guard.

## What changed

Every meaningful target role term must occur as a complete term in the vacancy title. A match for one generic term such as “analyst” or “business” no longer satisfies “Business Analyst.” Matching remains per target direction, so a separate Senior Consultant target cannot make a Graduate Analyst target senior-compatible.

Small title normalizations are limited to case/Unicode normalization, listed role-noun plurals, front-end/frontend, back-end/backend, full-stack/fullstack, and preserving distinct C++/C#/.NET terms. Short terms such as AI, BI, HR and IT are retained. Stop words and explicit title rank words are handled separately. Junior/graduate/intern/entry-level intent conflicts with senior/lead/head/director/principal/chief/VP and technical Staff Engineer/Developer/Scientist titles. “Lead generation” retains its role meaning. Audience labels never establish seniority, experience or eligibility. Plain matching titles without level evidence remain admitted with seniority unknown.

Location matching uses complete words, the UAE/UK/US/USA/NYC aliases, and four limited city/country mappings: Dubai and Abu Dhabi to the UAE, London to the UK, New York to the US. Those mappings describe desired work locations; they do not establish candidate residence. Partial compatible location strings are supported. York does not match Yorkshire or New York. This is not a global geographic database.

Remote is distinct from hybrid and negated remote wording. Stated country scopes and supported “must be based in” restrictions matter. A Dubai-plus-Remote preference does not automatically admit Remote-US roles. A Remote-only preference carries no residence evidence: a restricted remote role may be retained for review with location unknown. A worldwide-only preference requires worldwide evidence. A company-office paragraph is not treated as a candidate restriction. Region labels and unsupported conditions remain a limitation; no citizenship, protected trait or sponsorship eligibility is inferred.

Required experience recognition supports explicit English minimum/required wording, numeric ranges and N+ years, with a small English number-word list. The range lower bound is the required minimum. Negation, preferences, degree-or-experience alternatives, company history and unsupported foreign text stay unknown. A supplied total-year number can disprove a larger mandatory minimum; matching the number does not certify the required domain expertise. Candidate years are never inferred from dates, qualifications or audience.

Pay is compared only from supported explicit salary/base/pay/stipend text containing an ISO currency and an explicit annual, monthly or hourly period. Annual/monthly conversion uses twelve months per year. Same-period hourly comparisons are possible, but working hours and foreign-exchange rates are never invented. The supported ISO list is AED, USD, GBP, EUR, SAR, INR, CAD, AUD, CHF, SGD, QAR, KWD, BHD, OMR, JPY, NZD and HKD. Dollar signs alone, multiple currencies in one clause, omitted periods, bonuses/OTE and complex packages stay unknown. A trailing k/m on a range is shared across its amounts. Only an explicit comparable maximum below the preference rejects discovery; a range overlapping the preference is retained with `range_overlaps_minimum`, and a “from” amount below the preference has no known ceiling. Undisclosed pay is never estimated from a role or location.

Existing literal title/company/description exclusions are preserved and the source URL is also checked, allowing employer-domain exclusions. Unknown evidence never changes an opportunity's source verification or becomes an eligibility certification.

## Runtime boundary

Employer-feed and web-search insertions use the same guard. Search results with an empty location field cannot satisfy a requested physical location merely because the query contained it. That can reduce search recall until the candidate supplies complete source text.

Existing automatic source facts are refreshed even when a vacancy stops matching; their application history is retained. They are excluded from the current shortlist, packet reuse and fresh preparation when they conflict. Resumed automatic preparation is rechecked before document/provider work. Manual records bypass discovery filtering. The prior separate assessment-flag veto was removed because the older assessment parser can interpret optional or negated years as mandatory; assessment flags themselves remain unchanged in this patch.

## Evidence and limits

The dataset in `src/__tests__/lib/fixtures/employer-discovery-cases.ts` contains 65 author-written, explicitly labelled `synthetic_contract_case` fixtures. Each has an ID, audience, covered guards, expected decision/evidence and rationale. The cases include both admissions (recall safeguards) and rejections (precision safeguards), across student, MBA and professional profiles, rather than padding many near-identical examples. No fixture represents a real candidate, customer or live job. The test results show the declared contract holds for these examples; they are not a statistical precision/recall estimate or market-coverage proof.

Adapter integration tests exercise Greenhouse HTML preservation and Lever title/location text using fictional responses. Runtime integration tests check manual control, negated experience, changed automatic records, packet reuse and resumed preparation. No paid model/search call, provider key, candidate CV, outgoing message or deployment was used.

The observed adapter code reads at most the first 100 listings per configured feed, accepts descriptions between 80 and 20,000 characters, and marks feed records `listed_on_source` rather than eligible or currently open. Default boards are Careem, GoCardless and Duolingo, configurable to at most four Greenhouse/Lever feeds. These are source configuration facts, not measured useful-vacancy coverage. This change did not fetch live job feeds or establish how many current roles match each audience. Lever structured workplace/salary metadata is currently discarded by the adapter; this guard only sees preserved title, location and description text. A separately reviewed, deidentified live-vacancy sample and blinded relevance labels would be needed before making a claim about discovery quality across the market.

The filter is intentionally narrower than semantic search. Exact role wording can miss legitimate synonyms and combinations, while extra title words can still create ambiguous matches. Geography and requirement language coverage is limited. Natural-language pay packages are not a compensation parser. Human source review and explicit eligibility/pay unknown states remain necessary.

## Local validation

Focused discovery, adapter and preparation tests; relevant runtime/provider/process/replay suites; TypeScript; and lint on changed implementation/tests were run locally. Backend bundling and deployment are separate integration steps handled by the coordinating task. No deployment is claimed here.
