# Finished Jobvance walkthrough assets

The five ready films and their measured chapter timing are listed in `production-manifest.json`. Each `videos/<tutorial-id>` has `.mp4`, `.vtt`, `.txt`, `.jpg` and `.json` files. All use 1920 × 1080, 25 fps, H.264/AAC, fast-start MP4 and burned captions. The manifest records exact file sizes, hashes and measured duration.

Use **measured chapter starts from the production manifest** for seeking. The original help scene durations are planning estimates and are longer than the actual speech. Video and caption URLs are assigned by the publishing task; this producer manifest does not assert public hosting.

`contentKind` is `screen_walkthrough`: actual browser capture stills with a generated speaking portrait, not continuous screen recordings. Job Loop scenes retain an example-application product-tour label. They establish no real account, cloud execution, employer application or email. The first film shows real PDF controls and an approved TXT request, without independently captured browser export completion. The presenter has generated mouth motion with mostly static head/eyes.

`LOCAL-MODEL-LICENSES.md` and `notices/` retain the actual model cards, pinned revisions/hashes, package versions and installed license notices. No weights/runtime binaries are redistributed. No HeyGen footage is included; provider draft metadata/proof is private under ignored `.sites-runtime/avatar-production/internal/`.

## Earlier caption and narration repair, 14 October 2026

All five films were recomposed with 54 px captions (previously 32 px), at most two lines, a separate dark caption band and a 180 px bottom margin for native playback controls. The compositor retains the full captured screen height and keeps the presenter separate from the product UI. Fine UI text is best read fullscreen or alongside the written steps; English VTT captions and exact narration transcripts remain included.

`controls-and-recovery` was synthesized and animated again from the current exact help narration using the existing local environment and cached models. It now says Pause retains current work, Cancel schedule also stops the latest queued or running scheduled job, and a separate manual run has its own Cancel run. Its measured duration is 115.375 seconds. The other four films reuse their existing speech and speaking-portrait sources. The current next-vacancy chapter stage ID was synchronized without changing its speech.

This repair used no paid API calls, new model downloads, private candidate data or external uploads. Original portrait, screenshots, model sources, licenses and retained notices are unchanged. Verification covers complete decoder playback, exact current narration/transcript matching, caption words/times, chapter identity and visual chapter-frame/source-screen/caption-safe-area review. It does not assert uninterrupted human viewing or independently assessed lip-sync quality. Final playback with browser controls on a phone is a separate publishing review.

## Reproduction

Run `prepare-scripts.mjs` with the project's Node/TypeScript runtime to export current source narration. The original local pipeline lives in `local/`:

1. `setup.ps1 -DownloadModels` creates a workspace-only Python environment and downloads only the inspected, pinned public model components.
2. `synthesize.py` creates exact-script audio, model token caption timing and measured chapter JSON.
3. `animate.py` creates speaking portrait MP4s with a manual face crop/mask, no optional face detector, enhancer, demo media or unsafe checkpoint loading.
4. `make_screen_plan.py` requires actual existing CUA captures. `compose.py` combines those with the actual presenter footage and burns readable captions.
5. `verify_media.py` decodes every final file and validates current-help narration, transcripts, caption words, times, two-line limits and video/audio format. It exports chapter frames for visual inspection.
6. After that inspection, `finalize_media.py --approve-visual-review` writes the ready producer handoff. Its record deliberately distinguishes frame/decoder verification from uninterrupted human viewing.

Working audio, presenter sources, models, environment and review frames are ignored under `.sites-runtime/avatar-production/`, `.sites-runtime/avatar-models/` and `.sites-runtime/avatar-venv/`. Final files are outside the website's small Worker bundle; the publishing task can host them at stable owner-controlled media paths.

## Product-tour copy refresh, 14 October 2026

The current owner request removes repeated placeholder wording from the product experience. All 35 source-screen captures were refreshed from the actual local application UI using created-for-tour career records. The videos now use **Example application walkthrough** and **Video guide** as their foreground labels. Product-tour examples remain identifiable, and generated-presenter information remains available with the video details and in the provenance records. No real customer record, employer result or successful cloud run has been added.

The `job-loop-start` narration now says “In this MBA example”. Its exact speech, timed captions and speaking-portrait footage were regenerated using the existing local runtime and cached models. Its measured duration is 95.15 seconds. The other four films retain their existing narration. The refresh uses no paid APIs, new model downloads or private candidate uploads.

Frame inspection also found incomplete form framing and mixed screenshot heights. The corrected composition normalizes the captured screen sequence before concatenation and fits the full captured height above the caption band. These edits change video layout rather than covering source text or drawing invented product controls. Current hashes, checks and the precise review scope are recorded in `COPY-REFRESH-VERIFICATION-2026-10-14.json` and `production-manifest.json`.
