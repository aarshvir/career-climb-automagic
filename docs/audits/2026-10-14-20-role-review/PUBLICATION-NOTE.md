# Publication note

The owner explicitly requested pushing all completed work to GitHub and making the website live after this audit. This authorizes publishing this report collection in the existing source repository. The earlier local-only wording describes the analysis round, not a continuing publication restriction.

The twenty original role assessments, scores and evidence limits remain unchanged. This collection contains 88 findings mapped to 19 work packages. These are recommendations; publishing the reports does not implement those fixes or establish a higher product score.

No candidate CVs, passwords, API keys, access tokens, provider invoices or private message contents are included. Sanitized application usage/count aggregates are retained as context, with their original caveats. Temporary authenticated tooling, environment files and unrelated private research are outside this source publication.

The report files are source documentation. The website deployment contains the application build, not this audit collection. The existing host Worker excludes documentation/source paths; these reports do not become customer-facing routes.

Regenerate the data, index, CSVs and optional dashboard from the repository root with Python 3:

```sh
python docs/audits/2026-10-14-20-role-review/tools/build_report.py
python docs/audits/2026-10-14-20-role-review/tools/static_validate.py
```

The optional dashboard passed static HTML/data/link and JavaScript syntax checks. Its browser interactions were not exercised because the browser tool rejected local file URLs. The Markdown and CSV reports remain authoritative. Archived synthetic observation probes reproduce defective outcomes against the frozen snapshot; they are historical evidence, not normal application regression tests.
