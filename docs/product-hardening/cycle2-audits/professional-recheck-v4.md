# Professional/MBA targeted recheck — v4

**All three original findings pass the targeted browser recheck.** The original MBA **86.7** and professional **87.9** scores and their files remain unchanged. This is a separate acceptance record, not a new full audit or rescoring.

## Scope

Observed at `http://127.0.0.1:8383` in own Chrome tab **1385099325**, from **03:53:05.2034505–03:54:39.0811821 UTC, 14 October 2026** (07:53–07:54 Dubai). CUA exposed Chrome extension binding id1 in this session; the parent’s “Chrome3” reference was followed by using the available Chrome in an independently created tab. No other reviewer tab or browser-wide viewport was changed.

HEAD: `9682cd1bbf776be6d2e74b023766fcd4c9056022`. Four relevant source hashes were identical before/after the browser work; hashes are in JSON. No runtime edit, service write, account sign-in, real data or paid call occurred.

## Browser results

| Check | Result | Observed acceptance |
|---|---|---|
| PM-01 original unrelated-negative fixture | **Pass** | “Produce stakeholder reports using Excel.” is **Direct wording found**, citing the positive report line. Budget management remains **Needs manual review** with its actual negative. Counts: 1 direct, 1 review. |
| PM-01 true reporting negative control | **Pass** | Adding “No experience producing stakeholder reports using Excel.” changes reporting to **Needs manual review**, with that exact negative first and positive passage still visible. Counts: 0 direct, 2 review. |
| PM-02 confidential help search | **Pass** | Query `confidential` returns five topics including **Remove selected source lines before reusing your CV**. Selecting it opens and focuses `/help#source-line-removal`. |
| PM-03 independent-verification wording | **Pass** | Busy professionals card now says “Reuse experience you have reviewed and keep confidential details out.” |
| Professional guidance label | **Pass** | `/check?audience=professional` shows **Busy professional** and broader next-role/transferable-work guidance. |

The exact original fixture was entered through the actual guest role, source and vacancy screens:

```text
Source:
Prepared quarterly stakeholder reports using Excel.
Assisted the project manager with schedules; did not manage the project budget or direct reports.

Vacancy:
Produce stakeholder reports using Excel.
Manage market research projects and own the project budget.
```

The negative control retained those lines and added:

```text
No experience producing stakeholder reports using Excel.
```

This confirms the original polysemy defect is corrected while a genuine reporting negation remains conservative. It does not establish correct handling of every people/document noun or every negation construction.

## Provenance and limits

The parent supplied a summary of **103 evidence tests and 45 API tests passing** and described normalization of people objects. Those tests and raw receipts were not independently executed or inspected in this narrow recheck; the results above are actual browser observations.

Initial report SHA-256 values were unchanged before/after:

- `professional-mba.md`: `B1375343AB70C12C63467339E39FDBDDFFD22EE2EEA1EA6CC6C0F2F1C24428BE`
- `professional-mba.json`: `6110600BFD2BA743F99B336234B1079F09D4A03880DECCC2FCFB7B96B5DF807F`

No full journey, cloud/private-runtime operation, saved record, support submission, export or PDF viewing was repeated. Earlier PDF/layout and private-runtime boundaries remain unchanged. No mobile, screen-reader or keyboard-only assessment was added.

**Bounded decision:** close PM-01, PM-02 and PM-03 for these stated acceptance cases on the recorded v4 source; professional guidance follow-up also passes.

