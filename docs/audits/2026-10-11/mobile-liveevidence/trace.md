# Mobile live evidence — independent review, 11 October 2026

Temporary signed-out Codex IAB tab at https://jobvance.io. No account created, saved records inspected, personal file uploaded, provider invoked, message sent, application submitted or payment attempted. Fictional guest inputs changed only the device-side check. Browser viewport temporarily set to 390×844, then 320×740, and reset to default before this record was written. Screenshots at home, evidence, review and sign-in were visually inspected in the tool output. This evidence file records the UI observations; it is not a HAR, screen-reader audit or mobile-device recording.

## Fixture

Role: Graduate data analyst. Company blank.

CV, pasted as text:

```text
FICTIONAL MOBILE REVIEW
EDUCATION
BSc Statistics, Fictional University, 2026.
PROJECTS
Developed Python reports for a university project.
Analysed survey data using Excel and presented findings to a student team.
Supported project meetings and recorded decisions.
SKILLS
Python, Excel, statistics.
```

Vacancy, pasted as text:

```text
Graduate Data Analyst — Fictional Employer
Responsibilities:
Develop Python reports for business teams.
Analyse data using Excel and present clear findings.
Lead reporting projects with stakeholders.
Requirements:
Bachelor degree in statistics or a related subject.
Professional experience delivering Python reporting.
SQL experience is required.
Two years of professional analytics experience.
```

## Live observation sequence

1. Home at 390×844: mobile menu replaces desktop navigation; audience choices wrap to two rows; primary free-check link, no-account/no-card promise, and clearly labelled fictional example are readable. Entered /check?audience=student through the primary action.
2. Step 1: visible student guidance, six-step rail, labelled role/company fields, privacy warning: “Keep this page open while you work; refreshing it clears an unsaved check.” Role entered, continued.
3. Step 2: local file input accepts supported CV formats, paste textarea and character count visible. No file uploaded. Fictional CV pasted and confirmed.
4. Step 3 negative input: pasted `https://example.invalid/job` (27 characters), clicked Check these inputs. Alert: “Paste the full vacancy description (80–20,000 characters).” Active element remained the action button. Neither focus moved to the textarea nor a field-level invalid state was exposed in the observed DOM. At 390px: textarea width 309px, height 288px, font 16px; action height 44px; document width 375px, no horizontal overflow.
5. Step 4 positive input: full fictional vacancy accepted. Eight findings: 0 direct, 4 related, 2 missing, 2 manual review. The vacancy title/employer line was one of the eight findings. Leadership finding explicitly kept supported work distinct from leading it. SQL and two-year analytics experience had no passage. Matching wording caveat visible. Full vacancy available separately.
6. Evidence DOM measurement at 390×844: document height 6,640px; Review my CV & questions button document y=6,234px; Read the full vacancy summary y=6,163px, height 32px. Six Words used in this comparison summaries measured 32px high. All findings and Focus on review questions buttons were 44px high. No horizontal overflow. Rail labels computed 9px. The next-step action was below all evidence cards.
7. Step 5 at 320×740: no horizontal overflow (document/body width 305px). Main CV textarea width 239px, font 16px, height 320px; optional fact textarea width 199px, font 16px. Six progress columns measured 46px each. Screenshot showed guidance and rail taking much of the upper screen; review content starts below. No fact added.
8. Step 6: final preview, separate evidence disclosure, two approval checkboxes, disabled approval and disabled PDF/DOCX/TXT/report controls. Checked both fictional-content approvals and clicked Approve this CV; download controls unlocked. No download executed. Save-account action became enabled only then.
9. Returned to review, appended `Portfolio available on request.`, rechecked. Both approval checkboxes returned to unchecked; every download control disabled. Focus moved to Approve & download heading. Keyboard Tab order then reached final-preview SUMMARY, scrollable PRE, evidence SUMMARY. Thus the preview was keyboard-focusable in this browser even though no explicit tabindex appeared on the PRE.
10. Draft-loss reproduction: clicked the check's Privacy link while at step 6, read /privacy, then browser Back. Returned to /check?audience=student at blank step 1; role/CV/vacancy were gone. No warning/retention choice appeared before navigation. Public privacy copy mentioned page close/refresh and explicit Google handoff retention, but not internal-route loss.
11. Mobile menu: opened from toggle, pressed Escape while focus stayed on Close navigation. Menu remained expanded. Navigated to Job Loop using menu link. Signed-out /loop redirected to /auth?next=%2Floop with generic sign-in form and no current loop capability preview. No sign-in attempted. A later menu test opened menu, Tabbed into first link, then Escape: menu collapsed and focus returned to toggle.
12. /contact public page: “Direct support contact details are currently unavailable. Real-money purchases remain disabled until support is available.” /help public page: six-step workflow, link to existing workspace, no specific paste/download/recovery troubleshooting.

## Boundaries

Not verified: real iOS/Android, virtual keyboard occlusion, assistive technology speech, 200%/400% zoom, contrast audit, network interruption, service-worker/offline behavior, private account saving, actual document generation/downloads, private Loop screens, search/provider/Gmail execution, timing or measured conversion. No WCAG conformance claim. Source/release evidence is separately labelled in mobile.md.
