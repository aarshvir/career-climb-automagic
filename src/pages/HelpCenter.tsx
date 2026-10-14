import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { staticPageMeta } from '@/lib/public-site-meta';
import { ArrowRight, BookOpen, ClipboardList, FileText, Search } from 'lucide-react';
import './HelpCenter.css';

type HelpCategory = 'Free CV check' | 'Job Loop' | 'Privacy & recovery';
export interface HelpTopic {
  id: string;
  category: HelpCategory;
  title: string;
  summary: string;
  steps: string[];
  fields?: { label: string; help: string }[];
  notes: string[];
  action: { label: string; to: string };
  related?: { label: string; id: string }[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: 'first-check', category: 'Free CV check', title: 'Check one CV against one real vacancy',
    summary: 'Start without an account. You need your CV text and the full description of a job you want.',
    steps: [
      'Open the free CV check. In Your role, enter the Target role from the posting. Company (optional) can stay empty. Select Continue to your CV.',
      'In Your CV, choose Read a CV file on this device or paste into CV text — paste, correct or remove private information. Read the extracted text, correct dates and headings, and remove confidential information. Select Use this reviewed CV text.',
      'In One vacancy, paste the actual posting into Vacancy description, including responsibilities, requirements and conditions. Select Check these inputs.',
      'In The evidence, compare In the vacancy with In your CV. Open Read the full vacancy and check anything the comparison missed. Select Review my CV & questions.',
      'In Your review, read Your CV to review, make any changes, and check the facts and context. Optional examples and paragraph removal are available here. Select Recheck my changes & continue.',
      'In Approve & download, read the final CV and evidence. Select Maximum PDF length and Preview current PDF if you want PDF. Confirm factual accuracy and privacy, select Approve this CV, then Download PDF, Download DOCX or Download TXT.',
    ],
    notes: [
      'The check compares English wording on your device. A matching phrase does not verify a qualification, establish eligibility, calculate your experience years or predict an interview.',
      'You can leave review questions unresolved. State your actual qualification status, label academic work and show your part in team results. Check required credentials separately from skills and examples.',
      'Download evidence report keeps the review questions separate from your CV. Sign-in is an optional later step for private saving.',
    ],
    action: { label: 'Start the free CV check', to: '/check' },
    related: [{ label: 'File problems', id: 'uploads' }, { label: 'Remove private source lines', id: 'source-line-removal' }, { label: 'No CV yet', id: 'no-cv' }],
  },
  {
    id: 'no-cv', category: 'Free CV check', title: 'Start when you do not have a CV yet',
    summary: 'A plain text CV draft is enough. Begin with one useful example, then add your education, dates and experience.',
    steps: [
      'Open the free CV check, enter your target role and select Continue to your CV.',
      'Paste a simple record into CV text — paste, correct or remove private information. Include your name, education, project or work heading, dates, your contribution and skills you actually use. At least 80 characters of readable text are needed.',
      'For a student, label coursework, academic projects, internships and volunteering correctly. For an MBA pivot, keep prior work and classroom projects in separate sections. For an employed professional, start with a shareable version of your existing experience.',
      'Read the record and select Use this reviewed CV text. Paste one real vacancy on the next step. Work through the evidence and review before approving a download.',
    ],
    fields: [{ label: 'Fictional starting example', help: 'University analytics project, 2026. In a four-person team, I cleaned the survey data and built the charts. Our proposed improvement was an estimate; no business result was measured.' }],
    notes: ['Use headings that show where the work happened, explain your part in team projects, label forecasts as estimates and list courses as completed or in progress.'],
    action: { label: 'Begin with my experience', to: '/check' }, related: [{ label: 'Review source facts', id: 'job-loop-facts' }],
  },
  {
    id: 'uploads', category: 'Free CV check', title: 'Read a file, fix extracted text or convert an old CV',
    summary: 'Use an English CV as a text-based PDF, DOCX or UTF-8 TXT file, up to 5 MB. You can paste text instead.',
    steps: [
      'In the free check, open Your CV and choose Read a CV file on this device. In Job Loop, open Career record, then 1. Import or paste your CV and choose Read a local CV on this device.',
      'Select a PDF, DOCX or TXT file of 5 MB or less. The original file stays on your device. Reading a file is separate from choosing to save the extracted text to your account.',
      'If a scanned PDF has no readable text, use OCR in a document tool you trust, or copy text from the original document. Review the OCR output carefully, then paste it or save a text-based PDF, DOCX or TXT file. Jobvance does not perform OCR here.',
      'For an old .doc file, open it in your word processor and save a .docx, text-based PDF or TXT copy. Renaming the extension does not convert a document.',
      'If the file is empty, too large or has scrambled lines, export a smaller text-based copy or paste the correct text. Check names, dates, bullets, course headings and numbers before continuing.',
    ],
    notes: ['Keep readable CV text between 80 and 60,000 characters. Keep nearby headings so the reader can see whether the work was a project, internship or employer role. Remove sensitive or confidential details before saving or sharing.'],
    action: { label: 'Read my CV in the free check', to: '/check' }, related: [{ label: 'Remove private source lines', id: 'source-line-removal' }, { label: 'Recover an interrupted draft', id: 'recovery' }],
  },
  {
    id: 'source-line-removal', category: 'Privacy & recovery', title: 'Remove selected source lines before reusing your CV',
    summary: 'Remove confidential or sensitive information from the free check’s reusable source. Choose exact lines, preview both CV versions, then decide whether to apply the removal.',
    steps: [
      'In Your review or Approve & download, open Reuse these edits later (optional), then open Choose source lines to remove. Read each complete numbered line and select only the Remove source line checkboxes you intend to remove.',
      'Select Preview selected line removals. Read Reusable source after removal and Current CV after removal before changing either version. Remove selected lines applies only after this preview. Cancel line removal leaves the source unchanged.',
      'Select Remove selected lines when both previews are correct. The selected source lines and every identical complete line in the current CV are removed. If the current CV contains an edited or differently worded version of that passage, inspect and remove it manually too.',
      'Review the remaining headings, context and current CV. The previous evidence, PDF preview and approval are cleared. Run the comparison again and review and approve the current document before downloading.',
      'If you removed the wrong lines, use Undo source-line removal while the page stays open. It restores the previous source and current CV, including removed details; review again before approving. Leaving or refreshing the page loses this undo.',
    ],
    notes: ['Editing the final CV alone does not update the reusable source. Keep these edits in my reusable source replaces the entire open source with the reviewed CV; choose it only after checking everything you want to keep. Selected line removal lets you preview individual lines instead.', 'This changes the open check only. Saved account checks and downloaded files stay unchanged. Selecting lines is separate from private account saving and Job Loop fact permission. To remove private wording from the original CV text, edit that text or remove the relevant lines; an exclusion preference alone leaves it in place.'],
    action: { label: 'Review my source in the free check', to: '/check' }, related: [{ label: 'Privacy choices', id: 'privacy' }, { label: 'Prepare another application', id: 'second-application' }],
  },
  {
    id: 'job-loop-start', category: 'Job Loop', title: 'Set up Job Loop with the CV you already have',
    summary: 'Save one private career record, then confirm only the facts useful for your next application. An account is needed for the saved workspace.',
    steps: [
      'Open Job Loop and sign in to your own account if prompted. On Today, select Import or paste my CV, or choose Career record in the section navigation.',
      'Open 1. Import or paste your CV. Read a local CV on this device, paste into Reviewed source CV or career record, or choose Use an owned saved CV (optional) when one is available.',
      'Read the source text, correct extraction errors and remove confidential details. Select Continue with this text.',
      'In 2. Check three details and save privately, check My name, enter Target roles and Locations. Review optional preferences only when they are useful. Confirm private saving, then select Save career record.',
      'Review the copied passages one at a time in Your claim library. Choose the evidence context and confirm only accurate, shareable facts. Save claim or Skip this passage. You can add your own specific example later.',
    ],
    fields: [
      { label: 'Target roles', help: 'Enter one role per line at the level you intend to apply for. Check the experience and qualifications in each vacancy before applying.' },
      { label: 'Locations', help: 'Enter places where you would work, or Remote. These focus preparation; check work authorization and availability in the actual vacancy.' },
      { label: 'Optional preferences and privacy boundaries', help: 'Page preference, actual languages, exclusions and compensation can wait. Leave unknown experience or pay unknown.' },
    ],
    notes: ['Saving privately does not activate AI, mailbox reading, recurring runs or employer submission. Unchanged confirmed facts can be reused for the next vacancy.'],
    action: { label: 'Open my Job Loop workspace', to: '/loop' }, related: [{ label: 'Confirm useful facts', id: 'job-loop-facts' }],
  },
  {
    id: 'job-loop-facts', category: 'Job Loop', title: 'Review the experience saved in your career record',
    summary: 'Review each example with its original context, your contribution and the result before reusing it in an application.',
    steps: [
      'Open Career record and Your claim library. Review the next copied passage, select Suggest literal passages if available, or open Add my own specific example.',
      'Choose Evidence context yourself: employment, internship, academic project, personal project, volunteering, education or skill. Keep academic and personal projects in their original categories when you use them for a job application.',
      'Open Inspect or correct the source and context (or Source and factual wording for your own example). Choose Source of this statement. Keep the complete line or passage in Source passage or my answer, including team credit, dates and estimate wording.',
      'Use the nearby course, project or employer heading in Source context label. In Wording I can substantiate, describe your own accurate contribution. For My own answer, make the source answer a complete statement with contribution and context.',
      'Choose Result status: No measured result stated, Projected or estimated, or Measured result. An estimate stays an estimate. Check factual accuracy and permission for external use only when both are true, then select Save claim.',
    ],
    fields: [
      { label: 'Source passage or my answer', help: 'Expand shorthand such as “Excel, 25%” into a complete statement: what you did, the setting and any qualifications to the result. Your confirmation records your own review; it is not independent verification.' },
      { label: 'Wording I can substantiate', help: 'For example, “I analysed the survey data in a four-person MBA team” states the action and team context. Keep that detail when shortening or rewording the example.' },
      { label: 'Result status', help: 'Keep projected benefits, team outcomes and personally measured results distinct. A degree, certificate or required license must be stated accurately; matching words do not verify it.' },
    ],
    notes: ['New documents use facts that are active, confirmed as accurate and approved for external use. Save both confirmations when you want to include a fact. Editing or withdrawing a source fact invalidates affected approvals; rebuild and review the document again.'],
    action: { label: 'Review my career facts', to: '/loop' }, related: [{ label: 'Review the exact document', id: 'job-loop-review' }],
  },
  {
    id: 'job-loop-vacancies', category: 'Job Loop', title: 'Add and check a real vacancy',
    summary: 'Add the employer posting you want to apply for, then check the deadline, location and application instructions at the original source.',
    steps: [
      'Open Opportunities, or select Add a vacancy I already found on Today.',
      'In Add an opportunity, enter Vacancy title and Company. Add Location, the Vacancy HTTPS link and the Full vacancy description from the actual posting. The description needs at least 80 characters.',
      'Leave Add a named contact I have checked (optional) unchecked unless you have a real source. If you add a contact, preserve the supporting source passage and check identity and role yourself. Use an email address only when you have checked its source.',
      'Select Save opportunity. In Your opportunities, select Open vacancy yourself and verify the closing date, location, pay, work authorization and required qualifications against the original source.',
      'On Today, read Know where your shortlist comes from and Run history & source coverage. Inspect each source’s actual result, date and message. Added vacancies can remain useful when discovery is unavailable.',
    ],
    notes: ['Employer feeds cover selected sources. If a source is unavailable or a run is partial, read its message and check other sources as needed; an empty result covers only that search. Confirm compensation and eligibility with the employer when they are not stated.'],
    action: { label: 'Add a vacancy in Job Loop', to: '/loop' }, related: [{ label: 'Prepare and control runs', id: 'job-loop-controls' }],
  },
  {
    id: 'job-loop-review', category: 'Job Loop', title: 'Preview, approve and download the exact document',
    summary: 'Read the complete document, preview the PDF and approve the version you want to download.',
    steps: [
      'Open Outputs and select the document you want to review, or select Review this run’s outputs in the run history.',
      'Open Source references and evidence and Relevance and unresolved questions. Read CV text for factual review, including the context and result status of each claim.',
      'Select Open exact PDF preview when a PDF is ready. Inspect every page for cut-off text, missing characters, headings and the selected page preference. If the preview is blank, select open this exact PDF in a new tab. Use Reload exact PDF preview to request the file again if needed. Wait until you can read the PDF before approving it.',
      'If a fact is wrong, select Edit career facts, correct it, then save and confirm it. Prepare a fresh output and review the document. Read any format warnings and check PDF, DOCX and TXT separately; another format may still be ready.',
      'Confirm that the complete CV and evidence are accurate and safe for external use. Select Approve exact packet. Then choose a ready Download PDF, Download DOCX or Download TXT format. Download evidence report separately.',
      'Read Cover letter and message drafts (unsent) separately. You send or apply yourself on the employer’s site. An optional Create Gmail draft action creates an unsent draft only and has its own recipient and attachment confirmation.',
    ],
    notes: ['Approval is blocked when source facts have changed, a document is held for review or career edits are unsaved. Correct the record, rebuild and review again. In the free check, select Preview current PDF, then Open the exact PDF preview in a new tab if the inline PDF is blank. PDF download requires a current preview within the chosen maximum; approved DOCX/TXT can remain available.', 'A Job Loop preview or download transfer stops when you leave the page, change accounts, select another application, or its approval or source validity is lost. Stopping a file transfer does not cancel a cloud preparation run.', 'Transfers stop after 45 seconds or above the 10 MiB file limit. If you see “The document download timed out”, reopen the current document and review or approve again if needed. Use Reload exact PDF preview or a ready Download format to request a fresh private link. For a file-limit message, try another ready format or contact workflow help.'],
    action: { label: 'Review my prepared documents', to: '/loop' }, related: [{ label: 'Accuracy of facts', id: 'job-loop-facts' }, { label: 'Run recovery', id: 'job-loop-controls' }],
  },
  {
    id: 'job-loop-controls', category: 'Job Loop', title: 'Prepare applications and manage recurring preparation',
    summary: 'Start preparation using your confirmed experience, check the results, and choose whether to enable a schedule or an available connection.',
    steps: [
      'Save or discard all career record and claim edits. Check that at least one active fact is both confirmed and shareable, and add the vacancy you want to prepare for.',
      'On Today, read Prepare a cloud run. Choose Preparation provider. Source-based preparation · no AI uses cleared facts without an external model. An available AI model needs explicit permission for that selected provider and processing route.',
      'Select Prepare today’s applications only when the service reports it available. If cloud processing is not configured, the pilot is full or the allowance is exhausted, use saved records and manual tracking or the free check. Preparation waits for the selected provider to be available rather than switching providers.',
      'Read Run history & source coverage. Check the status and message for each source and task. For partial, blocked or failed runs, review any usable results and note what still needs to finish. Use Resume run when available after addressing the stated issue. Use Cancel run for a queued or running job, then refresh to confirm its state.',
      'Open Optional recurring preparation only if you want it. Check Preparation cadence, Local preparation time and Schedule timezone, then opt in and select Enable recurring preparation. Read the actual saved next run. Pause schedule stops future scheduling and retains the current run. Cancel schedule also cancels its latest scheduled run if that run is queued or running. A separately started manual run has its own Cancel run. Refresh records to confirm the result.',
      'Open Optional Gmail access only if you need it and access is available. Select chosen permissions, connect, and confirm the returned mailbox. Reading recruitment messages requires separate run consent; draft creation requires its own checks. Use Disconnect Gmail to stop future connection use.',
    ],
    notes: ['Cloud runs can continue after the page closes. Refresh records to inspect actual progress; closing the tab is not a cancel action. Recurring preparation currently uses the rules method and the same pilot allowance. Google account sign-in alone does not authorize mailbox reading. No messages or applications are sent automatically.'],
    action: { label: 'Manage my application preparation', to: '/loop' }, related: [{ label: 'Privacy choices', id: 'privacy' }, { label: 'Interrupted draft', id: 'recovery' }],
  },
  {
    id: 'second-application', category: 'Free CV check', title: 'Prepare another application without retyping your CV',
    summary: 'Keep useful experience; give every new vacancy its own comparison, review and approval.',
    steps: [
      'In the free check, download or privately save the open approved check before replacing it. Under Your next application, choose CV version for another vacancy: Reviewed source CV or Approved final CV.',
      'Select Use this CV for another vacancy. Enter the new Target role, Company (optional) and Vacancy description together. Open Inspect or edit the reused CV when you need to check or change its text, then select Check this next vacancy. The previous vacancy, findings and approval do not carry over.',
      'Work through The evidence, Your review and Approve & download for the new job. You must approve the current version again before downloading.',
      'In Job Loop, use your saved career record and unchanged confirmed facts. Open Opportunities and add the next real vacancy, then return to Today to prepare and Outputs to review its separate document. Do not repeat unchanged fact entry.',
      'After you actually submit on the employer’s site, update Application status in Opportunities. Confirm that you report the status yourself, add a Follow-up date and My application notes if useful, and select Save tracking update.',
    ],
    notes: ['Use Undo new application to restore the previous source CV, vacancy and final edits while this page stays open. Leaving or refreshing loses this undo. Restoring returns to review and clears approval; confirm accuracy and privacy again. Saved checks stay unchanged.', 'Saved or prepared does not mean applied. Jobvance does not submit an employer application. Interview, offer, rejected and withdrawn are also your reported statuses, not independently verified outcomes.'],
    action: { label: 'Continue in the free check', to: '/check' }, related: [{ label: 'Remove private source lines', id: 'source-line-removal' }, { label: 'Job Loop start', id: 'job-loop-start' }],
  },
  {
    id: 'privacy', category: 'Privacy & recovery', title: 'Choose what is stored, shared or connected',
    summary: 'Reading a local file, saving an account record, temporary recovery and third-party processing are separate choices.',
    steps: [
      'Before continuing, remove confidential figures, unnecessary personal details and material you lack permission to share from the CV text. Remove the wording from the original CV text; setting an exclusion preference alone leaves it in place.',
      'Use the free check on your device without signing in. To save later, read Exactly what will be saved: role, company, vacancy, reviewed source CV, approved final CV and review metadata. Confirm private saving, then select Save approved check to my account.',
      'In Job Loop, confirm private account saving for your career record. Confirm external-use permission for each fact separately. A chosen external-model run can use only approved fact wording, its context and the vacancy text. The original CV text, name and contact line are left out of that model request.',
      'Choose Draft recovery (optional) separately if you need refresh recovery in the free check. Google sign-in also asks separately to keep the CV and vacancy in the tab while you leave the page. Both temporary storage choices use a 30-minute expiry.',
      'For Job Loop support or account erasure, open Help & privacy. For a saved free check, use Delete in Your saved free checks and review the deletion confirmation. Downloaded files remain on your device.',
    ],
    notes: ['Anyone using your browser tab may see a temporarily retained draft. Confirm a returned Gmail mailbox and its permissions yourself. Disconnecting Gmail does not delete drafts already created there. Read the privacy policy for the full service policy.'],
    action: { label: 'Read the privacy policy', to: '/privacy' }, related: [{ label: 'Remove private source lines', id: 'source-line-removal' }, { label: 'Recovery and limits', id: 'recovery' }],
  },
  {
    id: 'recovery', category: 'Privacy & recovery', title: 'Recover a draft or an interrupted check safely',
    summary: 'Page navigation, refresh and account saving have different recovery limits. Restored drafts must be read and approved again.',
    steps: [
      'If you followed a help link from the free check, return to /check in the same tab within 30 minutes. The working text can return from tab memory. Read the restored draft; previous approval is cleared.',
      'If you need the free-check draft after refresh, open Draft recovery (optional) and check Keep my draft in this tab across refresh before refreshing. This stores the CV and vacancy in the tab for 30 minutes after your last change. Closing the tab or clearing the draft removes this temporary copy.',
      'For Google sign-in from the free check, check Keep my CV and job description in this tab while I sign in with Google before leaving. Return in the same tab within 30 minutes. The temporary sign-in copy is cleared on return and you approve again.',
      'In Job Loop, unsaved career record, fact and new-vacancy drafts remain only in this tab’s memory for up to 30 minutes across page navigation. Refresh, closing the tab or changing accounts clears them. Recovered confirmations for facts and contact details are reset; read and confirm them again.',
      'Saved account records are separate from temporary drafts. Sign in to the same account, reopen a saved check or use Refresh records in Job Loop. A cloud run may still be progressing even when local edits are gone.',
      'If recovery has expired or the browser cannot retain the draft, paste your source again or open your saved account version. Clear & start again, followed by Clear current check, removes the open free check and its temporary sign-in draft. Use Contact if a repeatable service problem remains.',
    ],
    notes: ['Temporary memory is a convenience, not a backup. Reading, saving and approval controls still apply after recovery. Avoid putting private CV text into a support message unless it is needed and safe to share.', 'Leaving Job Loop stops an in-flight document preview or download. A cloud preparation run can still continue; use its separate Cancel run control when available and refresh to confirm the run state.'],
    action: { label: 'Return to the free check', to: '/check' }, related: [{ label: 'Interrupted document transfer', id: 'job-loop-review' }, { label: 'Privacy choices', id: 'privacy' }, { label: 'Run availability and recovery', id: 'job-loop-controls' }],
  },
];

