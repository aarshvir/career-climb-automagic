# Jobvance growth operations

Node 24 built-ins only. This is the durable local execution and measurement layer for the authorized native-tool marketing workflow. It is not a standalone social-media API client, ad delivery service or conversion collector. The daily Codex automation uses this layer and the connected platform/browser tools. It never stores credentials or candidate data.

## Run

Source of truth after installation: `jobvance-independent/scripts/growth-loop/`.
State and final media live outside Git in the sibling `jobvance-marketing-launch/` directory. Set `--db` to its `state/growth.sqlite` and `--asset-root` to that directory. Paths are explicit; no account credentials belong in arguments or JSON.

```
node scripts/growth-loop/cli.mjs status --db <absolute-private-db-path>
node scripts/growth-loop/cli.mjs validate --manifest <manifest.json> --asset-root <media-root>
node scripts/growth-loop/cli.mjs prepare --db <db> --manifest <manifest.json> --asset-root <media-root> --platform facebook
node scripts/growth-loop/cli.mjs dispatch --db <db> --id <queued-id> --manifest <manifest.json> --asset-root <media-root>
node scripts/growth-loop/cli.mjs confirm --db <db> --id <id> --token <attempt-token> --receipt <platform-readback.json>
node scripts/growth-loop/cli.mjs uncertain --db <db> --id <id> --token <attempt-token> --reason <short-description>
node scripts/growth-loop/cli.mjs assess --db <db> --input <aggregate-evidence.json>
node scripts/growth-loop/cli.mjs dispatch-pause --db <db> --id <queued-pause-id> --input <same-aggregate-evidence.json>
node --test scripts/growth-loop/*.test.mjs
```

CLI captures actual wall time; callers cannot backdate it. `assess` records evidence and may queue a stop recommendation; it does not pause Meta. `dispatch-pause` reevaluates the same evidence at current time before claiming one attempt. `observe --kind <kind> --input <file>` retains sanitized historical facts; it never promotes them into verified current metrics.

## Publication protocol

1. Review complete final media, copy, product accuracy and rights. Generate a version-1 manifest matching the documented validator contract. `digestCreativeManifest` binds exact copy, file hashes, review and provenance; approval identifies that digest. Agent review is allowed when actually completed and evidenced. Review fields are attestations, not a media decoder or proof of license.
2. `prepare` validates actual bytes and queues only reviewed content for the exact approved brand. Identical content remains one operation even after a new review revision.
3. Immediately before the native platform write, run `dispatch`. It rehashes the media and records the attempt before returning exact copy/target/paths. One post per platform per New York weekday; unresolved attempts consume the slot. The caller must upload those exact final assets without editing between validation and upload.
4. Publish once through the existing native tool or browser, within existing authorization. Read back the resulting content/asset, ID, destination and identity. Save receipt `{externalId,url,observedAt,target,bodyDigest,verification:"platform_readback"}` and confirm. A tool success without verified content is not a receipt.
5. An interrupted or ambiguous write becomes `unknown`, never automatically retryable. Search the exact platform identity/content for the original outcome, then confirm if found. Otherwise retain the unresolved operation for reconciliation. Never duplicate a campaign/post to work around uncertainty.

SQLite uses WAL and transactional claims. This avoids duplicate actions from cooperating concurrent workers and restart retries. It cannot promise exactly-once execution on a third-party platform or defend against a process that intentionally bypasses the module.

## Measurement and spending

Use `measurement.mjs` JSDoc contracts. Evidence requires exact account/campaign/adset/ad, currency, timezone, provenance and observation time. Daily adset spend, lifetime campaign spend and seven-day ad performance are different scopes. Missing rows remain unknown. Generic leads do not mean reviewed downloads. Fresh verified FX is required to compare INR with delegated USD limits; conversions are quote equivalents, not settled charges.

Only the existing IQ Bridge learning Jobvance test is addressable. Fixed INR 400/day, INR 5,000 campaign cap, USD 10/day and USD 70 total ceiling, ending 24 October 2026 13:00 UTC. No activation, budget increase, deadline extension, new campaign or unrelated campaign changes are implemented. Actual platform caps remain essential: this scheduled local workflow is not a continuously available hard spending interlock.

Organic comparisons need real comparable posts and a 14-day baseline; small samples stay inconclusive. The module does not infer paid conversions from organic saves or generate an NPS/CAC/ROAS claim.

## Remaining integrations

Native Facebook publication has an existing historical receipt. Instagram publishing authorization and Meta delivery must be verified at execution. Current Meta error 1815199 remains unresolved. Windsor returned an empty report and its trial lacks hourly refresh; neither is zero-spend evidence. Product activation aggregation and attribution are not yet connected. Existing presenter videos still require full audio/caption/lip-sync review; frame inspection alone is insufficient. Cold email stays draft-only pending the specific verified recipient/sender/opt-out setup. No customer data enters these files.
