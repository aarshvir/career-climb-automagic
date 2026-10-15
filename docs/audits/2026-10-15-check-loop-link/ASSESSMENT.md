# Saved check to Job Loop: persistence foundation

15 October 2026. **Implemented and tested locally; not applied, exposed or deployed.** The live platform remains v30. This is partial work on JV-03/04, not delivery of the customer journey or an improved product score.

## What exists

The additive migration `20261015101948_job_loop_saved_check_link.sql` implements a service-only atomic operation for explicitly linking one owned saved check to one vacancy in the current Loop lifetime. It uses the existing lifecycle lock, record lock and versioned write routine. It neither initializes a record nor starts preparation. No existing records are backfilled or matched by title, employer or URL.

The exact saved-check ID becomes `sourceCheckId` on the new opportunity. Its source key is namespaced to that check, rather than the employer URL. The function checks the source owner and exact title/company/description under a key-share lock. Location, URL and optional contact come from the candidate's subsequently reviewed vacancy draft. The eventual control handler must apply the existing complete URL/contact validator before calling it; the database's bounded shape/URL checks are not a replacement for that validator.

One check can have one such opportunity per Loop lifetime. An existing relationship returns the current opportunity without rewriting later source edits, notes, status, reminders, profile or packet authority. This remains true after an ambiguous response or a separately deleted check. It does not recreate a deleted source. A fresh lifetime requires a fresh explicit request and consent. Two different checks with the same wording stay distinct.

Deleting a saved check does not implicitly erase independently saved Loop work. Its surviving opaque provenance must be displayed as an unavailable source when it cannot be read; this is not a claim that the check still exists. Loop erasure removes the relationship with the Loop record. This design needs no new table, backfill, scheduled cleanup or change to collection gates.

The public RPC is an invoker wrapper. Its private definer is necessary to hold a key-share lock on immutable checks without granting callers UPDATE privileges. Both routines deny anonymous and authenticated execution; only the server role may execute. The future handler must derive the owner from its verified session. No browser service credentials or new client grants are introduced.

## Verification completed

- 30 new SQL regression cases, plus the affected existing suites: **86 cases passed across five files**. Actual check/tracker, Loop, durable-erasure, request-generation and GC migrations are used in the fixture. Auth identity, unrelated pack columns and Storage metadata remain isolated substitutes.
- **Six native PostgreSQL 17.11 groups passed**, with distinct backend PIDs and observed `pg_blocking_pids`: concurrent duplicate creation; source deletion after creation; source deletion before creation; progress editing against retry; erasure/fresh generation against old requests; and browser/private-routine/cross-owner restrictions.
- The existing native check/tracker harness was rerun after adding the optional `--check-loop` suite: **all five original groups passed**. Both disposable clusters stopped; no PostgreSQL process remained.
- New assertions preserve settled, reserved and uncertain usage rows, monthly commitments, held packets and the disabled GC configuration. Input changes still block an already running preparation through the existing write routine.
- Initial local failures exposed the immutable-check locking privilege requirement. It was fixed using the narrowly scoped private routine, without granting client updates. Two test expectations were corrected to the actual existing lifecycle error precedence (old generation is stale; missing record is not found). The refusal behavior was not weakened.

Native receipts are beside this report. The detailed Vitest output is private at `../jobvance-repair-evidence/check-loop-foundation-vitest.json`. None of this is hosted acceptance, actual Storage deletion, fresh authentication, an unassisted customer task or proof of a complete application relationship.

## Required next implementation and release gates

1. Add the typed `link_saved_check` control action, strict client/server validation, captured expected generation, explicit link consent, derived server owner and repository RPC call. Do not expose it before the tested migration and coordinated control deployment are ready. The routine already exists in source; do not invent another link store.
2. Preserve optional `sourceCheckId` in returned opportunity schemas. Exclude linked opportunities from ordinary manual URL-based overwrite. Keep discovery/worker provenance intact and avoid turning a same-URL manual vacancy into a check-linked record.
3. Retain the imported check ID and exact vacancy fingerprint in owner/auth/generation-bound draft state. Saving the CV must not drop the pending vacancy identity. Undo and navigation recovery must preserve provenance while requiring fresh consent. Edited role/company/description must produce an explicit choice to restore the source or save a separate vacancy; never silently detach or misattribute it.
4. On retry or a freshly reopened check, surface an existing exact relationship and its current progress. Do not clear a newer draft when a delayed save resolves. Return only the scoped current snapshot/selection.
5. Join the existing Applications home by this exact ID and generation only. Retain each source action, independent progress, missing/failed-source states, packet attempts and honest conflicting-link handling. No guessed historical merge or hidden unmatched row.
6. Add real component/API tests, delayed owner/generation and concurrent retry tests, then inspect created-record desktop/mobile first and second application paths. The native persistence boundary alone is insufficient acceptance.
7. Obtain independent review before production use. The three existing review agents are still errored with the known account usage limit; no new reviewer sign-off was available in this turn. Do not buy credits or use paid external calls to evade the limit. Continue implementation and local verification in the meantime.
8. Apply only after that review and coordinated validation; retain v30/source rollback, read back exact schema/ACL/control sources, publish and record actual hosted evidence. This migration is currently **unapplied**. Do not claim a saved-check-to-Loop relationship is live.

After this coherent slice, implement selected-vacancy request identity, immutable selection snapshot and worker choice before adding a button that promises preparation of only that vacancy. Per-application composition/grouped review and remaining original requests stay open.

## Sources checked

The Supabase changelog index and [database function documentation](https://supabase.com/docs/guides/database/functions) were checked on 15 October. The noted TLS cipher retirement affects older HTTP clients from 10 November; this SQL change uses the existing server transport and does not alter TLS. No vendor pricing, product score, customer outcome or search-ranking claim was added.

Rollback source tag: `jobvance-before-check-loop-link-2026-10-15` at the v30 receipt commit. No production schema, handler, candidate data, billing, provider call or site artifact changed in this foundation step.
