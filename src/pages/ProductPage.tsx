import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ArrowUpRight, BookOpen, Briefcase, Check, CheckCircle2, CircleHelp, Download, FileText, GraduationCap, LockKeyhole, Plus, ShieldCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import "./ProductPage.css";
import "./ProductRefresh.css";
import SubscriptionPricing from "./SubscriptionPricing";
import GuestSupport from "./GuestSupport";
import './JobLoop.css';
import { currentOffer } from '@/lib/current-offer';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';

type Kind = "home" | "pricing" | "how" | "faq" | "about" | "contact" | "privacy" | "terms" | "refund" | "help" | "notfound";
const titles: Record<Kind, string> = {
  home: "Prepare a CV for each job without starting over", pricing: "Free to start. Passes when you need more.", how: "How to prepare your first application", faq: "Questions about using Jobvance", about: "Why we built Jobvance", contact: "Get help with Jobvance", privacy: "Privacy", terms: "Terms of use", refund: "Refunds and failed tasks", help: "Using your workspace", notfound: "We couldn’t find that page",
};
const labels: Record<Kind, string> = { home: "Jobvance", pricing: "Access & pricing", how: "How it works", faq: "Questions & answers", about: "About Jobvance", contact: "Contact", privacy: "Your information", terms: "The details", refund: "Refunds", help: "Help with your application", notfound: "Page not found" };
const intros: Partial<Record<Kind, string>> = {
  pricing: currentOffer.statement,
  how: "Start with one CV and a real job description. Review the comparison, make your edits and download the version you approve.",
  faq: "What the check does, what stays private, and what happens next.",
  about: "Applying for another role shouldn’t mean rebuilding your experience from scratch.",
  contact: "For questions about your documents, your account or service access.",
  privacy: "How the free check, your saved documents, payments and the optional cloud Job Loop handle your information.",
  terms: "Read these alongside the CV you review and the application you choose to submit.",
  refund: "Our 7-day money-back promise for passes, and how failed requests are handled.",
  help: "Keep your source, vacancy and approved version together. Take the next step when you are ready.",
  notfound: "The address does not match an available page. Your next application can start here.",
};
const steps = [
  { title: "Add your CV and the job", text: "Upload or paste your CV, then paste the job description. We read the job title from the ad." },
  { title: "Check the changes", text: "Jobvance rewords and reorders what is already in your CV for this job. Each change shows the line it came from; keep your original wherever you prefer." },
  { title: "Download", text: "Tick to confirm it is accurate, then download a formatted PDF or Word file for free. Sign in only if you want to save it." },
];
const faqs = [
  ["Can I check my CV without signing up?", "Yes. Check your CV and download the version you approve, all for free. Sign in only if you want to save it privately. No purchase is required."],
  ["Does a finding mean I meet a requirement?", "No. Matching words are a starting point. Read the requirement and the CV example yourself; the check cannot confirm your qualifications or predict what an employer will decide."],
  ["Does Jobvance apply for me?", "You submit on the employer’s site. The tracker records the progress you report. Opening a link does not count as a submission."],
  ["Does Jobvance rewrite my CV?", "It rewords and reorders what is already in your CV so it reads well for the job, and adds a short profile built only from your own lines. It never adds employers, numbers, tools or qualifications you have not listed, and it asks you about gaps instead of filling them. You check every change before downloading."],
  ["Can I download my documents?", "Your approved CV can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded."],
  ["Which files can I upload?", "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format."],
  ["What does Jobvance cost?", `${currentOffer.statement} Signed in, you get 3 AI-tailored CVs each month; without an account, 1 a day. For more, a one-time pass gives you Sprint: 25 tailored CVs over 7 days for $9, Job Search: 100 over 30 days for $19, or Career Move: 300 over 90 days for $39. ${currentOffer.passes}`],
  ["Are interviews or jobs guaranteed?", "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control."],
  ["Can I use projects or internships in my CV?", "Yes. Your reviewed CV can include clearly labelled academic projects, internships, activities and previous employment. Describe your own contribution accurately. Project work is not automatically evidence of required professional experience."],
  ["How does the cloud Job Loop work?", "Sign in, save your career record, confirm the facts you can share and add real vacancies. Prepare separate CVs and drafts. Review and approve each document before downloading. Search, model and inbox connections depend on operator setup; the workspace shows which are available. You send messages and submit applications yourself."],
];

