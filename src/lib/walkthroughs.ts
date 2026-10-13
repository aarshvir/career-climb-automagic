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

/** Original scripts for the current interface. Timings are narration plans, not recorded runtimes. */
export const walkthroughs: WalkthroughTutorial[] = [
  {
    id: 'first-check', title: 'Your first CV check', description: 'Bring your CV and one real vacancy, review the evidence, then approve your own document.', audience: 'Students · MBA students · Busy professionals', helpAnchor: 'first-check', action: { label: 'Start my free check', to: '/check' },
    scenes: [
      { id: 'role', stageId: 'check-role', title: 'Choose one target role', instruction: 'In Your role, enter Target role from the actual posting. Add Company (optional), then select Continue to your CV.', caption: 'Start with one job you want. No account is needed for the free check.', narration: 'Start with a real job you want. In Your role, enter the title from the posting. Company is optional. Select Continue to your CV. You can complete the check and download without creating an account.', durationSeconds: 18, demo: { section: 'Your role', fields: [{ label: 'Target role', value: 'Graduate analyst' }, { label: 'Company (optional)', value: 'Example Company — fictional' }], action: 'Continue to your CV', note: 'Only the role is required here.' } },
      { id: 'cv', stageId: 'check-cv', title: 'Read and check your CV text', instruction: 'Read a CV file on this device or paste your text. Correct extraction errors, remove confidential information, then select Use this reviewed CV text.', caption: 'English CV · text-based PDF, DOCX or TXT · up to 5 MB. Scanned PDFs need OCR first.', narration: 'Read your English CV as a text-based PDF, DOCX or TXT file, up to five megabytes, or paste the text. A scanned PDF needs readable text first. Check names, dates and headings in the extracted wording. Remove confidential information before selecting Use this reviewed CV text.', durationSeconds: 24, demo: { section: 'Your CV', fields: [{ label: 'CV text — paste, correct or remove private information', value: 'University analytics project, 2026. In a four-person team, I cleaned survey data and built the charts. No business result was measured.' }], action: 'Use this reviewed CV text', note: 'The original file stays on your device.' } },
      { id: 'vacancy', stageId: 'check-vacancy', title: 'Paste the full vacancy', instruction: 'In One vacancy, paste responsibilities, requirements and conditions into Vacancy description. Select Check these inputs.', caption: 'Use the actual description, including conditions. The check does not open employer links.', narration: 'In One vacancy, paste the full job description, including responsibilities, requirements and conditions. Use the actual posting, with at least eighty characters. Select Check these inputs. The check does not open links or send an application.', durationSeconds: 19, demo: { section: 'One vacancy', fields: [{ label: 'Vacancy description', value: 'Fictional posting: Graduate analyst. Support survey analysis, prepare clear charts and explain the findings. Review the listed location, qualifications and closing date.' }], action: 'Check these inputs', note: 'You review employer conditions yourself.' } },
      { id: 'evidence', stageId: 'check-evidence', title: 'Follow wording to its source', instruction: 'Compare In the vacancy with In your CV. Read the full vacancy, then select Review my CV & questions.', caption: 'A phrase match is a review aid. It does not establish qualification or eligibility.', narration: 'Each finding shows what the vacancy asks for beside what your CV says. Related wording may still need a better example. Read the full vacancy too. Matching phrases do not verify a degree, calculate experience years or predict an interview. Select Review my CV and questions.', durationSeconds: 24, demo: { section: 'The evidence', fields: [{ label: 'In the vacancy', value: 'Prepare clear charts and explain the findings.' }, { label: 'In your CV', value: 'In a four-person team, I cleaned survey data and built the charts.' }], action: 'Review my CV & questions', note: 'Fictional comparison. Team context stays in the source passage.' } },
      { id: 'review', stageId: 'check-review', title: 'Keep the words you can explain', instruction: 'Read Your CV to review. Edit only accurate wording, optionally add your own complete example, then select Recheck my changes & continue.', caption: 'Keep your contribution, project context and measured or estimated result clear.', narration: 'Read the complete CV and ask whether you could explain it in an interview. A team achievement stays a team achievement. An estimate stays an estimate. You do not need to fill every gap. Add an accurate, shareable example only if you have one, then select Recheck my changes and continue.', durationSeconds: 25, demo: { section: 'Your review', fields: [{ label: 'Your CV to review', value: 'University analytics project, 2026. In a four-person team, I cleaned survey data and built the charts. No business result was measured.' }], action: 'Recheck my changes & continue', note: 'The example is an academic project, not employment.' } },
      { id: 'approve', stageId: 'check-approve-download', title: 'Preview, approve and download', instruction: 'For PDF, choose Maximum PDF length and Preview current PDF. Read all pages, confirm accuracy and privacy, select Approve this CV, then download a ready format.', caption: 'If the PDF panel is blank, use Open the exact PDF preview in a new tab. Approval is yours.', narration: 'Read the final CV and evidence. For PDF, choose the maximum length and select Preview current PDF. If the panel is blank, open the exact preview in a new tab. Confirm accuracy and privacy, then select Approve this CV. Download PDF, DOCX or TXT. You send the document yourself.', durationSeconds: 28, demo: { section: 'Approve & download', fields: [{ label: 'Maximum PDF length', value: 'Two pages' }, { label: 'Final CV preview — review before approval', value: 'Complete fictional CV text to read. No preview artifact has been generated in this tutorial.' }], action: 'Approve this CV', note: 'PDF requires a current preview within your chosen maximum. DOCX/TXT layout depends on your reader.' } },
    ],
  },
  {
    id: 'job-loop-start', title: 'Set up your reusable career record', description: 'Import once, check three details and confirm useful facts one passage at a time.', audience: 'Students · MBA pivots · Employed professionals', helpAnchor: 'job-loop-start', action: { label: 'Open my Job Loop workspace', to: '/loop' },
    scenes: [
      { id: 'open', stageId: 'loop-today', title: 'Open the saved workspace', instruction: 'Sign in to your own Job Loop account. On Today, select Import or paste my CV, or open Career record.', caption: 'The workspace saves your record. The free check remains available without an account.', narration: 'Job Loop uses a private saved workspace. Sign in to your own account and open Today. Select Import or paste my CV, or choose Career record. If you want to try one comparison without an account, use the free CV check instead.', durationSeconds: 20, demo: { section: 'Today', fields: [{ label: 'Bring your CV', value: 'Import or paste once' }, { label: 'Confirm useful facts', value: 'No facts cleared in this fictional starting record' }], action: 'Import or paste my CV', note: 'Fictional starting state; no account has been created.' } },
      { id: 'source', stageId: 'loop-record-source', title: 'Bring your existing text', instruction: 'Open 1. Import or paste your CV. Read a local CV on this device or paste into Reviewed source CV or career record. Select Continue with this text.', caption: 'Review the wording before private saving. Your source file stays on your device.', narration: 'Open the import step. Read a local CV, paste your career text or choose an owned saved CV if one is available. Review the extracted wording and remove confidential information. Select Continue with this text. Reading the file does not yet save your record.', durationSeconds: 23, demo: { section: 'Career record · 1. Import or paste your CV', fields: [{ label: 'Reviewed source CV or career record', value: 'MBA operations project, 2026. My part was to map the process. Our team estimated a possible reduction in waiting time; this was not an implemented client result.' }], action: 'Continue with this text', note: 'English PDF, DOCX or TXT, up to 5 MB, or pasted text.' } },
      { id: 'details', stageId: 'loop-record-details', title: 'Check three details and save privately', instruction: 'Check My name, Target roles and Locations. Confirm private saving, then select Save career record. Leave optional preferences for later if you do not need them.', caption: 'Roles and locations focus the work. A suggested role does not prove you qualify.', narration: 'Check your name, enter one target role per line and add the places where you would work, or Remote. Optional preferences can wait. Leave unknown pay or experience unknown. Confirm that you want the reviewed text saved privately, then select Save career record.', durationSeconds: 24, demo: { section: 'Career record · 2. Check three details and save privately', fields: [{ label: 'My name', value: 'Maya Example — fictional' }, { label: 'Target roles', value: 'Operations analyst' }, { label: 'Locations', value: 'Dubai' }], action: 'Save career record', note: 'Private saving does not activate AI, inbox access or a schedule.' } },
      { id: 'facts', stageId: 'loop-record-facts', title: 'Choose the fact’s real context', instruction: 'In Your claim library, review the copied passage. Choose Evidence context, inspect the complete source and set Result status. Save claim only with accurate wording and appropriate sharing choices.', caption: 'Keep the course or employer heading, your own contribution and estimated-result wording.', narration: 'Review one literal passage at a time. Choose Evidence context yourself, and inspect the complete source and nearby heading. In this fictional MBA example, the team estimated a possible result, so choose Projected or estimated. Do not turn it into measured client work. Confirm accuracy and external-use permission only when true, then save the claim.', durationSeconds: 31, demo: { section: 'Your claim library', fields: [{ label: 'Evidence context', value: 'academic project' }, { label: 'Source context label', value: 'MBA operations project, 2026' }, { label: 'Result status', value: 'Projected or estimated' }], action: 'Save claim', note: 'Skip this passage is available for a fact you do not need.' } },
      { id: 'next', stageId: 'loop-opportunities', title: 'Add the vacancy you want', instruction: 'Open Opportunities. Enter the real posting in Add an opportunity and select Save opportunity. Return to Today to inspect available preparation.', caption: 'Use unchanged confirmed facts again. Each output still needs its own review.', narration: 'With useful facts saved, open Opportunities and add the posting you want to apply for. Use the actual title, company, HTTPS link and full description. Leave a named contact out unless you have checked a real source. Save the opportunity, then return to Today to inspect preparation availability.', durationSeconds: 25, demo: { section: 'Opportunities · Add an opportunity', fields: [{ label: 'Vacancy title', value: 'Operations analyst — fictional posting' }, { label: 'Full vacancy description', value: 'Copy the complete actual posting in your own workspace. This tutorial does not create a vacancy.' }], action: 'Save opportunity', note: 'A source link is not independent proof that a role is open.' } },
    ],
  },
  {
    id: 'source-review', title: 'Explain your contribution accurately', description: 'Keep complete sources, classroom context, team credit and forecasts intact.', audience: 'Especially useful for students and MBA pivots', helpAnchor: 'job-loop-facts', action: { label: 'Read the fact-review help', to: '/help#job-loop-facts' },
    scenes: [
      { id: 'complete', stageId: 'loop-fact-source', title: 'Keep the complete statement', instruction: 'Open Inspect or correct the source and context. Preserve the complete Source passage or my answer instead of copying isolated keywords or numbers.', caption: '“Excel, 25%” is a fragment. Keep the full contribution and result qualifications.', narration: 'A claim needs a complete source statement. Open Inspect or correct the source and context. Keep the whole passage, including team credit, dates and estimate language. An isolated keyword or figure is not enough to show what happened or what you contributed.', durationSeconds: 23, demo: { section: 'Inspect or correct the source and context', fields: [{ label: 'Source passage or my answer', value: 'In a four-person university team, I built the Excel model. We estimated a possible 25% cost reduction; the proposal was not implemented.' }], action: 'Inspect the full passage', note: 'All people, work and numbers in this example are fictional.' } },
      { id: 'context', stageId: 'loop-fact-context', title: 'Keep project and work context distinct', instruction: 'Choose Evidence context and the literal Source context label. Do not turn a course exercise into paid work or a qualification into a verified credential.', caption: 'Academic project remains academic project. Credentials and eligibility need your own review.', narration: 'Choose the context that is actually true. Use the literal nearby heading in Source context label. University and MBA projects remain academic projects. An unfinished course is not a completed credential, and a phrase match does not verify a license, degree or eligibility.', durationSeconds: 22, demo: { section: 'Your claim library', fields: [{ label: 'Evidence context', value: 'academic project' }, { label: 'Source context label', value: 'University modelling course, 2026' }], action: 'Check the context', note: 'Do not relabel this fictional course project as employment.' } },
      { id: 'contribution', stageId: 'loop-fact-wording', title: 'Say what you personally did', instruction: 'Read Wording I can substantiate. State your contribution while preserving team credit and scope. Choose Projected or estimated for a forecast.', caption: '“Built the model in a team” does not support “Led the transformation”.', narration: 'In Wording I can substantiate, explain your own part. Building a model in a team does not support saying you led an entire transformation. The result in this example is a forecast, so Result status stays Projected or estimated. Keep the limitation in the wording too.', durationSeconds: 23, demo: { section: 'Your claim library', fields: [{ label: 'Wording I can substantiate', value: 'Built the Excel model in a four-person university team; our proposed cost reduction was estimated, not implemented.' }, { label: 'Result status', value: 'Projected or estimated' }], action: 'Review factual wording', note: 'Team credit and the forecast limitation remain visible.' } },
      { id: 'clear', stageId: 'loop-fact-clearance', title: 'Confirm only what you can share', instruction: 'Confirm your accurate personal contribution and external-use permission only when true. Select Save claim, or Skip this passage for an unnecessary copied fact.', caption: 'Your confirmation is your own statement. Corrected facts require a new document review.', narration: 'Confirm that the wording describes your own accurate contribution, and that every included figure is permitted for external use. These are your statements, not independent verification. Save the claim. Without both confirmations it stays out of outputs. Changing or withdrawing a used fact invalidates affected approvals, so rebuild and review again.', durationSeconds: 28, demo: { section: 'Your claim library', fields: [{ label: 'Accuracy confirmation', value: 'Read the complete statement before confirming.' }, { label: 'External-use permission', value: 'Check permission for every included fact and figure.' }], action: 'Save claim', note: 'This tutorial does not confirm, save or share a claim.' } },
    ],
  },
  {
    id: 'another-application', title: 'Prepare your next application', description: 'Reuse a chosen CV or unchanged career facts, then report your actual application progress.', audience: 'Anyone applying to a second vacancy', helpAnchor: 'second-application', action: { label: 'Return to my free check', to: '/check' },
    scenes: [
      { id: 'preserve', stageId: 'check-next-application', title: 'Keep the current application first', instruction: 'Download or save the approved check before replacing it. Under Your next application, choose CV version for another vacancy.', caption: 'Choose Reviewed source CV or Approved final CV deliberately.', narration: 'Before starting another application, download or save the approved check if you want to keep it. Under Your next application, choose which CV to reuse: Reviewed source CV or Approved final CV. The choice replaces the open check; saved applications stay unchanged.', durationSeconds: 23, demo: { section: 'Your next application', fields: [{ label: 'CV version for another vacancy', value: 'Reviewed source CV' }], action: 'Use this CV for another vacancy', note: 'The old vacancy and its approval do not carry over.' } },
      { id: 'new-check', stageId: 'check-next-vacancy', title: 'Give the new job a fresh review', instruction: 'Select Use this CV for another vacancy. Enter the target role, optional company and new vacancy together. Open Inspect or edit the reused CV if needed, then select Check this next vacancy. Review the new evidence and approve again.', caption: 'Useful source wording can carry over. Findings and approval belong to the new inputs.', narration: 'Select Use this CV for another vacancy. Enter the new target role and optional company, review the reused CV and paste the new posting. Work through the evidence and your review again. A previous approval cannot approve this new combination of CV and vacancy.', durationSeconds: 22, demo: { section: 'Next vacancy · reused CV', fields: [{ label: 'Target role', value: 'Business analyst — fictional new target' }, { label: 'Company (optional)', value: 'Add the new employer, if you want.' }], action: 'Check this next vacancy', note: 'A fresh comparison is required for the new posting.' } },
      { id: 'loop-reuse', stageId: 'loop-opportunities', title: 'Reuse saved Job Loop facts', instruction: 'In Job Loop, open Opportunities and add the next vacancy. Reuse unchanged confirmed facts, inspect preparation on Today, and review the separate document in Outputs.', caption: 'You do not need to re-enter unchanged career facts for every job.', narration: 'In Job Loop, your saved career record and unchanged cleared facts are already available. Add the next real vacancy in Opportunities. Inspect available preparation on Today, then review the new document in Outputs. Every packet still has its own source checks and exact approval.', durationSeconds: 23, demo: { section: 'Opportunities', fields: [{ label: 'Your saved facts', value: 'Unchanged confirmed facts are available for reuse.' }, { label: 'New vacancy', value: 'A separate actual posting you choose.' }], action: 'Save opportunity', note: 'This fictional storyboard creates no application document.' } },
      { id: 'tracking', stageId: 'loop-application-tracking', title: 'Report the status after you act', instruction: 'Apply yourself on the employer’s site. Then choose Application status, confirm that you report it, add a follow-up date if useful and select Save tracking update.', caption: 'Saved or prepared is not applied. All application outcomes are user reported.', narration: 'Submit on the employer site yourself. When you have actually applied, update Application status in Opportunities and confirm that you report it. Add a follow-up date and notes if helpful, then select Save tracking update. Preparing or downloading a CV does not mean an application was submitted.', durationSeconds: 25, demo: { section: 'Your opportunities · tracking', fields: [{ label: 'Application status', value: 'saved — no employer submission in this tutorial' }, { label: 'Follow-up date', value: 'Choose your own date after reviewing progress.' }], action: 'Save tracking update', note: 'Interview, offer and rejection are also your reported outcomes.' } },
    ],
  },
  {
    id: 'controls-and-recovery', title: 'Stay in control of preparation and recovery', description: 'Read run coverage, make separate privacy choices and recover drafts within their limits.', audience: 'Especially useful for busy professionals', helpAnchor: 'job-loop-controls', action: { label: 'Read privacy and recovery help', to: '/help#recovery' },
    scenes: [
      { id: 'manual', stageId: 'loop-prepare', title: 'Begin with an available manual run', instruction: 'Save or discard career edits. On Today, check Prepare a cloud run and Preparation provider. Select Prepare today’s applications when available.', caption: 'Availability is reported in your workspace. Private saving does not start a run.', narration: 'Save or discard pending career edits and check that you have a confirmed, shareable fact. On Today, inspect preparation availability. Source-based preparation uses no external AI. Select Prepare today’s applications when the service permits it. A full pilot, missing configuration or allowance stop can make runs unavailable.', durationSeconds: 27, demo: { section: 'Today · Prepare a cloud run', fields: [{ label: 'Preparation provider', value: 'Source-based preparation · no AI' }, { label: 'Availability', value: 'Check the actual workspace. This tutorial reports no live service state.' }], action: 'Prepare today’s applications', note: 'Available external models require separate consent for the selected route.' } },
      { id: 'coverage', stageId: 'loop-run-history', title: 'Read partial results as partial', instruction: 'Inspect every lane in Run history & source coverage. Address reported issues before Resume run. Use Cancel run for queued or running jobs and refresh to confirm.', caption: 'Closing the page does not cancel a cloud run. A source failure is not proof that no jobs exist.', narration: 'Read the status, count and message for every source lane. A partial run may have usable outputs and missing coverage. Address the reported issue before using Resume run if available. Use Cancel run for a queued or running job, then refresh to confirm. Closing the page does not cancel cloud processing.', durationSeconds: 27, demo: { section: 'Run history & source coverage', fields: [{ label: 'Fictional lane A', value: 'Completed: illustrative source check only.' }, { label: 'Fictional lane B', value: 'Unavailable: no coverage should be inferred.' }], action: 'Inspect lane messages', note: 'No real run, search or model call takes place here.' } },
      { id: 'optional', stageId: 'loop-optional-controls', title: 'Make separate connection choices', instruction: 'Use Optional recurring preparation or Optional Gmail access only when needed and available. Check saved next-run details and confirm any returned mailbox.', caption: 'Pause schedule, Cancel schedule and Cancel run control different things. No automatic sending.', narration: 'Recurring preparation is optional and uses the rules method. Check the saved next run after enabling it. Pause or cancel the schedule controls future scheduling; an active job has a separate Cancel run. Gmail connection and run reading consent are separate choices. A Gmail draft is unsent and requires its own recipient confirmation.', durationSeconds: 29, demo: { section: 'Today · Optional controls', fields: [{ label: 'Optional recurring preparation', value: 'Not enabled in this fictional demo.' }, { label: 'Optional Gmail access', value: 'Not connected in this fictional demo.' }], action: 'Read permissions before choosing', note: 'Google sign-in alone does not authorize inbox reading.' } },
      { id: 'recovery', stageId: 'check-draft-recovery', title: 'Choose refresh recovery deliberately', instruction: 'In the free check, open Draft recovery (optional) and check Keep my draft in this tab across refresh if needed. Otherwise route recovery stays in tab memory.', caption: 'Optional tab storage lasts 30 minutes after your last change. Restored approval is cleared.', narration: 'The free check can return from memory when you navigate away and come back in the same tab within thirty minutes. Refresh recovery needs the separate Keep my draft in this tab across refresh choice. It stores the CV and vacancy in that tab for thirty minutes after your last change. Read a restored draft and approve again.', durationSeconds: 29, demo: { section: 'Draft recovery (optional)', fields: [{ label: 'Keep my draft in this tab across refresh', value: 'Choose only if you want temporary tab storage.' }, { label: 'Restored approval', value: 'Cleared; review and approval are required again.' }], action: 'Review recovery choices', note: 'Anyone using this browser tab may see a retained draft.' } },
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

/** Replace only with a reviewed public manifest after actual rendered assets exist. No startup fetch. */
export const publicWalkthroughVideoManifest: WalkthroughVideoManifest = {
  "version": 1,
  "videos": [
    {
      "tutorialId": "first-check",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/first-check.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/first-check.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/first-check.jpg",
      "durationSeconds": 111.275,
      "verifiedAt": "2026-10-13T19:53:17.135428+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Job Loop demonstrations use a clearly labelled local simulation.",
      "chapters": [
        {
          "id": "role",
          "title": "Choose one target role",
          "startSeconds": 0
        },
        {
          "id": "cv",
          "title": "Read and check your CV text",
          "startSeconds": 13.125
        },
        {
          "id": "vacancy",
          "title": "Paste the full vacancy",
          "startSeconds": 34.525
        },
        {
          "id": "evidence",
          "title": "Follow wording to its source",
          "startSeconds": 51.099999999999994
        },
        {
          "id": "review",
          "title": "Keep the words you can explain",
          "startSeconds": 70.55
        },
        {
          "id": "approve",
          "title": "Preview, approve and download",
          "startSeconds": 89.5
        }
      ]
    },
    {
      "tutorialId": "job-loop-start",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/job-loop-start.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/job-loop-start.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/job-loop-start.jpg",
      "durationSeconds": 95.625,
      "verifiedAt": "2026-10-13T19:53:17.135428+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Job Loop demonstrations use a clearly labelled local simulation.",
      "chapters": [
        {
          "id": "open",
          "title": "Open the saved workspace",
          "startSeconds": 0
        },
        {
          "id": "source",
          "title": "Bring your existing text",
          "startSeconds": 16.175
        },
        {
          "id": "details",
          "title": "Check three details and save privately",
          "startSeconds": 34
        },
        {
          "id": "facts",
          "title": "Choose the fact’s real context",
          "startSeconds": 51.25
        },
        {
          "id": "next",
          "title": "Add the vacancy you want",
          "startSeconds": 75.075
        }
      ]
    },
    {
      "tutorialId": "source-review",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/source-review.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/source-review.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/source-review.jpg",
      "durationSeconds": 78.425,
      "verifiedAt": "2026-10-13T19:53:17.135428+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Job Loop demonstrations use a clearly labelled local simulation.",
      "chapters": [
        {
          "id": "complete",
          "title": "Keep the complete statement",
          "startSeconds": 0
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
    },
    {
      "tutorialId": "another-application",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/another-application.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/another-application.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/another-application.jpg",
      "durationSeconds": 75.30000000000001,
      "verifiedAt": "2026-10-13T19:53:17.135428+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Job Loop demonstrations use a clearly labelled local simulation.",
      "chapters": [
        {
          "id": "preserve",
          "title": "Keep the current application first",
          "startSeconds": 0
        },
        {
          "id": "new-check",
          "title": "Give the new job a fresh review",
          "startSeconds": 18.4
        },
        {
          "id": "loop-reuse",
          "title": "Reuse saved Job Loop facts",
          "startSeconds": 36.825
        },
        {
          "id": "tracking",
          "title": "Report the status after you act",
          "startSeconds": 55.825
        }
      ]
    },
    {
      "tutorialId": "controls-and-recovery",
      "videoUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/controls-and-recovery.mp4",
      "captionUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/controls-and-recovery.vtt",
      "posterUrl": "https://raw.githubusercontent.com/aarshvir/career-climb-automagic/76ed2305be14a9863e37f4faa5daf0a8586b4874/docs/product-hardening/tutorial-assets/videos/controls-and-recovery.jpg",
      "durationSeconds": 111.675,
      "verifiedAt": "2026-10-13T19:53:17.135428+00:00",
      "usesFictionalData": true,
      "contentKind": "screen_walkthrough",
      "status": "ready",
      "hasBurnedCaptions": true,
      "presenterDisclosure": "Original fictional AI presenter and synthetic narration. These tutorials use real product-screen captures with fictional data; Job Loop demonstrations use a clearly labelled local simulation.",
      "chapters": [
        {
          "id": "manual",
          "title": "Begin with an available manual run",
          "startSeconds": 0
        },
        {
          "id": "coverage",
          "title": "Read partial results as partial",
          "startSeconds": 22.525
        },
        {
          "id": "optional",
          "title": "Make separate connection choices",
          "startSeconds": 43.125
        },
        {
          "id": "recovery",
          "title": "Choose refresh recovery deliberately",
          "startSeconds": 67.025
        },
        {
          "id": "loop-memory",
          "title": "Know what can return",
          "startSeconds": 87.625
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
