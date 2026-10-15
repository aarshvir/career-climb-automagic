export interface WalkthroughScene {
  id: string;
  stageId: string;
  title: string;
  instruction: string;
  caption: string;
  narration: string;
  durationSeconds: number;
  demo: { section: string; fields: { label: string; value: string }[]; action: string; note: string };
}
export interface WalkthroughTutorial {
  id: string;
  title: string;
  description: string;
  audience: string;
  helpAnchor: string;
  action: { label: string; to: string };
  scenes: WalkthroughScene[];
}

/** Narration matches a released recording when the manifest lists one; otherwise it is the script for the next recording. */
export const walkthroughs: WalkthroughTutorial[] = [
  {
    id: 'first-check', title: 'Your first CV check', description: 'Add your CV and one real job, review each suggested change beside your original line, then confirm and download your own document.', audience: 'Students · MBA students · Busy professionals', helpAnchor: 'first-check', action: { label: 'Start my free check', to: '/check' },
    scenes: [
      { id: 'add', stageId: 'check-add', title: 'Add your CV and the job', instruction: 'Upload your CV or paste it into Your CV, then remove anything you would not share with an employer. Paste the full ad into The job description. Check Job title, which is read from the ad, and Company (optional). Select Tailor my CV for this job, or Compare without AI.', caption: 'PDF, Word or text, up to 5 MB. Scanned PDFs need readable text. No account needed.', narration: 'Upload your CV as a PDF, Word or text file up to five megabytes, or paste it into Your CV. Remove anything you would not share with an employer. Paste the full job ad into The job description. The job title is read from the ad, so check it, and add the company if you like. Select Tailor my CV for this job. This sends your CV and the job to our AI provider, and the AI may only reword what is already in your CV. To keep everything on this device, select Compare without AI instead.', durationSeconds: 33, demo: { section: 'Add your CV and the job', fields: [{ label: 'Your CV', value: 'University analytics project, 2026. In a four-person team, I cleaned survey data and built the charts. No business result was measured.' }, { label: 'The job description', value: 'Graduate analyst at Example Company. Support survey analysis, prepare clear charts and explain the findings.' }, { label: 'Job title', value: 'Graduate analyst' }, { label: 'Company (optional)', value: 'Example Company' }], action: 'Tailor my CV for this job', note: 'Compare without AI stays on this device. Nothing is stored unless you choose to save.' } },
      { id: 'review', stageId: 'check-review', title: 'Review changes', instruction: 'Under What changed for this job, read each Now line beside Your original. Select Keep my original for any wording you could not explain yourself, or Remove this summary for an added profile summary. Answer Quick questions only if true. Edit Your tailored CV, then select Continue to download.', caption: 'Each change shows the line of your own CV it came from. You decide what stays.', narration: 'Under What changed for this job, each suggested change shows the new wording beside your original line. Ask whether you could explain it in an interview. If not, select Keep my original. An added profile summary is written only from lines of your CV; select Remove this summary if you do not want it. Answer Quick questions only if the answer is true. Then read Your tailored CV, edit anything, and keep dates and numbers exact. If you compared without AI, this box is called Your CV for this job. Select Continue to download.', durationSeconds: 35, demo: { section: 'What changed for this job · Line 9', fields: [{ label: 'Now', value: 'University analytics project, 2026: cleaned survey data and built the charts in a four-person team. No business result was measured.' }, { label: 'Your original', value: 'University analytics project, 2026. In a four-person team, I cleaned survey data and built the charts. No business result was measured.' }], action: 'Continue to download', note: 'Keep my original puts your own line back. Team credit stays in the wording.' } },
      { id: 'download', stageId: 'check-download', title: 'Download', instruction: 'Read Final CV preview and the PDF preview, which appears automatically. Choose Maximum PDF length, or use Open the exact PDF preview in a new tab if the panel is blank. Tick I have checked this CV. It is accurate and safe to share with employers. Then select Download PDF, Download Word or Download TXT.', caption: 'The PDF preview is the exact file you download. The confirmation is yours, and you send the CV yourself.', narration: 'Read your final CV. The PDF preview appears automatically and is the exact file you will download. Under Maximum PDF length, choose one or two pages. If the preview is longer, go back and shorten it, or use Word or text. If the panel is blank, open the exact preview in a new tab. When you have read every page, tick I have checked this CV. It is accurate and safe to share with employers. Downloads stay off until you do. Select Download PDF, Download Word or Download TXT. You send the application yourself.', durationSeconds: 34, demo: { section: 'Download', fields: [{ label: 'Maximum PDF length', value: 'Two pages' }, { label: 'PDF preview', value: '1 PDF page · Within your selected maximum.' }, { label: 'I have checked this CV. It is accurate and safe to share with employers.', value: 'Tick only after reading every page.' }], action: 'Download PDF', note: 'Download Word and Download TXT have the same wording. Tailor for another job starts your next application.' } },
    ],
  },
  {
    id: 'job-loop-start', title: 'Set up your reusable career record', description: 'Import once, check three details and confirm useful facts one passage at a time.', audience: 'Students · MBA pivots · Employed professionals', helpAnchor: 'job-loop-start', action: { label: 'Open my Job Loop workspace', to: '/loop' },
    scenes: [
      { id: 'open', stageId: 'loop-today', title: 'Open the saved workspace', instruction: 'Sign in to your own Job Loop account. On Today, select Import or paste my CV, or open Career record.', caption: 'The workspace saves your record. The free check remains available without an account.', narration: 'Job Loop uses a private saved workspace. Sign in to your own account and open Today. Select Import or paste my CV, or choose Career record. If you want to try one comparison without an account, use the free CV check instead.', durationSeconds: 20, demo: { section: 'Today', fields: [{ label: 'Bring your CV', value: 'Import or paste once' }, { label: 'Confirm useful facts', value: 'Choose the facts you want to reuse.' }], action: 'Import or paste my CV', note: 'Open your own account to save a career record.' } },
      { id: 'source', stageId: 'loop-record-source', title: 'Bring your existing text', instruction: 'Open 1. Import or paste your CV. Read a local CV on this device or paste into Reviewed source CV or career record. Select Continue with this text.', caption: 'Review the wording before private saving. Your source file stays on your device.', narration: 'Open the import step. Read a local CV, paste your career text or choose an owned saved CV if one is available. Review the extracted wording and remove confidential information. Select Continue with this text. Reading the file does not yet save your record.', durationSeconds: 23, demo: { section: 'Career record · 1. Import or paste your CV', fields: [{ label: 'Reviewed source CV or career record', value: 'MBA operations project, 2026. My part was to map the process. Our team estimated a possible reduction in waiting time; this was not an implemented client result.' }], action: 'Continue with this text', note: 'English PDF, DOCX or TXT, up to 5 MB, or pasted text.' } },
      { id: 'details', stageId: 'loop-record-details', title: 'Check three details and save privately', instruction: 'Check My name, Target roles and Locations. Confirm private saving, then select Save career record. Leave optional preferences for later if you do not need them.', caption: 'Roles and locations focus the work. A suggested role does not prove you qualify.', narration: 'Check your name, enter one target role per line and add the places where you would work, or Remote. Optional preferences can wait. Leave unknown pay or experience unknown. Confirm that you want the reviewed text saved privately, then select Save career record.', durationSeconds: 24, demo: { section: 'Career record · 2. Check three details and save privately', fields: [{ label: 'My name', value: 'Maya' }, { label: 'Target roles', value: 'Operations analyst' }, { label: 'Locations', value: 'Dubai' }], action: 'Save career record', note: 'Private saving does not activate AI, inbox access or a schedule.' } },
      { id: 'facts', stageId: 'loop-record-facts', title: 'Choose the fact’s real context', instruction: 'In Your claim library, review the copied passage. Choose Evidence context, inspect the complete source and set Result status. Save claim only with accurate wording and appropriate sharing choices.', caption: 'Keep the course or employer heading, your own contribution and estimated-result wording.', narration: 'Review one literal passage at a time. Choose Evidence context yourself, and inspect the complete source and nearby heading. In this MBA example, the team estimated a possible result, so choose Projected or estimated. Do not turn it into measured client work. Confirm accuracy and external-use permission only when true, then save the claim.', durationSeconds: 31, demo: { section: 'Your claim library', fields: [{ label: 'Evidence context', value: 'academic project' }, { label: 'Source context label', value: 'MBA operations project, 2026' }, { label: 'Result status', value: 'Projected or estimated' }], action: 'Save claim', note: 'Skip this passage is available for a fact you do not need.' } },
      { id: 'next', stageId: 'loop-opportunities', title: 'Add the vacancy you want', instruction: 'Open Opportunities. Enter the real posting in Add an opportunity and select Save opportunity. Return to Today to inspect available preparation.', caption: 'Use unchanged confirmed facts again. Each output still needs its own review.', narration: 'With useful facts saved, open Opportunities and add the posting you want to apply for. Use the actual title, company, HTTPS link and full description. Leave a named contact out unless you have checked a real source. Save the opportunity, then return to Today to inspect preparation availability.', durationSeconds: 25, demo: { section: 'Opportunities · Add an opportunity', fields: [{ label: 'Vacancy title', value: 'Operations analyst' }, { label: 'Full vacancy description', value: 'Copy the complete actual posting in your own workspace. This tutorial does not create a vacancy.' }], action: 'Save opportunity', note: 'A source link is not independent proof that a role is open.' } },
    ],
  },
  {
    id: 'source-review', title: 'Explain your contribution accurately', description: 'Keep complete sources, classroom context, team credit and forecasts intact.', audience: 'Especially useful for students and MBA pivots', helpAnchor: 'job-loop-facts', action: { label: 'Read the fact-review help', to: '/help#job-loop-facts' },
    scenes: [
      { id: 'complete', stageId: 'loop-fact-source', title: 'Keep the complete statement', instruction: 'Open Inspect or correct the source and context. Preserve the complete Source passage or my answer instead of copying isolated keywords or numbers.', caption: '“Excel, 25%” is a fragment. Keep the full contribution and result qualifications.', narration: 'A claim needs a complete source statement. Open Inspect or correct the source and context. Keep the whole passage, including team credit, dates and estimate language. An isolated keyword or figure is not enough to show what happened or what you contributed.', durationSeconds: 23, demo: { section: 'Inspect or correct the source and context', fields: [{ label: 'Source passage or my answer', value: 'In a four-person university team, I built the Excel model. We estimated a possible 25% cost reduction; the proposal was not implemented.' }], action: 'Inspect the full passage', note: 'Keep the project context with the figures.' } },
      { id: 'context', stageId: 'loop-fact-context', title: 'Keep project and work context distinct', instruction: 'Choose Evidence context and the literal Source context label. Do not turn a course exercise into paid work or a qualification into a verified credential.', caption: 'Academic project remains academic project. Credentials and eligibility need your own review.', narration: 'Choose the context that is actually true. Use the literal nearby heading in Source context label. University and MBA projects remain academic projects. An unfinished course is not a completed credential, and a phrase match does not verify a license, degree or eligibility.', durationSeconds: 22, demo: { section: 'Your claim library', fields: [{ label: 'Evidence context', value: 'academic project' }, { label: 'Source context label', value: 'University modelling course, 2026' }], action: 'Check the context', note: 'Keep a course project distinct from employment.' } },
      { id: 'contribution', stageId: 'loop-fact-wording', title: 'Say what you personally did', instruction: 'Read Wording I can substantiate. State your contribution while preserving team credit and scope. Choose Projected or estimated for a forecast.', caption: '“Built the model in a team” does not support “Led the transformation”.', narration: 'In Wording I can substantiate, explain your own part. Building a model in a team does not support saying you led an entire transformation. The result in this example is a forecast, so Result status stays Projected or estimated. Keep the limitation in the wording too.', durationSeconds: 23, demo: { section: 'Your claim library', fields: [{ label: 'Wording I can substantiate', value: 'Built the Excel model in a four-person university team; our proposed cost reduction was estimated, not implemented.' }, { label: 'Result status', value: 'Projected or estimated' }], action: 'Review factual wording', note: 'Team credit and the forecast limitation remain visible.' } },
      { id: 'clear', stageId: 'loop-fact-clearance', title: 'Confirm only what you can share', instruction: 'Confirm your accurate personal contribution and external-use permission only when true. Select Save claim, or Skip this passage for an unnecessary copied fact.', caption: 'Your confirmation is your own statement. Corrected facts require a new document review.', narration: 'Confirm that the wording describes your own accurate contribution, and that every included figure is permitted for external use. These are your statements, not independent verification. Save the claim. Without both confirmations it stays out of outputs. Changing or withdrawing a used fact invalidates affected approvals, so rebuild and review again.', durationSeconds: 28, demo: { section: 'Your claim library', fields: [{ label: 'Accuracy confirmation', value: 'Read the complete statement before confirming.' }, { label: 'External-use permission', value: 'Check permission for every included fact and figure.' }], action: 'Save claim', note: 'This tutorial does not confirm, save or share a claim.' } },
    ],
  },
  {
    id: 'another-application', title: 'Prepare your next application', description: 'Start the next job from your approved CV or unchanged career facts, then report your actual application progress.', audience: 'Anyone applying to a second vacancy', helpAnchor: 'second-application', action: { label: 'Return to my free check', to: '/check' },
    scenes: [
      { id: 'preserve', stageId: 'check-next-application', title: 'Keep the current application first', instruction: 'Download or save the current CV if you want to keep it. Under Applying for another job?, select Tailor for another job; it becomes available after you tick the confirmation. Undo new application restores the previous check while this page stays open.', caption: 'Your approved CV carries over. The old job, its changes and your confirmation do not.', narration: 'Before you start another application, download the current CV, or save it to your account, if you want to keep it. Under Applying for another job, select Tailor for another job. It is available once you have ticked the confirmation box. Your approved CV carries over; the old job, its changes and your confirmation do not. Saved checks stay unchanged, and Undo new application brings the previous check back while this page stays open.', durationSeconds: 27, demo: { section: 'Download · Applying for another job?', fields: [{ label: 'Applying for another job?', value: 'Start from this approved CV. Just paste the next job description.' }], action: 'Tailor for another job', note: 'Signed in? Each saved check also offers Use this CV for another vacancy.' } },
      { id: 'new-check', stageId: 'check-next-vacancy', title: 'Give the new job a fresh review', instruction: 'In Your next job, paste the new ad into The job description and check Job title and Company (optional). Open Check or edit the CV you are reusing to remove anything you do not want in this application. Select Tailor my CV for this job or Compare without AI, review the changes and tick the confirmation again.', caption: 'Your CV carries over. Changes, questions and the confirmation belong to the new job.', narration: 'The first stage is now called Your next job. Paste the new job description; the job title is read from the ad, so check it and the company. Open Check or edit the CV you are reusing if anything should stay out of this application. Select Tailor my CV for this job, or Compare without AI. Review the changes for this job and tick the confirmation again. A confirmation for one job cannot cover another.', durationSeconds: 26, demo: { section: 'Your next job', fields: [{ label: 'The job description', value: 'Business analyst at Example Company. Gather requirements, analyse survey data and present the findings.' }, { label: 'Job title', value: 'Business analyst' }, { label: 'Company (optional)', value: 'Example Company' }], action: 'Tailor my CV for this job', note: 'Check or edit the CV you are reusing before you tailor.' } },
      { id: 'loop-reuse', stageId: 'loop-opportunities', title: 'Reuse saved Job Loop facts', instruction: 'In Job Loop, open Opportunities and add the next vacancy. Reuse unchanged confirmed facts, inspect preparation on Today, and review the separate document in Outputs.', caption: 'You do not need to re-enter unchanged career facts for every job.', narration: 'In Job Loop, your saved career record and unchanged cleared facts are already available. Add the next real vacancy in Opportunities. Inspect available preparation on Today, then review the new document in Outputs. Every packet still has its own source checks and exact approval.', durationSeconds: 23, demo: { section: 'Opportunities', fields: [{ label: 'Your saved facts', value: 'Unchanged confirmed facts are available for reuse.' }, { label: 'New vacancy', value: 'A separate actual posting you choose.' }], action: 'Save opportunity', note: 'Open your workspace to prepare the next document.' } },
      { id: 'tracking', stageId: 'loop-application-tracking', title: 'Report the status after you act', instruction: 'Apply yourself on the employer’s site. Then choose Application status, confirm that you report it, add a follow-up date if useful and select Save tracking update.', caption: 'Saved or prepared is not applied. All application outcomes are user reported.', narration: 'Submit on the employer site yourself. When you have actually applied, update Application status in Opportunities and confirm that you report it. Add a follow-up date and notes if helpful, then select Save tracking update. Preparing or downloading a CV does not mean an application was submitted.', durationSeconds: 25, demo: { section: 'Your opportunities · tracking', fields: [{ label: 'Application status', value: 'saved — no employer submission in this tutorial' }, { label: 'Follow-up date', value: 'Choose your own date after reviewing progress.' }], action: 'Save tracking update', note: 'Interview, offer and rejection are also your reported outcomes.' } },
    ],
  },
  {
    id: 'controls-and-recovery', title: 'Stay in control of preparation and recovery', description: 'Read run coverage, make separate privacy choices and recover drafts within their limits.', audience: 'Especially useful for busy professionals', helpAnchor: 'job-loop-controls', action: { label: 'Read privacy and recovery help', to: '/help#recovery' },
    scenes: [
      { id: 'manual', stageId: 'loop-prepare', title: 'Begin with an available manual run', instruction: 'Save or discard career edits. On Today, check Prepare a cloud run and Preparation provider. Select Prepare today’s applications when available.', caption: 'Availability is reported in your workspace. Private saving does not start a run.', narration: 'Save or discard pending career edits and check that you have a confirmed, shareable fact. On Today, inspect preparation availability. Source-based preparation uses no external AI. Select Prepare today’s applications when the service permits it. A full pilot, missing configuration or allowance stop can make runs unavailable.', durationSeconds: 27, demo: { section: 'Today · Prepare a cloud run', fields: [{ label: 'Preparation provider', value: 'Source-based preparation · no AI' }, { label: 'Availability', value: 'Check the actual workspace. This tutorial reports no live service state.' }], action: 'Prepare today’s applications', note: 'Available external models require separate consent for the selected route.' } },
      { id: 'coverage', stageId: 'loop-run-history', title: 'Read partial results as partial', instruction: 'Inspect every lane in Run history & source coverage. Address reported issues before Resume run. Use Cancel run for queued or running jobs and refresh to confirm.', caption: 'Closing the page does not cancel a cloud run. A source failure is not proof that no jobs exist.', narration: 'Read the status, count and message for every source lane. A partial run may have usable outputs and missing coverage. Address the reported issue before using Resume run if available. Use Cancel run for a queued or running job, then refresh to confirm. Closing the page does not cancel cloud processing.', durationSeconds: 27, demo: { section: 'Run history & source coverage', fields: [{ label: 'Employer careers page', value: 'Completed: illustrative source check only.' }, { label: 'Additional source', value: 'Unavailable: no coverage should be inferred.' }], action: 'Inspect lane messages', note: 'No real run, search or model call takes place here.' } },
      { id: 'optional', stageId: 'loop-optional-controls', title: 'Make separate connection choices', instruction: 'Use Optional recurring preparation or Optional Gmail access only when needed and available. Check saved next-run details and confirm any returned mailbox.', caption: 'Pause retains current work. Cancel schedule also stops its latest queued or running scheduled job. No automatic sending.', narration: 'Recurring preparation is optional and uses the rules method. Check the saved next run after enabling it. Pause stops future scheduling and retains current work. Cancel schedule also stops its latest queued or running scheduled job. A separate manual run has its own Cancel run. Gmail connection and run reading consent are separate choices. A Gmail draft is unsent and requires its own recipient confirmation.', durationSeconds: 29, demo: { section: 'Today · Optional controls', fields: [{ label: 'Optional recurring preparation', value: 'Not enabled in this tour.' }, { label: 'Optional Gmail access', value: 'Not connected in this tour.' }], action: 'Read permissions before choosing', note: 'Google sign-in alone does not authorize inbox reading.' } },
      { id: 'recovery', stageId: 'check-draft-recovery', title: 'Choose refresh recovery deliberately', instruction: 'In the free check, open Draft recovery (optional) below the current stage. Tick Keep my draft in this tab across refresh only if you want temporary tab storage. Otherwise your draft returns only when you come back in the same tab.', caption: 'Optional tab storage lasts 30 minutes after your last change. A restored draft needs your confirmation again.', narration: 'The free check keeps your draft in memory when you leave and come back in the same tab within thirty minutes. Refresh recovery is a separate choice: open Draft recovery and tick Keep my draft in this tab across refresh. It stores the CV and job description in that tab for thirty minutes after your last change, and anyone using the tab may see it. Read a restored draft again and tick the confirmation box before you download.', durationSeconds: 28, demo: { section: 'Draft recovery (optional)', fields: [{ label: 'Keep my draft in this tab across refresh', value: 'Choose only if you want temporary tab storage.' }, { label: 'Restored confirmation', value: 'Cleared; read the CV and tick the confirmation box again.' }], action: 'Review recovery choices', note: 'Anyone using this browser tab may see a retained draft.' } },
      { id: 'loop-memory', stageId: 'loop-draft-recovery', title: 'Know what can return', instruction: 'Return to Job Loop in the same tab within 30 minutes for unsaved draft memory. Refresh, closing the tab or changing accounts clears it. Saved account records are separate.', caption: 'Recovered claim and contact confirmations reset. A saved account record is not a temporary draft.', narration: 'Job Loop keeps unsaved career, claim and new-vacancy edits only in memory for up to thirty minutes across page navigation. Refresh, closing the tab or changing accounts clears them. Recovered claim and contact confirmations reset. Saved account records are separate, and cloud runs may still continue. Read recovery help before relying on temporary memory.', durationSeconds: 29, demo: { section: 'Job Loop · Unsaved edits', fields: [{ label: 'Route recovery', value: 'Same tab and account, up to 30 minutes.' }, { label: 'After recovery', value: 'Read the source again; fact and contact confirmations reset.' }], action: 'Read recovery help', note: 'This tutorial records no CV text, account details or browser draft.' } },
    ],
  },
];