type Audience = "student" | "mba" | "switcher";
const audienceExamples = {
  student: {
    label: "Project experience", landingPath: "/for-students", loopPath: "/loop?audience=student", checkPath: "/check?audience=student", icon: GraduationCap, cardTitle: "Make your projects count", cardText: "Find the coursework, internships and projects worth including for your first job. Show what you did, even before you’ve had a full-time role.", cta: "Check my student CV",
    intro: "Classes and applications compete for your time. Bring a CV built from projects, internships and activities, plus one vacancy. Review its wording and download the version you approve.",
    role: "Graduate data analyst", firstVacancy: "Develop Python reports.", firstCv: "Developed Python reports for a university project.", firstSource: "ACADEMIC PROJECT",
    secondVacancy: "Lead Python reporting.", secondCv: "Assisted in leading Python reporting during an internship.", secondSource: "INTERNSHIP CONTRIBUTION",
    question: "Which work was your own contribution, and which work did you support?", caveat: "Academic project work does not establish a requirement for professional experience.",
    originalFirst: "Coordinated university project meetings.", originalSecond: "Developed Python reports for a university project.", tailoredSecond: "Developed Python reporting for a university data project.", orderFocus: "Graduate reporting role in focus",
  },
  mba: {
    label: "Career change", landingPath: "/for-mba", loopPath: "/loop?audience=mba", checkPath: "/check?audience=mba", icon: BookOpen, cardTitle: "Connect your MBA to the role", cardText: "Bring your earlier work and MBA projects together. Explain your own contribution when you’re applying to a different function or industry.", cta: "Check my MBA CV",
    intro: "Coursework, recruiting and career decisions fill the week. Bring your previous work and MBA projects together for one vacancy. Check your contribution, review the gaps and approve your CV.",
    role: "Business analyst", firstVacancy: "Produce stakeholder reports.", firstCv: "Prepared stakeholder reports in a prior analyst role.", firstSource: "PRIOR EMPLOYMENT",
    secondVacancy: "Manage market research projects.", secondCv: "Supported a market research project during my MBA.", secondSource: "MBA TEAM PROJECT",
    question: "What did you personally do in the MBA team project?", caveat: "MBA team-project support does not establish project-management ownership.",
    originalFirst: "Coordinated interviews for an MBA team project.", originalSecond: "Prepared a market research summary for an MBA team project.", tailoredSecond: "Prepared the market research summary for an MBA team project, as part of the team.", orderFocus: "Market research role in focus",
  },
  switcher: {
    label: "Work experience", landingPath: "/for-career-switchers", loopPath: "/loop?audience=professional", checkPath: "/check?audience=professional", icon: Briefcase, cardTitle: "Fit applications around work", cardText: "Reuse experience from your working life for a role at a new employer or a change of direction. Keep your CV versions and follow-ups together.", cta: "Check my career-switch CV",
    intro: "Your working day is already full. Start with one vacancy and the experience you can substantiate. Review what transfers, clarify what you supported, and keep an approved version for your next application.",
    role: "Operations analyst", firstVacancy: "Produce stakeholder reports.", firstCv: "Prepared stakeholder reports.", firstSource: "EMPLOYMENT EXPERIENCE",
    secondVacancy: "Lead stakeholder reporting.", secondCv: "Assisted in leading stakeholder reporting.", secondSource: "SUPPORTING CONTRIBUTION",
    question: "Did you lead this work, or support someone who did?", caveat: "Supporting work is not promoted into a claim of leading or owning it.",
    originalFirst: "Coordinated team meeting schedules.", originalSecond: "Prepared monthly management reports.", tailoredSecond: "Prepared monthly management reporting for senior stakeholders.", orderFocus: "Reporting role in focus",
  },
} as const;
const audiences: Audience[] = ["student", "mba", "switcher"];
const fullLoopSteps = [
  { title: "Your profile", text: "Build and confirm reusable career facts." },
  { title: "Priorities", text: "Keep deadlines and any connected reply updates visible." },
  { title: "Search & shortlist", text: "Find roles and check their sources." },
  { title: "CVs & drafts", text: "Prepare a CV and message drafts per role." },
  { title: "Review & apply", text: "You approve, send and apply." },
  { title: "Next actions", text: "Keep deadlines and follow-ups together." },
];

