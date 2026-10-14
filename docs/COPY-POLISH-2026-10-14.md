# Customer-facing copy polish — 14 October 2026

The current owner request is to remove wording that makes Jobvance feel like a placeholder product. This is a presentation change, not a claim that the open reliability and product backlog is complete.

## Scope

- Homepage and three audience pages: concise example-application labels and simpler preview captions.
- Sign-in, free-check entry, Job Loop overview, help and product-tour metadata: direct task wording.
- Pilot application tour and TXT packet: ordinary review/download controls, descriptive employer categories and one created-for-tour explanation. Tour choices still remain local; request drafts remain unsent.
- Twenty career guides: worked examples with a concise editorial note, rather than repeated fictional-data labels.
- Walkthrough pages: product-tour framing and an accessible About this video detail. Keep a clear distinction between tour actions and the user's own account.
- Private admin analytics: plain-language Limited data labels retain the measurement warning.
- Five recorded guides: refresh source captures and foreground labels; regenerate the one changed narration and aligned captions locally. Preserve media provenance and licensed-component notices. Frame review also identified cropped controls and mixed-size screenshot sequence errors; normalize captured screens before composition and keep the complete captured height above the caption band.

## Boundaries

Examples remain examples. No invented customers, testimonials, hiring results, sent applications or live cloud runs have been added. Internal test fixtures, provenance fields and historical audit reports are retained. Real candidate text is not rewritten to remove these terms.

This release does not certify an AI-authorship percentage, search position, conversion outcome or 95/98 product score. The broader implementation work remains in USER-REQUEST-TRACKER.md.

## Rollback

The remote Git tag `jobvance-before-copy-polish-2026-10-14` preserves source `0f3f04065656ded08e2b21cc19a557d287fb2fa0`. The saved v20 site remains available as the publication rollback:

`appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_7c9e58cc56a8819186cbddd4453c5ddb`

## Validation

Page and interaction checks: 77 existing tests across nine relevant suites passed; TypeScript validation passed. An independent review found no blocking copy/JSX issues. Independent all-route verification rendered all 38 public pages (including 20 guides), with zero target-word matches in DOM text, accessibility labels, field hints and metadata, and zero external requests. All five recordings passed decoder, caption, transcript, source-hash and normalized-geometry checks. All 24 chapter frames were inspected, ten independently rechecked. See the [media verification](product-hardening/tutorial-assets/COPY-REFRESH-VERIFICATION-2026-10-14.json). The 35 refreshed screenshots and fixed 1040×696 screen region prevent caption overlap and mixed-size timeline shifts. This is not an uninterrupted human playback or lip-sync audit. Media is pinned to GitHub commit `fb3782a224759a8e0f4cb97b19845cac8dab3ef3`; release evidence is in `../jobvance-repair-evidence/copy-polish-release-receipt.json`.

## Published release

Version 21 succeeded on Jobvance.io at 2026-10-14T06:43:15.454062Z, source `7ef48164bc7e9238809b4c199b3f136605ffaf56`. All 77 relevant tests passed again for the final source. The final render scan covered 38 public pages with zero target-word matches or external requests. All 47 live HTTP checks and 15 immutable GitHub media-byte checks passed. Hosting checks passed with a 2,764,397-byte compressed Worker.

Saved version: `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_5d0de25c6b0c819186f6c9657846ddd5`. Deployment: `appgdep_6acf246b5b688191ba8701375c1c23b7`. The follow-up documentation commit records this release without changing application bytes.
