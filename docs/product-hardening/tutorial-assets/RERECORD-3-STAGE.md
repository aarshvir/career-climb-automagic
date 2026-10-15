# Re-recording brief: the three-stage free check

**Status, 15 October 2026:** No new video has been recorded. This brief describes what to capture. For `first-check`, it replaces `SCREEN-CAPTURE-PLAN.md`, which describes the retired six-step check.

## Why these films are offline

The free check at `/check` now has three visible stages:

1. Add your CV and the job
2. Review changes
3. Download

The released films still show the retired six-step check. That flow used Your role, Continue to your CV, Use this reviewed CV text, One vacancy, Check these inputs, Review my CV & questions, Recheck my changes & continue, Approve this CV and Check this next vacancy.

Three recordings show those screens:

- `first-check` (all six chapters)
- `another-application` (the `preserve` and `new-check` chapters)
- `controls-and-recovery` (the `recovery` chapter shows the old four-step reuse rail and the Check this next vacancy button)

These three entries were removed from `publicWalkthroughVideoManifest` in `src/lib/walkthroughs.ts`. The walkthroughs page now shows their text-only steps and written script. The old MP4/VTT/JPG files stay in `videos/` for reference; do not delete them.

`job-loop-start` and `source-review` are unchanged and stay published.

## Ground rules

- **Fictional data only.**
  - Use `fictional-cv.txt` and `fictional-vacancy.txt` from this folder.
  - Use the second vacancy below for `another-application`.
  - Never open a real CV, a real job ad, a signed-in personal account, an inbox or an account panel.
