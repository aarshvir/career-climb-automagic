# Applications home browser acceptance

15 October2026. Actual `ApplicationsHome` React component, isolated local mock adapters with created examples; no real account, database or paid service. This is interface acceptance, not hosted authenticated integration.

- Mixed saved check, pack with a real fixture pack_id-linked tracker, and Loop vacancy appear as three distinct items.
- Selecting Finance Associate shows the exact vacancy, both CV versions, interview status, follow-up date and interview notes. Pack/tracker continuation links carry their distinct opaque IDs.
- Search for Finance filters the loaded list to that pack without changing the selected record.
- At390×844, document width375 is within the viewport. The list and detail stack; no horizontal overflow was observed. Initial list selection left detail below the viewport; a bounded focus/scroll correction was made and regression-tested.
- After the correction, choosing Operations Analyst focuses the Application details region and brings its selected saved check into view (settled top≈100px). The original/final distinction, exact check URL and no-submission status remain visible.
- Screenshot evidence is in the private sibling repair-evidence directory: applications-home-desktop.png, applications-home-mobile.png, applications-home-mobile-detail.png. All contain created examples only. Temporary viewport was reset and the inspection tab closed.

No hosted sign-in, actual customer application, backend mutation, native export, historical pagination or unassisted success was newly verified here. Guest hosted authentication return is checked separately after release.