function StartLink({ children = "Check my CV for free", light = false, to = "/check" }: { children?: React.ReactNode; light?: boolean; to?: string }) {
  return <Link to={to} className={`product-button${light ? " product-button--light" : ""}`}>{children}<ArrowRight size={18} aria-hidden="true" /></Link>;
}

function EvidencePreview({ audience }: { audience: Audience }) {
  const example = audienceExamples[audience];
  return <figure id="home-audience-example" className="product-preview" aria-labelledby="product-preview-caption">
    <div className="product-preview-label"><span className="product-live-dot" aria-hidden="true" />A CV check in practice <span>Example application</span></div>
    <div className="product-preview-window">
      <div className="product-preview-bar"><span className="product-preview-logo" aria-hidden="true">jv</span><span>CV check / Evidence review</span><span className="product-preview-step">04 / 06</span></div>
      <div className="product-preview-body">
        <div className="product-preview-role"><div><span className="product-micro">ROLE IN FOCUS</span><h2>{example.role}</h2><p>{example.label} · CV review</p></div><FileText size={24} aria-hidden="true" /></div>
        <div className="product-evidence-pair">
          <div className="product-passage"><span className="product-micro">THE VACANCY SAYS</span><p>“{example.firstVacancy}”</p></div>
          <div className="product-passage product-passage--cv"><span className="product-micro">YOUR CV SAYS · {example.firstSource}</span><p>“{example.firstCv}”</p><span className="product-status product-status--direct"><CheckCircle2 size={13} aria-hidden="true" />Direct wording found</span></div>
        </div>
        <div className="product-evidence-pair product-evidence-pair--second">
          <div className="product-passage"><span className="product-micro">THE VACANCY SAYS</span><p>“{example.secondVacancy}”</p></div>
          <div className="product-passage product-passage--cv"><span className="product-micro">YOUR CV SAYS · {example.secondSource}</span><p>“{example.secondCv}”</p><span className="product-status product-status--review"><CircleHelp size={13} aria-hidden="true" />Related passage—review needed</span></div>
        </div>
        <div className="product-preview-question"><CircleHelp size={17} aria-hidden="true" /><p>{example.question}</p></div>
        <div className="product-preview-bottom"><span>You review the wording before downloading.</span><span><LockKeyhole size={12} aria-hidden="true" />Your review</span></div>
      </div>
    </div>
    <figcaption id="product-preview-caption">See how the requirement compares with the CV passage. {example.caveat}</figcaption>
  </figure>;
}

function StepList({ compact = false }: { compact?: boolean }) {
  return <ol className={`product-steps${compact ? " product-steps--compact" : ""}`}>{steps.map((step, index) => <li key={step.title}><span className="product-step-number" aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div>{index === 5 && <Download size={21} aria-hidden="true" />}</li>)}</ol>;
}

