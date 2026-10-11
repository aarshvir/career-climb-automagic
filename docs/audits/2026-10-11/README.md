# Jobvance customer-perspective audit — 11 October 2026

Audit snapshot of live version 10 and source commit `2d1ad90356a7c952740dde2c9bf02ab5880a1414`. Six independently prompted simulated customer reviewers ran in two parallel batches of three. This is not six human customer interviews or a market certification.

**Overall readiness: 60.9/100. Core audience readiness: 56.8/100.** The detailed report preserves the ten-dimension rubric, individual judgments, evidence boundaries and 22 prioritized improvements.

- [Complete report, score matrix, backlog and all six assessments](Jobvance-audit-report.md)
- [Interactive HTML report](Jobvance-audit.html) — download this folder and open the file locally; GitHub's file view shows HTML source.
- [CSV scorecard](Jobvance-scorecard.csv)
- [Methodology](METHODOLOGY.md) and [baseline](audit-baseline.json)
- [Student](student.md), [MBA](mba.md), [career switcher](switcher.md), [UAE applicant](uae.md), [career coach](coach.md), [mobile applicant](mobile.md)
- [Fictional evidence reproduction](root-evidence-reproduction.json) and [mobile trace](mobile-liveevidence/trace.md)
- [Suggested implementation priorities](../../JOBVANCE-IMPLEMENTATION-PRIORITIES.md)

Public screenshots, UI observations and fictional inputs accompany the reports. No personal CVs, mailbox contents, credentials or signed artifact URLs are included. An independent pre-push review checked this package. Local file links were made portable; source links are pinned to the audited commit. Scores and conclusions were not changed.

The audit did not change product code or deploy a release. Private cloud journeys were assessed through source and prior release evidence rather than a new authenticated customer run. Later publication of this audit to GitHub was authorized separately by the owner.

To rebuild the report from these inputs with Node 24:

```sh
node docs/audits/2026-10-11/build-audit-report.mjs
```

The reproduction script imports the checked-out implementation. Run it only against the audited commit when reproducing the original defect; later fixes may correctly make its defect assertion fail. It uses entirely fictional data and makes no network calls.