export function walkthroughScript(tutorial: WalkthroughTutorial) {
  let at = 0;
  return tutorial.scenes.map(scene => {
    const result = { ...scene, startSeconds: at, endSeconds: at + scene.durationSeconds };
    at += scene.durationSeconds;
    return result;
  });
}

export interface WalkthroughVideoAsset {
  tutorialId: string;
  videoUrl: string;
  captionUrl: string;
  durationSeconds: number;
  verifiedAt: string;
  usesFictionalData: true;
  contentKind: 'screen_recording' | 'screen_walkthrough';
  status: 'ready';
  presenterVideoUrl?: string;
  presenterDisclosure?: string;
  hasBurnedCaptions?: boolean;
  posterUrl?: string;
  chapters?: {id:string;title:string;startSeconds:number}[];
}
export interface WalkthroughVideoManifest { version: 1; videos: WalkthroughVideoAsset[] }

/** A released recording uses its measured chapters, never a planned script estimate. */
export function walkthroughTranscript(tutorial: WalkthroughTutorial, asset?: WalkthroughVideoAsset) {
  if (!asset || asset.tutorialId !== tutorial.id) return walkthroughScript(tutorial).map(scene => ({ ...scene, timing: 'planned' as const }));
  return tutorial.scenes.map(scene => {
    const chapterIndex = asset.chapters?.findIndex(chapter => chapter.id === scene.id) ?? -1;
    const chapter = chapterIndex >= 0 ? asset.chapters![chapterIndex] : undefined;
    return {
      ...scene,
      startSeconds: chapter?.startSeconds,
      endSeconds: chapter ? (asset.chapters![chapterIndex + 1]?.startSeconds ?? asset.durationSeconds) : undefined,
      timing: chapter ? 'recorded' as const : 'unavailable' as const,
    };
  });
}