function HomePage() {
  const [audience, setAudience] = useState<Audience>("switcher");
  const example = audienceExamples[audience];
  return <>
    <section className="product-hero product-shell">
      <div className="product-hero-copy">
        <p className="product-eyebrow"><span aria-hidden="true" />YOUR CV + THE JOB YOU WANT</p>
        <h1>A tailored CV for every job, <span>built only from what you’ve really done.</span></h1>
        <p className="product-hero-intro">Paste your CV and the job. In about a minute you get a version written for that role, with every change traced back to your original CV. Edit anything, then download.</p>
        <div className="product-actions"><StartLink to="/check">Tailor my CV for a job</StartLink></div>
        <p className="product-hero-note"><Check size={15} aria-hidden="true" />{currentOffer.statement}</p>
        <div className="product-hero-route" aria-label="How the free check works"><span><FileText size={15} aria-hidden="true" />CV + vacancy</span><ArrowRight size={14} aria-hidden="true" /><span>Review</span><ArrowRight size={14} aria-hidden="true" /><span><Download size={15} aria-hidden="true" />Download</span></div>
        
      </div>
      <div className="product-hero-art">
        <div className="product-audience-picker"><p id="home-audience-label">Compare examples</p><div role="group" aria-labelledby="home-audience-label" className="product-audience-buttons">{audiences.map(choice => { const option = audienceExamples[choice], Icon = option.icon; return <button key={choice} type="button" aria-pressed={audience === choice} aria-controls="home-audience-example" aria-label={option.label} onClick={() => setAudience(choice)}><Icon size={15} aria-hidden="true" /><span className="product-choice-full">{option.label}</span><span className="product-choice-short" aria-hidden="true">{choice === 'student' ? 'Projects' : choice === 'mba' ? 'Career change' : 'Work'}</span></button>; })}</div></div>
        <EvidencePreview audience={audience} />
        <p className="sr-only" role="status">{example.label} example application selected. This changes the example only; everyone starts with the same CV check.</p>
      </div>
    </section>
    <div className="product-assurances product-shell" aria-label="Included in your free check"><span><FileText size={18} aria-hidden="true" />Your CV beside the actual requirements</span><span><ShieldCheck size={18} aria-hidden="true" />Every change traced to your CV</span><span><Download size={18} aria-hidden="true" />PDF, Word and text downloads</span></div>
    <section id="example" className="product-evidence-section product-shell">
      <div className="product-section-copy"><p className="product-eyebrow">WHY START WITH THE VACANCY?</p><h2>Give your strongest relevant work a better place on the page.</h2><p>If a role needs reporting skills, don’t bury your reporting experience below something less relevant. Jobvance compares the vacancy with your original CV so you can decide what to bring forward.</p><p>If the evidence is missing, you’ll see the gap. Add an example only if you’ve actually done the work.</p><Link to="/how-it-works" className="product-text-link">See how the comparison works<ArrowRight size={17} aria-hidden="true" /></Link></div>
      <div className="product-order-demo"><div className="product-order-heading"><span>WHAT A SMALL CHANGE CAN DO</span><span className="product-demo-tag">Before &amp; after</span></div><div className="product-order-sheet"><span className="product-micro">BEFORE · RELEVANT WORK IS BURIED</span><ol><li>{example.originalFirst}</li><li>{example.originalSecond}</li></ol></div><div className="product-order-transition"><ArrowRight size={21} aria-hidden="true" /><span>{example.orderFocus}</span></div><div className="product-order-sheet product-order-sheet--after"><span className="product-micro">AFTER · REWORDED FOR THE JOB, MOST RELEVANT FIRST</span><ol><li><mark>{example.tailoredSecond}</mark></li><li>{example.originalFirst}</li></ol></div><p className="product-demo-note">Same facts, wording closer to the job, a better order. You see your original beside every change. Example application, not a hiring result.</p></div>
    </section>
    <section className="product-loop-feature" aria-labelledby="product-loop-title"><div className="product-shell product-loop-feature-grid">
      <div><p className="product-eyebrow">WHEN YOU’RE APPLYING TO MORE THAN ONE ROLE</p><h2 id="product-loop-title">Your next application shouldn’t send you back to square one.</h2><p>Job Loop keeps confirmed experience, vacancies and follow-ups in a private workspace. Start with your CV or choose a saved CV check. Review the experience and vacancy you want to reuse before saving them.</p><Link to="/job-loop" className="product-text-link">Find out how Job Loop works<ArrowUpRight size={18} aria-hidden="true" /></Link><span className="product-loop-free">Free pilot · Review what you reuse</span></div>
      <div className="product-loop-board"><div className="product-loop-board-top"><RefreshCw size={20} aria-hidden="true" /><span>YOUR SAVED EXPERIENCE</span><span>Use again</span></div><p className="product-loop-board-fact">The work you’ve done.<br />Ready for the next vacancy.</p><div className="product-loop-board-branches" aria-hidden="true"><span /><span /></div><div className="product-loop-board-jobs"><article><FileText size={20} aria-hidden="true" /><h3>A CV for each role</h3><p>Review the relevant facts and wording before you download.</p></article><article><CheckCircle2 size={20} aria-hidden="true" /><h3>A place for the follow-up</h3><p>Keep the next action and application status with the role.</p></article></div><p className="product-loop-board-note">Workflow illustration. You approve documents and submit applications yourself.</p></div>
    </div></section>
    <section className="product-audience-section product-shell" aria-labelledby="product-audience-title"><div className="product-section-heading"><div><p className="product-eyebrow">ONE CHECK, WHATEVER YOUR NEXT MOVE</p><h2 id="product-audience-title">Start with the experience you have.</h2></div><p>Projects, internships, MBA work or years in a job can all belong in your CV. Bring the version you have and a vacancy you want. There is no separate student or professional setup to choose.</p></div></section>
    <section className="product-get-started product-shell" aria-labelledby="product-get-started-title"><div><p className="product-eyebrow">WHAT YOU NEED TO START</p><h2 id="product-get-started-title">Have your CV and one job description handy.</h2><p>Three steps: add your CV and the job, check the changes, download. You can paste your CV or upload a readable PDF, Word or text file.</p><div className="product-actions"><StartLink to="/check">Tailor my CV for a job</StartLink><Link to="/how-it-works" className="product-text-link">See how it works<ArrowRight size={17} aria-hidden="true" /></Link></div></div><div className="product-privacy-summary"><LockKeyhole size={24} aria-hidden="true" /><h3>Try it before you sign up.</h3><p>Your free check runs on your device. Sign in when you want to save an approved version privately.</p><Link to="/privacy" className="product-text-link">How your CV is handled<ArrowUpRight size={16} aria-hidden="true" /></Link></div></section>
    <section className="product-final-section"><div className="product-shell"><p className="product-eyebrow">FOUND A ROLE YOU WANT?</p><h2>Let’s get your CV ready for it.</h2><div className="product-final-actions"><StartLink light to="/check">Tailor my CV for this job</StartLink><span>Free to start. Passes from $9.<br />You check every change.</span></div><span className="product-final-arrow" aria-hidden="true">↗</span></div></section>
  </>;
}

