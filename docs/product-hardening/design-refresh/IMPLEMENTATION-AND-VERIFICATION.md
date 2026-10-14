# Jobvance copy and design refresh

14 October 2026. This report distinguishes changes, verification and editorial judgments. It does not certify a perfect journey, a search ranking or AI authorship.

## What changed

The homepage now leads with “Stop rewriting your CV for every job.” A short explanation names the two inputs and the reviewed download. The single primary action starts the free CV check. Audience buttons change a labelled example and editable starting guidance; they are not a required form.

The original visual system uses warm paper (#F6F3EC), forest (#215C43), ink (#172B24) and a restrained lime (#E2EEAF). Manrope Regular and Bold are self-hosted under their included SIL Open Font License. The original document/J mark appears in the header and SVG favicon. Shared type, account screens, public companion pages and footer use the same direction. Dark-section keyboard focus uses a contrasting outline.

The CV-to-vacancy example shows actual kinds of output: a source passage, a requirement, a wording finding and a review question. Invented example content remains explicitly fictional. The page explains reuse after the first task rather than opening with a feature catalogue.

Student, MBA and professional pages now have task-specific headlines and clearer first actions. “Busy professionals” includes people seeking a similar role at another employer. At narrow widths, audience tabs use readable short labels and retain their full accessible names.

The first check asks for one required role title; company is optional. Audience guidance, recovery details and resetting no longer compete with the first action. On phones, six readable progress items use a three-column, two-row layout. Optional source-reuse controls are collapsed behind “Reuse these edits later (optional)”; preview, approval, source replacement, removal and undo retain their existing safeguards. Saving copy explains that the check is free.

The free CV check leads the How it works page. Private Job Loop reuse is explained afterward. Help instructions now match the optional reuse disclosure and give the correct edit → save → confirm → prepare sequence. All 20 guide slugs and cited sources remain; titles, summaries and openings were reviewed for practical, supportive wording. Revision dates reflect this edit.

An audit also found a real extraction defect: a combined vacancy heading such as “Responsibilities and requirements:” was presented as a requirement. The parser now treats recognized combined headings as context while preserving actual inline criteria and source offsets. Nine regression cases were added; method remains english-literal-evidence-v4.

## Copy test

The same local Content Humanizer style heuristic returned 84/100 for the baseline home corpus and 90/100 after the rewrite. It checks vocabulary, sentence patterns and similar editorial signals. These numbers are not AI-authorship percentages; 90 does not mean 10% AI. The baseline itself scored reasonably while missing the exact slogan problem the owner identified.

All 38 prerendered public main elements were checked, including all 20 articles. None contained the five retired phrases: “A busy week.”, “A clearer application.”, “your next chapter.”, “A clearer story.” or “A clearer next step”. The HTML extraction includes closed disclosures and alternate responsive labels; it is not a separate audit of every private signed-in state. Detailed corpus hashes and heuristic output are retained outside Git in jobvance-repair-evidence/design-refresh-copy-check.json. No commercial authorship detector was used and no below-20% claim is made.

## Independent reviews

Three fresh implementation-independent reviewers assessed copy, first use and mobile/visual quality without receiving an earlier grade or a target score. Their original reports and scores remain intact. These are expert opinions, not customer interviews or a conversion experiment.

- Copy: clarity 88–89, naturalness 82–83 and task confidence 82–85 across the three personas. After the review, guide openings, help language, redundant questions and workflow order received further corrections. A bounded recheck is appended to that report rather than replacing its scores.
- First use: 90/100 overall opinion. The frozen guest journey reached source comparison, editing, a rendered one-page PDF preview, approval and TXT/DOCX request controls. Another edit cleared approval and downloads. The browser did not supply a reliable saved-file event, so filesystem completion was not independently certified. Separate document unit tests cover output structure.
- Mobile: original readiness 83/100 and aesthetic opinion 86/100. The subsequent bounded recheck confirmed repaired narrow professional tabs/button placement and larger progress labels, without inventing a new overall grade. The last remaining homepage metadata sizes were raised again after that frozen recheck; the live release receives a coordinator check.

The competitive reference pass examined six current official public product pages: Teal, Huntr, Jobscan, Rezi, Enhancv and Kickresume. The linked research notes separate observations from original design choices. No competitor outcome, traffic or superiority claim was adopted.

## Verification and limits

- 899 tests across 66 files pass, including new heading cases and interaction coverage for the collapsed optional controls.
- TypeScript and scoped quiet ESLint pass. Existing non-error Fast Refresh warnings were not introduced as new failures.
- Production build generates 38 public pages, 20 articles and 58 structured-data hashes without outbound prerender requests. The hosted compressed worker remains under its 3 MiB limit.
- Twelve host-worker check groups cover security/structured data, real page content, redirects, private routes, 404 status, exact assets/MIME/cache, HEAD/method behavior, project identity and size.
- Independent phone checks covered 320×844 and 390×844. After corrections, the professional primary action fits at y625–678 at 320px; the first check action fits at y787–831. The main check still starts with a role title; CV input is the next stage.
- No account creation, real candidate upload, paid model/search call, charge, advertisement, outreach or employer submission was part of this refresh.

Semantic matching remains bounded English wording analysis; review questions are not qualification verification. Real applicants should still be observed using the product before treating any opinion score as proven usability. Rankings and conversion lift were not measured. Existing walkthrough videos are preserved; their underlying screen recordings were not regenerated for the color refresh.

## Rollback

The remotely pushed tag jobvance-before-design-refresh-2026-10-14 points to runtime 18 commit 012b669385d3046d4f3676e0d7d8df8ecd1db623. Hosted saved version 18 is appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_9ae190abd5008191a5f6fbb221e79a28. Re-deploy that saved version to restore the prior public runtime. No database migration is needed for this refresh. The earlier v14 rollback remains available as well.

Publication identity and exact archive hashes are recorded in the accompanying release receipt after deployment.

## Published release

Version 19 was published successfully on 14 October 2026 at 05:01:00 UTC (09:01 Dubai), from source commit 57713fb1cb15b29be8d6dc745e3c87bcb718c4af. Saved version: appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_81b7e57381c081918f91c0ee3acb601e. Deployment: appgdep_6acf0c74eb3881919631b9a0035a402b.

Actual Jobvance.io verification passed 886 fresh HTTP checks with zero hard failures, including all 38 HTML pages, all 20 current guide headings/openings and 34 changed assets. Thirteen guide titles changed; seven retained their original titles. Both self-hosted fonts and the SVG favicon match exact build hashes. Existing media proof was reused without a media download.

The live browser shows the new headline and loaded Manrope font. The 390×844 opening view has no horizontal overflow and its primary button ends at y474; example metadata/status text is now 12px. Professional selection changes the example and free-check destination. Desktop and phone screenshots are retained with the receipt. Temporary viewport overrides were reset.

Source is on GitHub; the exact build archive and source ZIP are in jobvance-repair-evidence. The compressed build archive SHA-256 is CADFAB67EE895DFFC41E069A84E7138F685FB037DEBEC9577C7B54E993EDBEB8. Native canonical tar SHA-256 is 060cc5215f2fbd8b6391389f6a9a789a9786e8733a520361497491a5a9f09854. The compressed hosted worker is 2,769,914 bytes.
