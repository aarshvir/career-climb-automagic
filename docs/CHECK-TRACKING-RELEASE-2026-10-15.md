# Saved-check tracking release — 15 October 2026

Prepared from v29 with rollback tag `jobvance-before-check-tracking-2026-10-15`. Exact source, saved artifact, public version, deployment and HTTP readback are recorded separately in `docs/releases/2026-10-15-check-tracking.json` after successful publication.

The reviewed CV and its application progress now share an exact relationship. The candidate explicitly saves the check, then chooses **Track this saved check**. Retrying returns existing progress, without duplicate tracking or overwriting notes/status. Applications groups only this verified relationship; old manual entries stay independent. Optional tracking does not block local downloads or implicitly save CV text.

[Assessment and acceptance limits](audits/2026-10-15-check-tracking/ASSESSMENT.md). All1,412 tests/98files, TypeScript,12 hosting groups and5 native PostgreSQL groups passed before publication. The backend migration `cv_check_tracking_link` was applied as20261015071201 and read back. Edge handlers remain control15/worker11/OAuth5. No new edge deployment or GC gate readback occurred.

## Rollback

Keep saved v29 `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_7468c7b72a488191b471c30ab945e95c` and the pre-change source tag. The additive migration preserves old frontend manual/pack operations. Roll back the interface alone if needed; retain the link column/constraints/RPC once any linked records exist. Dropping them would lose relationships. Backend/file restoration is separate and is not certified by this source rollback. Preserve all earlier lifecycle, upload and artifact tombstone fences and spending commitments.

## Still partial

JV-03/04 still needs persisted check-to-Loop identity, scoped chosen-vacancy preparation and application-specific composition/grouped review. Hosted authenticated persistence and unassisted first/second applications remain unverified. No new customer score or guaranteed outcome is claimed.