function LegalContent({ kind }: { kind: "privacy" | "terms" | "refund" }) {
  if (kind === "privacy") return <div className="product-prose">
    <h2>Your free check</h2><p>The free CV check reads your file on your device; the original file is never uploaded. Comparing without AI runs entirely on your device. If you choose “Tailor my CV for this job”, the text of your CV and the job description is sent to our AI provider (OpenRouter, with model providers’ data collection declined) to prepare one tailored version. Jobvance does not store that text unless you save the check; we keep only a cost record, which also counts your free and pass allowance, and, for visitors without an account, a keyed hash of the network address to apply daily limits, deleted after 90 days. Unsaved drafts can be recovered during in-app navigation from this tab’s memory for up to 30 minutes after your last change. Without optional tab-storage permission, refreshing or closing the tab clears the draft. It does not send check data to advertising tools.</p>
    <h2>Optional refresh recovery</h2><p>Choosing “Keep my draft in this tab across refresh” allows your CV and vacancy texts to be stored temporarily in this browser tab. They are eligible for restoration for 30 minutes after your last change; an expired stored copy is removed when next read. Anyone using the same browser tab may access this copy. Turning off the option, clearing the check or changing accounts removes it; closing the tab also removes tab storage. Restoring a draft clears its approval, so review and approve again. This permission does not save the check to your account.</p>
    <h2>Choosing account saving</h2><p>If you explicitly choose account saving, the role, company, vacancy, reviewed source CV and approved final CV texts are stored privately in your existing Supabase account. The exact save payload is shown before saving. Saved free checks can be deleted in the check page; deletion does not remove files you already downloaded.</p>
    <h2>Signing in with an unsaved check</h2><p>Google sign-in can retain an unsaved check in this browser tab only after specific consent. A retained draft is eligible for restoration for 30 minutes and cleared on return or when you clear the check; closing the tab also removes tab storage. An expired draft is discarded when next read. This temporary storage is accessible to someone using the same browser tab. Email sign-in can keep the check in memory without this handoff.</p>
    <h2>Your existing workspace</h2><p>Your account, uploaded CV, extracted text, application documents and tracker entries are processed to provide this service. Supabase supplies authentication, database and private file storage.</p>
    <h2>Payments</h2><p>Passes are sold through Dodo Payments, which acts as our merchant of record and payment processor. When you buy a pass, Dodo Payments collects your payment details, email address and billing location to take the payment, calculate sales tax, prevent fraud and send your invoice, under its own privacy policy. Jobvance never receives your full card number. Dodo Payments tells us the payment status, amount, tax and a payment reference so we can add or remove your pass. We keep these billing records for as long as accounting and tax rules require.</p>
    <h2>Support information</h2><p>Public support needs no account, name or email. Your message is stored privately for up to 90 days for manual administration review. A random private receipt code lets its holder read the status and any reply; keep it private and download it if you need to return. The code is never included in a page URL. Requests are removed by daily maintenance after expiry. An irreversible hash of a limited network identifier is used to limit new requests; raw IP addresses are not stored in the support table. Support messages are not sent to models and this form does not send email.</p>
    <h2>Deleting information</h2><p>You can delete an original CV or a tracker entry in your workspace. Original deletion does not remove separately saved application packs. Use Help & privacy in your Job Loop to erase its career record, generated documents, schedule and mailbox connection. Your sign-in account and separately saved workspace CVs remain. Minimal security and usage records remain to prevent old requests restoring deleted work and to retain committed spending; these records do not contain your CV text or document files. Record an account-wide or privacy request there or on the contact page; its receipt is visible and does not imply review. Necessary financial records may require retention.</p>
    <h2>Your cloud Job Loop</h2><p>Saving a career record is an explicit choice. Its source text, target preferences, confirmed facts, vacancies, run reports and prepared documents are stored in your private Supabase account. Unsaved career record, claim and new-vacancy edits can be recovered during in-app navigation from this tab’s memory for up to thirty minutes. They are not written to browser storage, and refresh, closing the tab, sign-out or switching accounts clears them. Sharing and factual confirmations need review again after recovery. Runs use a saved version of your record. A correction or withdrawal requires a new review before a packet can be downloaded again; it cannot recall a file already downloaded.</p>
    <h2>Optional models and search</h2><p>The free CV check and existing preparation packs do not call external AI. In the cloud loop, you can choose the available rules mode or consent to the selected Claude, OpenAI or Kimi provider for that run. A model labelled “via OpenRouter” sends the cleared input through OpenRouter to that named model provider, under a separate per-run processing choice. The available route is displayed before consent; changing the route requires renewed review. The model receives confirmed facts you marked shareable and vacancy text, rather than the entire raw source CV. Job search queries use target roles and locations. Availability depends on the configured accounts. Remove confidential or unnecessary sensitive information before saving or sharing.</p>
    <h2>Optional inbox access</h2><p>Signing in with Google does not connect your inbox. Connecting Gmail requires a separate Google permission screen. When configured, the loop can read relevant job-search messages and store selected summaries. Draft access is optional; creating a draft requires your approval of its recipient and attachment. Jobvance has no email-send or application-submit action. Disconnecting removes its stored connection credentials; it does not delete messages or drafts already in Gmail. Google permissions can also be revoked in your Google account.</p>
    <h2>Document access</h2><p>Approved documents are retained for your access after pack expiry. Public walkthroughs use example CVs and vacancies, not candidate records. <Link to="/contact">Contact and service availability</Link>.</p>
  </div>;
  if (kind === "terms") return <div className="product-prose">
    <h2>The free check</h2><p>The six-step check and its reviewed downloads are free and do not use preparation-pack credits. Evidence findings are comparisons of supplied English text. They do not verify qualifications, establish eligibility or predict screening results.</p>
    <h2>The information you provide</h2><p>Provide information you have the right to use. Check and approve the wording before downloading or submitting. Do not invent qualifications, experience or achievements.</p>
    <h2>Free access</h2><p>{currentOffer.statement} Signed in, you get 3 AI-tailored CVs each calendar month (UTC); without an account, 1 a day. Compare without AI, editing, downloads and the applications tracker stay free. Job Loop is a free pilot; its cloud preparation is limited to ten accounts and available processing capacity.</p>
    <h2>Passes</h2><p>A pass is a one-time purchase in US dollars: Sprint ($9, 7 days, 25 AI-tailored CVs), Job Search ($19, 30 days, 100) or Career Move ($39, 90 days, 300). It starts when the payment is confirmed and ends when its days run out; tailored CVs left at the end do not carry over. If you buy another pass while one is active, its tailored CVs are added and its days start when the current pass ends. The pass that ends soonest is used first. For fair use, any account can tailor up to 40 CVs a day. A tailored CV counts when the AI prepares a version; a request that fails before any AI work does not count. Nothing renews and there is no subscription.</p>
    <h2>Payment and refunds</h2><p>Dodo Payments sells passes as our merchant of record and handles payment, sales tax and invoices. Passes come with a 7-day money-back promise if you have used fewer than 5 tailored CVs; see <Link to="/refund">refunds</Link>. A refunded pass stops working.</p>
    <h2>Application preparation and tracking</h2><p>Jobvance provides application preparation and tracking. It does not promise interviews, employment, recruiter access or automated submission. Employer decisions are outside the service’s control.</p>
    <h2>Cloud loop availability</h2><p>The pilot is free and subject to run limits and service availability. The rules mode uses confirmed facts. External models, search and inbox access require their respective configuration and consent. Reports identify unavailable or incomplete stages. A relevance score explains this tool’s comparison; it is not an ATS score or a prediction of hiring. Recurring preparation requires your explicit opt-in and a configured scheduler. The workspace reports the actual next run and execution history. Pause a schedule to stop future scheduling while retaining the current run. Cancel schedule also stops its latest queued or running scheduled job. A separate manual run has its own cancellation control.</p>
    <h2>Current availability</h2><p>These product terms describe the current workflow. Passes go on sale when checkout opens; until then the Pricing page says so and nothing is charged.</p>
  </div>;
  return <div className="product-prose">
    <h2>7-day money-back promise</h2><p>If a pass is not right for you, ask for a refund within 7 days of buying it. If you have used fewer than 5 tailored CVs from that pass, we refund it in full. Ask through the <Link to="/contact">contact page</Link> with your Dodo Payments receipt reference.</p>
    <h2>What a refund does</h2><p>Refunds are paid back to your original payment method by Dodo Payments, our merchant of record. A refunded pass stops working straight away, including any tailored CVs left on it, and this also applies to a partial refund. Documents you already downloaded stay yours.</p>
    <h2>Failed requests</h2><p>An AI tailoring request that fails before any AI work is done does not use a tailored CV. A failed request that does not save a usable pack does not use a pack credit. Previously approved documents can be downloaded again at no cost. If you think something was counted wrongly, contact us.</p>
    <h2>Incorrect or duplicate charges</h2><p>For incorrect charges, duplicate purchases or a pass that does not work, contact us with your receipt reference and we will put it right. A refund of an earlier application-pack purchase removes that purchase’s unused packs. No interview or employment outcome is guaranteed, and refunds do not depend on hiring results.</p>
  </div>;
}

