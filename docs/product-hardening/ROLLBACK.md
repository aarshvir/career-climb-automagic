# Return to the preserved version

The published starting point is protected by GitHub tag **jobvance-rollback-2026-10-13-v14**, commit **f225451e8fc33a71848d8167a793e90c1a2dfb24** and saved Sites **version14**. The tag was pushed before new customer-journey edits.

Ask to “roll Jobvance back to the 13 October version14 checkpoint.” The agent should redeploy the exact saved version `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_ef092f699b948191924bfc401c4f31b1` on existing site `appgprj_6aca1c378fb88191aa656f8a85eee68a`, preserving its public audience and Jobvance.io domain. This restores the frontend without deleting candidate data or changing the replacement OpenRouter key.

Restore source through a revert or a separate branch based on the tag; preserve uncommitted work and history. Do not use a destructive reset. The original source is also saved as `jobvance-source-f225451e.zip` in sibling `jobvance-repair-evidence`.

If later changes include server functions, compare the final deployment receipt against the baseline. Redeploy only changed functions using the tagged, hash-verified artifacts in `docs/supabase-loop-ui`, their explicit import map and their existing custom authentication. Baseline versions: job-loop-control9, job-loop-worker7, job-loop-oauth3, jobvance-admin2, jobvance-review-worker4. A new deployment version number is expected even when restoring old code.

Database changes must be additive and backwards compatible. Preserve all candidate data, spending reservations, provider usage and administration audit. Do not replay old migrations or erase tables to simulate rollback. If configuration changed, compare with the baseline owner settings: scheduler enabled, OpenRouter enabled, shared cap$50, default `openai/gpt-6.1-sol`, medium reasoning. Do not increase a subsequently lowered cap without the owner's express request.

After rollback, verify the domain, sign-in, an anonymous check, the private owner portals, ordinary-user denial and appropriate source/artifact hashes. Report which layers were restored and any remaining compatibility limit.

The hardening migration20261013190000 only extends a service-role provider lease from100 to180seconds. It is backward-compatible with the tagged release and does not need reversal to restore version14; preserve candidate records, current keys and database migrations. Current backend source can be restored from the tagged bundles without resetting the database.

Cycle2 adds service-only guest support storage, hashed private receipts and90-day retention in migration20261014020000. It is additive and does not require reversal for a frontend rollback. Preserve incoming support requests and audit history. The compatible guest-support1/admin3 functions can remain while restoring an older frontend; compare the latest release receipt before choosing a backend rollback. Never drop the queue or replay erasure to mimic a prior release. Saved version16 remains a second, newer rollback point for this cycle.
