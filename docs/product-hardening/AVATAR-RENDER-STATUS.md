# Avatar walkthrough production status

Updated: 13 October 2026. Five actual local presenter walkthroughs are complete. Public hosting and the product manifest are handled by the root task separately.

## Finished deliverables

Each tutorial has an actual 1920 × 1080 H.264/AAC MP4 at 25 fps, burned two-line English captions, a matching WebVTT track, the exact source narration as TXT, a JPEG poster and JSON provenance/chapters under `tutorial-assets/videos/`.

| Tutorial ID | Measured duration | Chapters |
| --- | ---: | ---: |
| `first-check` | 111.275 s | 6 |
| `job-loop-start` | 95.625 s | 5 |
| `source-review` | 78.425 s | 4 |
| `another-application` | 75.300 s | 4 |
| `controls-and-recovery` | 111.675 s | 5 |

These are **narrated product-screen walkthroughs**, `contentKind: screen_walkthrough`, using actual CUA browser captures edited as still-image scenes and actual speaking portrait footage in the lower right. They are not continuous screen recordings. The presenter tile occupies its own margin and does not cover task controls. Every video visibly says “AI presenter - fictional” and “Real product screens - fictional demonstration”.

The first-check scenes use the actual on-device free flow with a fictional applicant and vacancy. The reuse film captures the updated approved-final-CV default and the combined Next vacancy form, including optional reused-CV inspection. Job Loop scenes use real product components with an explicitly fictional local in-memory service, no account and blocked external requests. Their persistent “FICTIONAL LOCAL DEMO — no account, cloud run or application” banner remains visible. No cloud run, application, email, provider configuration or employer contact is asserted by that fixture.

## Production and verification

The original fictional presenter portrait is animated by the minimal locally licensed MuseTalk V15 chain. Kokoro `af_heart` supplies the stock synthetic voice. The source portrait does not depict the account owner or an asserted employee. No real face/voice was cloned or uploaded. No paid API was called; no subscription, credit purchase or upgrade was made.

All five final files passed a complete FFmpeg audio/video decode. The checked transcript matches the exported narration exactly; caption words match it, all caption times fit the measured audio and do not overlap, and every cue uses at most two lines. Chapter frames and the captured source views were inspected for caption placement, fictional disclosures, source context and readable controls. `local/verify_media.py` records these checks in each final JSON. This is decode/frame verification; it does not assert that a human watched every second of every film.

The portrait has generated mouth/lower-face motion while the head and eyes remain largely static. Caption timing uses Kokoro predicted token timings and measured audio sample counts. The first film shows real PDF controls and a real approved TXT-download request; a generated PDF view and completed browser download were not independently captured. The underlying export functionality is verified separately by root’s product checks. Text guides remain available for reading at smaller player sizes.

## Retained licenses and reproducibility

[LOCAL-MODEL-LICENSES.md](tutorial-assets/LOCAL-MODEL-LICENSES.md) identifies the exact applicable author declarations and exclusions. `tutorial-assets/notices/` retains the pinned model manifest with revisions and SHA256, all four actual model cards, installed package license/notice texts and package-version metadata. Runtime binaries, weights and scratch composition files remain ignored under `.sites-runtime/` and `videos/.composition/`.

The standalone scripts in `tutorial-assets/local/` provide isolated setup, anonymous selected-model downloads, exact-script speech, safe model loading, manual crop/mask animation, screen planning, composition and verification. They do not import stock face-detector/enhancer inference scripts or use noncommercial Wav2Lip, dlib landmarks, test footage or third-party portraits. Model loads use safetensors or `weights_only=True`; no unsafe pickle opt-out or custom remote code is enabled.

## HeyGen investigation: internal only

HeyGen Studio Free was inspected before the local route was selected. Its current [Terms §4](https://www.heygen.com/terms) (updated 23 July 2026) permit Free output only for personal, noncommercial and internal evaluation; no HeyGen output is included in these deliverables.

Three exact-script public-stock-presenter drafts were saved. Part 1 (`2f3fe4468b6a40d1a64e22f83564c1ac`) was submitted once, with no monetary charge field, checkout or upgrade selected, and remained native `pending` / GUI `Draft`. Parts 2 (`4e6fef84994c4115ad6756f4283b4347`) and 3 (`b5adfe28a6e84fe5a708811f1e1e9efd`) were never submitted. No completed file, provider playback URL, expiry or numeric zero-cost receipt was confirmed. No retry was made.

Detailed provider metadata and account-library screenshot proof were moved to ignored `.sites-runtime/avatar-production/internal/`. Keep them private. Never publish eventual Free provider output as Jobvance commercial media.