export default function ProductPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const start = user ? "/dashboard" : "/auth";
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  const legal = kind === "privacy" || kind === "terms" || kind === "refund";
  const path = kind === 'home' ? '/' : kind === 'how' ? '/how-it-works' : `/${kind}`;
  const meta = staticPageMeta(path);
  return <main className={`product-page product-page--${kind}`}>
    <Helmet><title>{meta?.title ?? `${titles[kind]} | Jobvance`}</title><meta name="description" content={meta?.description ?? intros[kind]} />{meta && <link rel="canonical" href={SITE_ORIGIN + meta.path} />}{meta && <meta property="og:title" content={meta.title} />}{meta && <meta property="og:description" content={meta.description} />}{meta && <meta property="og:url" content={SITE_ORIGIN + meta.path} />}<meta property="og:type" content="website" />{kind === 'notfound' && <meta name="robots" content="noindex,follow" />}</Helmet>
    {kind === "home" ? <HomePage /> : <div className="product-shell product-inner">
      <header className="product-page-heading"><p className="product-eyebrow"><Link to="/">Jobvance</Link><span aria-hidden="true">/</span>{labels[kind]}</p><h1>{titles[kind]}</h1><p className="product-page-intro">{intros[kind]}</p></header>
      {kind === "pricing" ? <SubscriptionPricing /> : <div className="product-content-layout"><article className="product-main-content">
        {(kind === "how" || kind === "help") && <><StepList compact /><div className="product-help-bottom"><StartLink>Check my CV against a job</StartLink><p>There’s no account or card needed for the check and download. You submit the application on the employer’s site.</p></div>{kind === "how" && <section className="product-how-loop"><h2>Applying to several roles? Save your work with Job Loop.</h2><p>You can reuse your chosen CV for another vacancy inside the free check. For ongoing preparation and tracking, set up Job Loop in your account by importing and confirming your experience.</p><Link className="product-text-link" to="/job-loop">See how Job Loop reuses your work<ArrowRight size={17} aria-hidden="true" /></Link></section>}</>}

        {kind === "faq" && <div className="product-faqs">{faqs.map(([question, answer], index) => <details key={question}><summary><span className="product-faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{question}</span><Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>}
        {kind === "about" && <div className="product-about"><p className="product-large-copy">Jobvance helps you prepare a CV for a job you want and keep track of what you send. You bring the experience and make the final call on the wording. Your experience stays the source of every application; employer decisions are theirs.</p><div className="product-about-principles"><span><FileText size={22} aria-hidden="true" />A visible source</span><span><CircleHelp size={22} aria-hidden="true" />Room for questions</span><span><CheckCircle2 size={22} aria-hidden="true" />Your final approval</span></div><StartLink /></div>}
        {kind === "contact" && <><GuestSupport />{support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) && <div className="product-contact-box"><a className="product-text-link" href={`mailto:${support}`}>Email Jobvance support<ArrowUpRight size={17} aria-hidden="true" /></a></div>}</>}
        {legal && <LegalContent kind={kind} />}
        {kind === "notfound" && <div className="product-notfound"><span aria-hidden="true">404<span>↗</span></span><p>The address does not match an available page. <Link to="/">Return to Jobvance</Link>.</p><StartLink /></div>}
      </article><aside className="product-aside"><span className="product-eyebrow">Your next step</span><h2>{legal ? "Questions about the details?" : "Have a vacancy in mind?"}</h2><p>{legal ? "Check service availability or read the answers to common questions." : "Bring your CV and one job description. Start without an account."}</p><Link to={legal ? "/contact" : "/check"} className="product-text-link">{legal ? "Contact & availability" : "Start a free check"}<ArrowRight size={17} aria-hidden="true" /></Link><nav aria-label="Related pages"><Link to="/faq">Questions & answers<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to={start}>Your workspace<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/privacy">Privacy<ArrowUpRight size={14} aria-hidden="true" /></Link></nav><span className="product-aside-symbol" aria-hidden="true">j↗</span></aside></div>}
    </div>}
  </main>;
}
