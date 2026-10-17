# Adapted Gemini growth loop — 17 October 2026

The useful Gemini proposal is partially implemented, with a real local execution layer now installed. It is not yet a fully autonomous generation, publishing, paid acquisition and revenue loop. The owner requested that worthwhile earlier requests remain in scope; this assessment preserves that distinction.

## Implemented in this change

`scripts/growth-loop/` contains a Node 24 SQLite outbox, exact creative validation, deterministic measurement engine, orchestration and a CLI. Native connected tools/browser perform external actions after a persisted dispatch claim; no account credentials are embedded. The existing daily marketing automation now invokes this workflow, reads current evidence and retains the exact approved advertising scope.

The outbox survives restart and concurrent callers, prevents repeated claims, reserves one post per platform per New York weekday and does not automatically retry uncertain writes. Receipts bind target, content digest, actual platform, external ID and readback time. Re-reviewing identical content does not create another post. Creative validation hashes the actual local files, captures the complete intent before asynchronous work and requires exact revision/approval plus full media review evidence. It rejects account-free promises, compulsory quiz claims and fabricated outcome/application promises. Review/provenance are accountable attestations, not automated video decoding or license verification.

Measurement keeps missing data unknown, distinguishes daily adset spend from lifetime campaign spend and seven-day ad performance, requires exact identity/currency/timezone/freshness, and compares USD limits only with verified fresh FX. It never treats generic leads as reviewed CV downloads. Organic comparison needs a real comparable 14-day baseline; no automatic paid promotion or budget increase. Configured platform caps are still essential: a daily local monitor cannot guarantee continuous budget enforcement.

Three separate agent contexts supplied quality/store work, measurement work/review, and independent requirements reconciliation/integration tests. Root integrated the CLI and installed state. Independent review reproduced and corrected malformed receipt times, cross-platform receipt URLs, missing quality context, invalid recovery clocks and mutable manifest intent during asynchronous hashing. Final copied source passes **121 Node tests** (26 quality, 20 durable store, 63 measurement, 12 integration). Integration uses real temporary SQLite, actual local media fixture bytes and CLI subprocesses. It does not publish test posts or spend money.

The installed private database records the existing historical Facebook publication and a fresh Meta browser observation. A real validation of the 9,028,441-byte B feed video confirmed SHA-256 `3a1c696e8dd781892a0614a66dc64f702b9b985514e99b5394e860197bbc5db5` but correctly blocked publication because complete review/transcript/measurement/approval are absent. The first actual measurement run returned review with unknown spend/conversions/revenue, not a fabricated zero or success.

## Current external blockers and unfinished integration

- Actual Meta editor readback on 17 October at approximately 16:39 UTC: approved ad remains In draft, Instagram access error1815199 persists, and website-event tracking is unselected. The already-authorized account connection and Ads/Insights assignment were completed earlier. No new permission request, publication, activation or spending occurred here.
- Windsor standard report returned no rows. Forced hourly refresh is unavailable on its trial. No paid upgrade, zero-spend inference or continuous-monitor claim.
- Product activation aggregation, deduplicated acquisition attribution and verified revenue are not connected to this local engine. Its schema supports them but empty input is not working analytics.
- Three videos exist; preference for B is based on frames. Full audio/caption/lip-sync review remains. Real-product capture/composition and automatic provider generation are not added by this module.
- Native Facebook/Instagram actions still require real identity/access/readback. Cold email remains draft-only without the verified sender, recipient batch and opt-out/suppression setup.

## Worthwhile product requirements retained

Already shipped: three CV variants, all three schedules, recurring AI tailoring, Deep Tailor, optional account setup, custom/broad roles and locations, visible Next, and v40–v42 dashboard/navigation/resume repairs.

Still build: broader useful lawful discovery (six boards are not comprehensive; one hosted target had zero discovered matches), recurring Dodo subscription renewal/cancel/failure/refund lifecycle, older-result pagination/exact retrieval, grouped per-application review, remaining recovery/export-language gaps, and unassisted multi-day acceptance. Existing one-time payment paths must be preserved. The 100-persona forecast remains -75, not actual NPS or a forced +60. These requirements are not closed by marketing code.

Rejected Gemini elements: fictional job fallback, no-account entry promise, fail-open media checks, automatic three-post daily volume, unsupported CPA promises, automatic budget scaling, cloning a voice without authority, and treating a draft/permission association as live delivery.

## Release boundary

This is operator tooling, documentation and automation wiring. No customer runtime, backend, database migration, payment configuration or candidate record changed. Public v42 remains source `a6a0829`; no identical website rebuild or deployment is needed. Private state/media/platform screenshots stay in the sibling marketing/evidence folders and are not committed. Native external delivery remains blocked as described above.