export function searchHelpTopics(query: string, category: HelpCategory | 'All topics' = 'All topics'): HelpTopic[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const normalized=query.toLowerCase().trim();
  const matches=helpTopics.filter(topic => {
    if (category !== 'All topics' && topic.category !== category) return false;
    const text = [topic.id.replace(/-/g, ' '), topic.title, topic.summary, topic.category, ...topic.steps, ...topic.notes, ...(topic.fields ?? []).flatMap(field => [field.label, field.help])].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
  if(!normalized)return matches;
  const rank=(topic:HelpTopic)=>(topic.id.replace(/-/g,' ').includes(normalized)?100:0)+(topic.title.toLowerCase().includes(normalized)?80:0)+words.filter(word=>topic.title.toLowerCase().includes(word)).length*4+words.filter(word=>topic.summary.toLowerCase().includes(word)).length;
  return matches.sort((a,b)=>rank(b)-rank(a));
}

export default function HelpCenter() {
  const meta=staticPageMeta('/help')!;
  const searchId = useId();
  const route = useLocation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpCategory | 'All topics'>('All topics');
  const topics = useMemo(() => searchHelpTopics(query, category), [query, category]);
  function reset() { setQuery(''); setCategory('All topics'); }
  useEffect(() => {
    const id = route.hash.slice(1);
    if (!helpTopics.some(topic => topic.id === id)) return;
    setQuery(''); setCategory('All topics');
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start' }), 0);
    return () => clearTimeout(timer);
  }, [route.hash]);
  return <main className="help-center">
    <Helmet><title>{meta.title}</title><meta name="description" content={meta.description} /><link rel="canonical" href="https://jobvance.io/help" /></Helmet>
    <nav className="hc-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Help center</span></nav>
    <header className="hc-hero"><p className="hc-eyebrow"><BookOpen size={16} aria-hidden="true" /> HELP AT THE NEXT STEP</p><h1>What would you like to get done?</h1><p>Find the next click, understand a field, or get back to your draft. You can read every guide here without an account. Sign in when you want to save and reuse your work.</p><Link className="hc-text-link" to="/walkthroughs">Try an interactive walkthrough <ArrowRight size={16} aria-hidden="true" /></Link></header>
    <section className="hc-start" aria-label="Choose a starting task">
      <a href="#first-check" onClick={reset}><FileText size={22} aria-hidden="true" /><strong>Check your CV against a job</strong><span>Start with the free check.</span><ArrowRight size={16} aria-hidden="true" /></a>
      <a href="#job-loop-start" onClick={reset}><ClipboardList size={22} aria-hidden="true" /><strong>Save experience for your next application</strong><span>Set up your Job Loop record.</span><ArrowRight size={16} aria-hidden="true" /></a>
      <a href="#recovery" onClick={reset}><BookOpen size={22} aria-hidden="true" /><strong>Pick up where you left off</strong><span>Find an interrupted draft.</span><ArrowRight size={16} aria-hidden="true" /></a>
    </section>
    <section className="hc-filters" aria-label="Find help"><label htmlFor={searchId}>Search help topics</label><div className="hc-search"><Search size={19} aria-hidden="true" /><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try PDF, MBA projects, another vacancy…" /></div><div className="hc-categories" aria-label="Help categories">{(['All topics', 'Free CV check', 'Job Loop', 'Privacy & recovery'] as const).map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    <div className="hc-results"><p role="status">{topics.length} {topics.length === 1 ? 'topic' : 'topics'}{query || category !== 'All topics' ? ' match your choices' : ' to help you move forward'}</p>{(query || category !== 'All topics') && <button type="button" onClick={reset}>Show all topics</button>}</div>
    <div className="hc-reading-layout"><aside className="hc-contents"><nav aria-label="Help topics on this page"><h2>Go to a task</h2><ol>{topics.map(topic => <li key={topic.id}><a href={`#${topic.id}`}>{topic.title}</a></li>)}</ol><Link to="/job-loop">How Job Loop works</Link><Link to="/guides">Career guide library</Link></nav></aside><div className="hc-topic-list">
      {topics.length ? topics.map(topic => <section id={topic.id} className="hc-topic" key={topic.id} aria-labelledby={`hc-${topic.id}`}>
        <p className="hc-eyebrow">{topic.category}</p>
        <h2 id={`hc-${topic.id}`}>{topic.title}</h2>
        <p className="hc-topic-summary">{topic.summary}</p>
        <ol className="hc-steps">{topic.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        {topic.fields && <dl className="hc-field-help">{topic.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.help}</dd></div>)}</dl>}
        <div className="hc-note">{topic.notes.map(note => <p key={note}>{note}</p>)}</div>
        <div className="hc-topic-action"><Link className="hc-button" to={topic.action.to}>{topic.action.label}<ArrowRight size={16} aria-hidden="true" /></Link></div>
        {topic.related && <p className="hc-related">Related help: {topic.related.map((related, index) => <span key={related.id}>{index > 0 && ' · '}<Link to={`/help#${related.id}`} onClick={reset}>{related.label}</Link></span>)}</p>}
      </section>) : <section className="hc-empty">
        <h2>No matching help topic yet.</h2>
        <p>Try a shorter phrase such as “PDF” or “facts”, or show all topics. You can also ask for help with the step you are on.</p>
        <button className="hc-button" type="button" onClick={reset}>Show all topics</button>
        <Link to="/contact">Contact Jobvance</Link>
      </section>}
    </div></div>
    <section className="hc-further"><div><p className="hc-eyebrow">KEEP MOVING</p><h2>Still need a hand?</h2><p>Tell us which step you reached and the message you saw. Leave confidential CV details out of your request.</p></div><div><Link className="hc-button hc-button--primary" to="/contact">Contact Jobvance<ArrowRight size={16} aria-hidden="true" /></Link><Link to="/guides">Read the career guides</Link></div></section>
  </main>;
}