/** Replace only with a reviewed public manifest after actual rendered assets exist. No startup fetch.
 * first-check, another-application and controls-and-recovery recordings show the retired six-step check,
 * so they stay unlisted (text-only steps) until re-recorded; see docs/product-hardening/tutorial-assets/RERECORD-3-STAGE.md. */
export const publicWalkthroughVideoManifest: WalkthroughVideoManifest = {
  "version": 1,
  "videos": [
    {
      "tutorialId": "job-loop-start",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/job-loop-start.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/job-loop-start.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/job-loop-start.jpg",
      "durationSeconds": 95.14999999999999,
      "verifiedAt": "2026-10-14T06:36:04.832040+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "A digitally generated guide with synthetic narration. Product screens use an example career record; Job Loop scenes illustrate the workflow without accessing a live account.",
      "chapters": [
        {
          "id": "open",
          "title": "Open the saved workspace",
          "startSeconds": 0.0
        },
        {
          "id": "source",
          "title": "Bring your existing text",
          "startSeconds": 16.175
        },
        {
          "id": "details",
          "title": "Check three details and save privately",
          "startSeconds": 34.0
        },
        {
          "id": "facts",
          "title": "Choose the fact’s real context",
          "startSeconds": 51.25
        },
        {
          "id": "next",
          "title": "Add the vacancy you want",
          "startSeconds": 74.6
        }
      ]
    },
    {
      "tutorialId": "source-review",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/source-review.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/source-review.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/fb3782a224759a8e0f4cb97b19845cac8dab3ef3/docs/product-hardening/tutorial-assets/videos/source-review.jpg",
      "durationSeconds": 78.425,
      "verifiedAt": "2026-10-14T06:36:04.832040+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "A digitally generated guide with synthetic narration. Product screens use an example career record; Job Loop scenes illustrate the workflow without accessing a live account.",
      "chapters": [
        {
          "id": "complete",
          "title": "Keep the complete statement",
          "startSeconds": 0.0
        },
        {
          "id": "context",
          "title": "Keep project and work context distinct",
          "startSeconds": 17.2
        },
        {
          "id": "contribution",
          "title": "Say what you personally did",
          "startSeconds": 36.9
        },
        {
          "id": "clear",
          "title": "Confirm only what you can share",
          "startSeconds": 55.25
        }
      ]
    }
  ]
};