- **Local build, never production.**
  - Record a local dev build (`npm run dev`, which serves http://127.0.0.1:8080) against a local Supabase stack (`supabase start`, `supabase db reset`, `supabase functions serve tailor-for-job`). A disposable non-production project also works.
  - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to that stack.
  - Never point the recording build at the production Supabase project.
- **Real AI output only.**
  - Tailoring needs the `tailor-for-job` function to run with `JOB_LOOP_OPENROUTER_API_KEY` set in the function environment, with the router setting enabled.
  - The fictional CV is the only text sent to the provider.
  - If tailoring is unavailable, stop. Do not mock the "What changed for this job" panel, draw controls or edit a screenshot.
- **Narration comes from the code.**
  - Run `node prepare-scripts.mjs` to export the exact narration from `src/lib/walkthroughs.ts`.
  - With three scenes, `first-check` exports one scene per part.
  - Do not reword narration in the media pipeline. If copy must change, change `walkthroughs.ts` first.
- **Signed out.** Record the free check signed out. It needs no account, and the account panel then stays off screen.

## Second fictional vacancy (for `another-application`)

```
FICTIONAL DEMONSTRATION — not an open job
Business analyst at Example Company.

Responsibilities: Gather requirements from a project team, analyse survey data and present the findings clearly.
Requirements: Spreadsheet analysis and clear charts from coursework or a project.
Conditions: This fictional example does not specify eligibility, qualifications, location, remuneration or a closing date. It must not be interpreted as a real opportunity or submitted application.
```

## Scene list and on-screen actions

Each scene id below is a scene in `walkthroughs.ts`. Chapter ids in the new manifest entries must use these ids exactly; the validator rejects any other id. Screen file names follow the existing `<tutorial>--<scene>.jpg` pattern.

### `first-check`: Your first CV check (3 scenes)

**Throughout:** the left rail reads YOUR APPLICATION with Add your CV and the job, Review changes and Download, and "Step N of 3 · you check every change". Keep the rail in frame in every capture.

#### Scene `add`: Add your CV and the job

1. Open `/check` in a fresh signed-out tab. The heading reads "Tailor your CV to a job." and the stage card reads 01 / 03.
   - Capture `first-check--add-blank.jpg`.
2. Under "Upload your CV (PDF, Word or text, up to 5 MB)", choose `fictional-cv.txt`.
   - Wait for "Read: fictional-cv.txt. Check the text below."
   - The CV now appears in Your CV.
3. Paste all of `fictional-vacancy.txt` into The job description.
4. Check Job title and Company (optional).
   - If they did not fill from the ad, type Graduate analyst and Example Company.
5. Scroll so that the Tailor my CV for this job and Compare without AI buttons, and the AI note beneath them, are visible.
   - Capture `first-check--add.jpg`.
6. Select Tailor my CV for this job.
   - Capture the status "Tailoring your CV for this job. This usually takes under a minute…" as `first-check--add-tailoring.jpg`.

#### Scene `review`: Review changes

1. The stage reads 02 / 03 Review changes, with the notice "N changes prepared for this job…".
2. Capture What changed for this job with at least one Line N item showing both Now: and Your original:.
   - Save it as `first-check--review-changes.jpg`.
3. **Check every Now line against `fictional-cv.txt` before using the take.**
   - Team credit ("four-person team") must remain.
   - "No business result was measured" must not become a result.
   - Nothing may be added that is not in the CV.
   - If a line overstates, select Keep my original on that line in the recording, and file the example against the tailoring validator. Never leave an overstated line on screen as acceptable.
4. Select Keep my original on one change.
   - Capture its "· kept your original" label and the notice "That line is back to your original wording." as `first-check--review-kept.jpg`.
   - If a Profile summary appears, show its Remove this summary button. You may keep the summary or remove it.
5. If Quick questions (answer only if true) appears, show it but leave it unanswered. Do not invent an example.
6. Scroll to Your tailored CV and the Continue to download button.
   - Capture `first-check--review-cv.jpg`.

AI output varies between runs. The narration describes the controls and never quotes a specific rewritten line.

#### Scene `download`: Download

1. Select Continue to download. The stage reads 03 / 03 Download.
2. Wait for the automatic PDF preview. Capture these together as `first-check--download-preview.jpg`:
   - the PDF preview panel;
   - its real page-count line (for example "1 PDF page · Within your selected maximum.");
   - Maximum PDF length;
   - the embedded preview.
3. Scroll through Final CV preview — review before approval.
4. Tick "I have checked this CV. It is accurate and safe to share with employers."
   - Capture "Ready to download" and the enabled Download PDF, Download Word and Download TXT buttons as `first-check--download-confirmed.jpg`.
5. Select Download PDF.
   - Capture the notice "PDF download requested. Check your browser’s downloads." as `first-check--download-requested.jpg`.
   - Claim a finished download only if the browser actually saved the file.

### `another-application`: Prepare your next application (4 scenes)

#### Scene `preserve`

1. Continue from the confirmed Download stage above.
2. Scroll to Applying for another job? with "Start from this approved CV. Just paste the next job description." and an enabled Tailor for another job.
   - Capture `another-application--preserve.jpg`.

#### Scene `new-check`

1. Select Tailor for another job. Check that:
   - stage 1 now reads Your next job, with "Your last approved CV is ready. Paste the next job description.";
   - the notice says the approved final CV is ready to reuse;
   - Undo new application is visible.
2. Capture `another-application--new-check.jpg`.
3. Open Check or edit the CV you are reusing so that Reused CV text is visible.
   - Capture `another-application--new-check-cv.jpg`.
4. Paste the second fictional vacancy into The job description. Check that Job title shows Business analyst and Company (optional) shows Example Company; type them if needed.
5. Show Tailor my CV for this job and Compare without AI.
   - Capture `another-application--new-check-ready.jpg`.

#### Scenes `loop-reuse` and `tracking`

Job Loop has not changed. Reuse `screens/another-application--loop-reuse.jpg` and `screens/another-application--tracking.jpg`. Their narration is unchanged.

### `controls-and-recovery`: Stay in control of preparation and recovery (5 scenes)

Only the `recovery` scene needs a new capture. Reuse the existing screens for the other scenes: `manual`, `manual-control`, `coverage`, `coverage-outputs`, `optional`, `optional-gmail`, `loop-memory` and `loop-memory-return`.

#### Scene `recovery`

1. On `/check` stage 1, with the fictional CV and vacancy entered, scroll below the stage card.
2. Open Draft recovery (optional). Keep the checkbox Keep my draft in this tab across refresh unticked.
3. Keep the three-stage rail in frame.
   - Capture `controls-and-recovery--recovery.jpg`.
4. Check that neither "Check this next vacancy" nor a four-step rail is visible.

The `recovery` narration changed, so synthesize and compose the whole film again.

## Pipeline and release

1. Export the scripts with `node prepare-scripts.mjs`.
2. Follow the local pipeline in `README.md`: `synthesize.py`, `animate.py`, `make_screen_plan.py`, `compose.py`, `verify_media.py`, then `finalize_media.py --approve-visual-review`. Use the existing cached models only: no paid avatar service and no new model download.
3. Add the three films back to `publicWalkthroughVideoManifest`:
   - Use the measured duration and the measured chapter starts.
   - Chapter ids must be the current scene ids:
     - `first-check`: `add`, `review`, `download`
     - `another-application`: `preserve`, `new-check`, `loop-reuse`, `tracking`
     - `controls-and-recovery`: `manual`, `coverage`, `optional`, `recovery`, `loop-memory`
4. Pin the new media URLs to the commit that contains the new files.
5. Update `src/__tests__/walkthroughs.test.tsx`: the text-only assertions for these tutorials must change to video assertions.
6. The owner publishes the frontend through their own release flow. A recording task does not deploy.

## Acceptance checklist

- [ ] Every frame comes from the local build with fictional data. No real name, email, CV, job ad or account is visible.
- [ ] None of these retired labels appears on screen: Your role, Target role, Continue to your CV, Use this reviewed CV text, One vacancy, Check these inputs, Review my CV & questions, Recheck my changes & continue, Approve this CV, Preview current PDF, Check this next vacancy.
- [ ] The rail shows three stages, and the stage card shows 01 / 03 to 03 / 03.
- [ ] The What changed for this job items are real function output, and every kept Now line is supported by `fictional-cv.txt`.
- [ ] The confirmation box is ticked on screen only after the CV and PDF preview have been shown.
- [ ] The narration, VTT and transcript match the exported `walkthroughs.ts` narration word for word.
- [ ] Captions stay within two lines and clear of the player controls, as in the 14 October repair.
