# Finished Jobvance walkthrough assets

The five ready films and their measured chapter timing are listed in `production-manifest.json`. Each `videos/<tutorial-id>` has `.mp4`, `.vtt`, `.txt`, `.jpg` and `.json` files. The MP4s total 17,053,843 bytes and 472.3 seconds. All use 1920 × 1080, 25 fps, H.264/AAC, fast-start MP4 and burned captions.

Use **measured chapter starts from the production manifest** for seeking. The original help scene durations are planning estimates and are longer than the actual speech. Video and caption URLs are assigned by the publishing task; this producer manifest does not assert public hosting.

`contentKind` is `screen_walkthrough`: actual browser capture stills with an actual speaking AI portrait, not continuous screen recordings. Job Loop scenes retain a fictional local-service disclosure. They establish no real account, cloud execution, employer application or email. The first film shows real PDF controls and an approved TXT request, without independently captured browser export completion. The presenter has generated mouth motion with mostly static head/eyes.

`LOCAL-MODEL-LICENSES.md` and `notices/` retain the actual model cards, pinned revisions/hashes, package versions and installed license notices. No weights/runtime binaries are redistributed. No HeyGen footage is included; provider draft metadata/proof is private under ignored `.sites-runtime/avatar-production/internal/`.

## Reproduction

Run `prepare-scripts.mjs` with the project's Node/TypeScript runtime to export current source narration. The original local pipeline lives in `local/`:

1. `setup.ps1 -DownloadModels` creates a workspace-only Python environment and downloads only the inspected, pinned public model components.
2. `synthesize.py` creates exact-script audio, model token caption timing and measured chapter JSON.
3. `animate.py` creates speaking portrait MP4s with a manual face crop/mask, no optional face detector, enhancer, demo media or unsafe checkpoint loading.
4. `make_screen_plan.py` requires actual existing CUA captures. `compose.py` combines those with the actual presenter footage and burns readable captions.
5. `verify_media.py` decodes every final file and validates current-help narration, transcripts, caption words, times, two-line limits and video/audio format. It exports chapter frames for visual inspection.
6. After that inspection, `finalize_media.py --approve-visual-review` writes the ready producer handoff. Its record deliberately distinguishes frame/decoder verification from uninterrupted human viewing.

Working audio, presenter sources, models, environment and review frames are ignored under `.sites-runtime/avatar-production/`, `.sites-runtime/avatar-models/` and `.sites-runtime/avatar-venv/`. Final files are outside the website's small Worker bundle; the publishing task can host them at stable owner-controlled media paths.
