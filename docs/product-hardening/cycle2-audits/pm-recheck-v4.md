# Separate PM recheck — evidence v4

**Result: both original reproduced issues pass the focused browser recheck.** Appropriate positive examples still receive direct wording status. This is a separate result for a newer candidate; the initial assessment and its **87.4 overall / 78 evidence-quality** scores remain frozen and were not recalculated.

## Provenance and scope

- Window: **2026-10-14T03:47:57.103Z–03:49:09.382Z** (07:47–07:49 Asia/Dubai).
- Actual guest preview: `http://127.0.0.1:8383/check`.
- New independent Chrome tab `1385099318`, browser `1`, session “🔎 PM retest”. The prior IAB browser was unavailable, so a new audit-owned Chrome tab was used. No browser-scoped viewport changes were made.
- `src/lib/cv-evidence.ts`: **C1D09F00F9BC452C09ABC51938B3F3C2C879981DB10E8482FDB5C0AD4B337884** at start and end. Its method constant is `english-literal-evidence-v4`.
- `src/pages/CvCheck.tsx`: **21CC4035208CE26238ED13A5C4850EA45EAC2AA5A48C575D3B1F263970D701E8** at start and end.
- No drift in these two reviewed runtime files during this recheck. Other root audience/help/focus changes were declared by the parent; this was treated as a new candidate, not the original frozen build.
- The initial `pm.md` hash remained **7EC813F8508B96DD6CD075411ED734F0D8AAA6489D414709976FA05AFFA6EB7E**, and `pm.json` remained **AE2D09A780740EE6FD168BF94D46D9EA69A0BE17478DC67B05C8767F3CF67263**, before and after the browser recheck.
- No runtime edit, commit, deployment, signup, account save, live support write, paid call, send or employer application was performed.

## Original-case recheck

The exact original mixed-career CV and two-requirement vacancy from `pm.md` were entered through the public form, beginning with a fresh guest check. No source behavior was simulated.

| Case | Browser-observed result | Targeted outcome |
| --- | --- | --- |
| PM-01: “Supported a team that developed Python reports for operations planning.” versus “Develop Python reports for operations planning.” | **Related passage — review needed**. The complete source quote survives. Explanation: “Your CV describes supporting or contributing to the work. It does not yet show that you carried out the requested action yourself. Keep your own contribution clear; add independent responsibility only if accurate.” | Pass for the original support-owned development reproducer. |
| PM-02: “Built Excel dashboards for a university supply-chain project.” versus “Professional experience building Excel dashboards.” | **Related passage — review needed**, with **Project / academic evidence** label. Explanation: “The related source includes academic, project or volunteer work. It does not establish the professional employment experience requested. Keep its context visible.” | Pass for the original qualified academic-project reproducer. |
| Combined count and review filter | **0 direct, 2 related, 0 missing, 0 manual**. Selecting **Focus on review questions** left both cards and their explanations visible. | The original shortcut/summary failure is resolved for these cases. |

## Positive counterexamples

The source CV was replaced through **Your CV**, then a new three-requirement vacancy was checked. These are fictional statements used to verify classification, not verified professional history.

```text
Alex Example
Professional experience
Operations Analyst | Example Company | 2017–2025
Developed Python reports for operations planning.
Built Excel dashboards for monthly finance reporting.
Academic projects
Built Tableau dashboards for a university supply-chain project.
```

```text
Operations Analyst
Requirements:
Develop Python reports for operations planning.
Professional experience building Excel dashboards.
Build Tableau dashboards.
```

Observed summary: **3 direct, 0 related, 0 missing, 0 manual**.

- Personally stated Python development remained **Direct wording found**, labeled **Employment section**.
- Excel development under explicit professional experience remained **Direct wording found**, labeled **Employment section**.
- The plain Tableau task remained **Direct wording found** from the academic example, retained **Project / academic evidence**, and explained that it does not establish professional employment experience. The fix therefore did not indiscriminately treat academic capability as missing.

## Limits

This independently verifies the two original failures, their review-filter behavior, and the three positive comparisons above in the browser. It does not certify arbitrary contribution grammar, every academic-context pattern, all original acceptance variants, all other product changes or a complete regression suite. The parent's reported 103 focused tests and passing typecheck were supplied evidence; they were not run or counted as this reviewer's browser proof. No new overall or dimension score is assigned.

## Appendix — root additional cases, final bounded v4 recheck

**Result: all four requested comparisons pass independently in the browser.** This appendix records a later source revision; it does not replace the earlier v4 hash, observations or frozen initial grades.

- Window: **2026-10-14T04:02:40.350Z–04:03:37.367Z** (08:02–08:03 Asia/Dubai).
- Actual guest preview: `http://127.0.0.1:8383/check`, new audit-owned Chrome tab `1385099330`, browser `1`, session “🔎 PM final cases”. No browser-scoped viewport changes.
- Final `src/lib/cv-evidence.ts` SHA256: **BDD240DE9652E968F04031ECBDCA9AB3212F12220AC73CDE0881B17A3244E061**, unchanged at start and end. `src/pages/CvCheck.tsx` remained **21CC4035208CE26238ED13A5C4850EA45EAC2AA5A48C575D3B1F263970D701E8**.
- Before this appendix, the prior recheck document hashes were `395C2971077D4BAFF6567EB3A0BC304671EABF7108ACE149F6F946F4D6DA791D` (`pm-recheck-v4.md`) and `FFD80B7C1411619E90C012BB4EAC6F2D902A26138DFB175FE60C67F9EFB89101` (`pm-recheck-v4.json`). The earlier source SHA **C1D09F00F9BC452C09ABC51938B3F3C2C879981DB10E8482FDB5C0AD4B337884** above is intentionally retained.
- `pm.md` and `pm.json` still matched their frozen hashes at start and end. No rescore, runtime edit or service write was performed.

The first guest fixture was:

```text
Alex Example
MBA candidate, expected graduation 2027.
Built Excel dashboards for an MBA consulting project.
Supported the team that developed Python reports for operations planning.
```

The vacancy contained these two requirements:

```text
Professional experience building Excel dashboards.
Support the team and develop Python reports for operations planning.
```

Observed: **0 direct / 2 related / 0 missing / 0 manual**. The MBA passage had **Project / academic evidence** and explicitly stated it did not establish professional employment. The compound-task passage explicitly stated support did not yet show the applicant carried out the requested action. Both complete quotes and both cards remained visible after selecting **Focus on review questions**.

For the positive comparison, the Excel source stayed unchanged, the Python source became “Developed Python reports for operations planning and supported the team.”, and the Excel requirement became “Build Excel dashboards.” The compound Python requirement stayed unchanged.

Observed: **2 direct / 0 related / 0 missing / 0 manual**. The plain Excel capability matched directly while retaining the academic/project badge and professional-employment limitation. The developed-first Python source matched the compound support-and-develop task directly. Thus a requested support action did not bypass the separate development ownership check, while an explicit personally stated development action was still usable.

This appendix covers these four exact fictional comparisons and their negative-case filter behavior. It does not expand the earlier recheck into a full release certification. The parent's reported 65 passing evidence tests are supplied evidence, not this reviewer's test execution. No paid calls, signup, account saves, support submissions, real-data changes, sends or employer applications were performed.