const mediaOrigins = new Map([
  ['https://jobvance.io', '/walkthroughs/media/'],
  ['https://www.jobvance.io', '/walkthroughs/media/'],
  ['https://gvftdfriujrkpptdueyb.supabase.co', '/storage/v1/object/public/walkthroughs/'],
]);
/** Only first-party public media paths are accepted. No arbitrary provider, iframe or signed URL. */
export function isPublicWalkthroughMediaUrl(value: unknown, kind: 'video' | 'captions' | 'poster'): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    const prefix = mediaOrigins.get(url.origin);
    const ownedGitMedia=url.origin==='https://raw.githubusercontent.com' && /^\/aarshvir\/career-climb-automagic\/(?:main|[a-f\d]{40})\/docs\/product-hardening\/tutorial-assets\/videos\/[a-z\d-]+\.(?:mp4|webm|vtt|jpg|png)$/i.test(url.pathname);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && ((!!prefix && url.pathname.startsWith(prefix)) || ownedGitMedia) && !/%2f|%5c|%2e/i.test(url.pathname) && (kind === 'captions' ? /\.vtt$/i : kind==='poster'?/\.(jpg|png)$/i:/\.(mp4|webm)$/i).test(url.pathname);
  } catch { return false; }
}

/** Validation checks metadata and approved URLs; asset playback still needs production verification. */
export function validateWalkthroughVideoManifest(value: unknown): WalkthroughVideoManifest {
  if (!value || typeof value !== 'object') return { version: 1, videos: [] };
  const manifest = value as { version?: unknown; videos?: unknown };
  if (manifest.version !== 1 || !Array.isArray(manifest.videos) || manifest.videos.length > walkthroughs.length) return { version: 1, videos: [] };
  const videos: WalkthroughVideoAsset[] = [], seen = new Set<string>();
  for (const raw of manifest.videos) {
    if (!raw || typeof raw !== 'object') continue;
    const asset = raw as Partial<WalkthroughVideoAsset>;
    if (typeof asset.tutorialId !== 'string' || !walkthroughs.some(tutorial => tutorial.id === asset.tutorialId) || seen.has(asset.tutorialId) || asset.status !== 'ready' || !['screen_recording','screen_walkthrough'].includes(asset.contentKind ?? '') || asset.usesFictionalData !== true || !isPublicWalkthroughMediaUrl(asset.videoUrl, 'video') || !isPublicWalkthroughMediaUrl(asset.captionUrl, 'captions') || !Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0 || asset.durationSeconds > 1800 || typeof asset.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(asset.verifiedAt) || !Number.isFinite(Date.parse(asset.verifiedAt))) continue;
    if (asset.presenterVideoUrl !== undefined && (!isPublicWalkthroughMediaUrl(asset.presenterVideoUrl, 'video') || typeof asset.presenterDisclosure !== 'string' || asset.presenterDisclosure.length < 10 || asset.presenterDisclosure.length > 500 || !/\bAI\b|synthetic/i.test(asset.presenterDisclosure))) continue;
    if (asset.presenterDisclosure !== undefined && (typeof asset.presenterDisclosure !== 'string' || asset.presenterDisclosure.length < 10 || asset.presenterDisclosure.length > 500 || !/\bAI\b|synthetic/i.test(asset.presenterDisclosure))) continue;
    if(asset.posterUrl!==undefined&&!isPublicWalkthroughMediaUrl(asset.posterUrl,'poster'))continue;
    if(asset.chapters!==undefined && (!Array.isArray(asset.chapters)||asset.chapters.length<1||asset.chapters.length>6||asset.chapters.some((chapter,index)=>!chapter||typeof chapter!=='object'||!walkthroughs.find(t=>t.id===asset.tutorialId)?.scenes.some(scene=>scene.id===chapter.id)||typeof chapter.title!=='string'||chapter.title.length>150||!Number.isFinite(chapter.startSeconds)||chapter.startSeconds<0||chapter.startSeconds>=asset.durationSeconds||index>0&&chapter.startSeconds<=asset.chapters![index-1].startSeconds)))continue;
    seen.add(asset.tutorialId);
    videos.push({ tutorialId: asset.tutorialId, videoUrl: asset.videoUrl, captionUrl: asset.captionUrl, durationSeconds: asset.durationSeconds, verifiedAt: asset.verifiedAt, usesFictionalData: true, contentKind: asset.contentKind!, status: 'ready', ...(typeof asset.hasBurnedCaptions === 'boolean' ? { hasBurnedCaptions: asset.hasBurnedCaptions } : {}), ...(asset.presenterVideoUrl ? { presenterVideoUrl: asset.presenterVideoUrl } : {}), ...(asset.presenterDisclosure ? { presenterDisclosure: asset.presenterDisclosure } : {}),...(asset.posterUrl?{posterUrl:asset.posterUrl}:{}),...(asset.chapters?{chapters:asset.chapters.map(({id,title,startSeconds})=>({id,title,startSeconds}))}:{}) });
  }
  return { version: 1, videos };
}
