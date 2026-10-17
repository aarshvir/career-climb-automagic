import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleHelp, FileText, LockKeyhole, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import "./ProductPage.css";
import "./ProductRefresh.css";
import SubscriptionPricing from "./SubscriptionPricing";
import LoopJourney from "@/components/LoopJourney";
import GuestSupport from "./GuestSupport";
import './JobLoop.css';
import { currentOffer } from '@/lib/current-offer';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';

type Kind = "home" | "pricing" | "how" | "faq" | "about" | "contact" | "privacy" | "terms" | "refund" | "help" | "notfound";
const titles: Record<Kind, string> = {
  home: "Automate your job search", pricing: "Job Loop access and plans", how: "How Job Loop works", faq: "Questions about using Jobvance", about: "Why we built Jobvance", contact: "Get help with Jobvance", privacy: "Privacy", terms: "Terms of use", refund: "Refunds and failed tasks", help: "Using your workspace", notfound: "We couldn’t find that page",
};
const labels: Record<Kind, string> = { home: "Jobvance", pricing: "Access & pricing", how: "How it works", faq: "Questions & answers", about: "About Jobvance", contact: "Contact", privacy: "Your information", terms: "The details", refund: "Credits & refunds", help: "Help with your application", notfound: "Page not found" };
const intros: Partial<Record<Kind, string>> = {
  pricing: currentOffer.statement,
  how: "Add your experience, choose the roles and locations you want, then review the jobs and documents prepared in your dashboard.",
  faq: "What the check does, what stays private, and what happens next.",
  about: "Applying for another role shouldn’t mean rebuilding your experience from scratch.",
  contact: "For questions about your documents, your account or service access.",
  privacy: "How the free check, your saved documents and the optional cloud Job Loop handle your information.",
  terms: "Read these alongside the CV you review and the application you choose to submit.",
  refund: "How failed requests, pack credits and any future paid access are handled.",
  help: "Keep your source, vacancy and approved version together. Take the next step when you are ready.",
  notfound: "The address does not match an available page. Your next application can start here.",
};
const faqs = [
  ["Can I check my CV without signing up?", "Yes. Check your CV and download the version you approve, all for free. Sign in only if you want to save it privately. No purchase is required."],
  ["Does a finding mean I meet a requirement?", "No. Matching words are a starting point. Read the requirement and the CV example yourself; the check cannot confirm your qualifications or predict what an employer will decide."],
  ["Does Jobvance apply for me?", "You submit on the employer’s site. The tracker records the progress you report. Opening a link does not count as a submission."],
  ["Does Jobvance rewrite my CV?", "It rewords and reorders what is already in your CV so it reads well for the job, and adds a short profile built only from your own lines. It never adds employers, numbers, tools or qualifications you have not listed, and it asks you about gaps instead of filling them. You check every change before downloading."],
  ["Can I download my documents?", "Your approved CV can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded."],
  ["Which files can I upload?", "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format."],
  ["What does Jobvance cost?", `${currentOffer.statement} ${currentOffer.check} ${currentOffer.future}`],
  ["Are interviews or jobs guaranteed?", "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control."],
  ["Can I use projects or internships in my CV?", "Yes. Your reviewed CV can include clearly labelled academic projects, internships, activities and previous employment. Describe your own contribution accurately. Project work is not automatically evidence of required professional experience."],
  ["How does the cloud Job Loop work?", "Sign in, save your career record, confirm the facts you can share and add real vacancies. Prepare separate CVs and drafts. Review and approve each document before downloading. Search, model and inbox connections depend on operator setup; the workspace shows which are available. You send messages and submit applications yourself."],
];

function StartLink({ children = "Start my Job Loop", light = false, to = "/loop" }: { children?: React.ReactNode; light?: boolean; to?: string }) {
  return <Link to={to} className={`product-button${light ? " product-button--light" : ""}`}>{children}<ArrowRight size={18} aria-hidden="true" /></Link>;
}

function HomePage() {
  return <>
    <section className="product-shell product-loop-intro">
      <p className="product-eyebrow">JOB LOOP BY JOBVANCE</p>
      <h1>Automate your <span>job search.</span></h1>
      <p className="product-hero-intro">Tell us what you’ve done, which jobs you want and where you want to work. Job Loop searches connected sources and prepares a CV for each shortlisted role, ready to review in your dashboard.</p>
      <div className="product-actions"><StartLink /><Link className="product-text-link" to="/check">Try a free CV check <ArrowRight size={17} aria-hidden="true" /></Link></div>
      <p className="product-hero-note">Free beta · Account needed for Job Loop · No card required</p>
    </section>
    <section className="product-shell product-loop-journey" aria-labelledby="home-loop-journey"><h2 id="home-loop-journey">Set it up once. Come back to your next applications.</h2><LoopJourney /></section>
    <section className="product-shell product-get-started" aria-labelledby="loop-available-title">
      <div><p className="product-eyebrow">WHAT YOU CAN USE TODAY</p><h2 id="loop-available-title">A recurring search, with a clear result for every run.</h2><p>Use selected employer feeds or add a vacancy yourself. Scheduled runs use rules-based preparation; optional AI preparation needs your consent for each run. Your dashboard shows the jobs found, documents prepared and any step that could not finish.</p><p>Broad web search and inbox access are not currently connected. The free pilot has ten cloud places, subject to available processing capacity. Choose an available schedule in your account and pause it when you need to.</p><Link to="/job-loop" className="product-text-link">Explore Job Loop <ArrowRight size={17} aria-hidden="true" /></Link></div>
      <div className="product-privacy-summary"><LockKeyhole size={24} aria-hidden="true" /><h3>Your experience stays yours.</h3><p>Start with your CV or choose a saved CV check. Review the experience and vacancy you want to reuse before saving. You approve each document and apply on the employer’s site yourself.</p><Link to="/privacy" className="product-text-link">How your CV is handled<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </section>
    <section className="product-shell product-loop-check" aria-labelledby="home-check-title"><div><p className="product-eyebrow">HAVE ONE VACANCY IN MIND?</p><h2 id="home-check-title">Try the free CV Check first.</h2><p>Bring a CV and a job description, review suggested changes and download your approved version. No account is needed. When you want an ongoing search, save your check and continue into Job Loop.</p></div><StartLink to="/check">Check my CV against a job</StartLink></section>
    <section className="product-final-section"><div className="product-shell"><p className="product-eyebrow">YOUR NEXT ROLE</p><h2>Give your job search a routine.</h2><div className="product-final-actions"><StartLink light /><Link to="/pricing" className="product-text-link">See access and plans <ArrowRight size={17} aria-hidden="true" /></Link></div></div></section>
  </>;
}

function LegalContent({ kind }: { kind: "privacy" | "terms" | "refund" }) {
  if (kind === "privacy") return <div className="product-prose">
    <h2>Your free check</h2><p>The free CV check reads your file on your device; the original file is never uploaded. Comparing without AI runs entirely on your device. If you choose “Tailor my CV for this job”, the text of your CV and the job description is sent to our AI provider (OpenRouter, with model providers’ data collection declined) to prepare one tailored version. Jobvance does not store that text unless you save the check; we keep only a cost record and, for visitors without an account, a keyed hash of the network address to apply daily limits, deleted after 90 days. Unsaved drafts can be recovered during in-app navigation from this tab’s memory for up to 30 minutes after your last change. Without optional tab-storage permission, refreshing or closing the tab clears the draft. It does not send check data to advertising tools.</p>
    <h2>Optional refresh recovery</h2><p>Choosing “Keep my draft in this tab across refresh” allows your CV and vacancy texts to be stored temporarily in this browser tab. They are eligible for restoration for 30 minutes after your last change; an expired stored copy is removed when next read. Anyone using the same browser tab may access this copy. Turning off the option, clearing the check or changing accounts removes it; closing the tab also removes tab storage. Restoring a draft clears its approval, so review and approve again. This permission does not save the check to your account.</p>
    <h2>Choosing account saving</h2><p>If you explicitly choose account saving, the role, company, vacancy, reviewed source CV and approved final CV texts are stored privately in your existing Supabase account. The exact save payload is shown before saving. Saved free checks can be deleted in the check page; deletion does not remove files you already downloaded.</p>
    <h2>Signing in with an unsaved check</h2><p>Google sign-in can retain an unsaved check in this browser tab only after specific consent. A retained draft is eligible for restoration for 30 minutes and cleared on return or when you clear the check; closing the tab also removes tab storage. An expired draft is discarded when next read. This temporary storage is accessible to someone using the same browser tab. Email sign-in can keep the check in memory without this handoff.</p>
    <h2>Your existing workspace</h2><p>Your account, uploaded CV, extracted text, application documents and tracker entries are processed to provide this service. Supabase supplies authentication, database and private file storage. Real-money payments are currently disabled. If payment testing is enabled, the configured processor is Paddle or Stripe; Jobvance does not collect full card numbers.</p>
    <h2>Support information</h2><p>Public support needs no account, name or email. Your message is stored privately for up to 90 days for manual administration review. A random private receipt code lets its holder read the status and any reply; keep it private and download it if you need to return. The code is never included in a page URL. Requests are removed by daily maintenance after expiry. An irreversible hash of a limited network identifier is used to limit new requests; raw IP addresses are not stored in the support table. Support messages are not sent to models and this form does not send email.</p>
    <h2>Deleting information</h2><p>You can delete an original CV or a tracker entry in your workspace. Original deletion does not remove separately saved application packs. Use Help & privacy in your Job Loop to erase its career record, generated documents, schedule and mailbox connection. Your sign-in account and separately saved workspace CVs remain. Minimal security and usage records remain to prevent old requests restoring deleted work and to retain committed spending; these records do not contain your CV text or document files. Record an account-wide or privacy request there or on the contact page; its receipt is visible and does not imply review. Necessary financial records may require retention.</p>
    <h2>Your cloud Job Loop</h2><p>Saving a career record is an explicit choice. Its source text, target preferences, confirmed facts, vacancies, run reports and prepared documents are stored in your private Supabase account. Unsaved career record, claim and new-vacancy edits can be recovered during in-app navigation from this tab’s memory for up to thirty minutes. They are not written to browser storage, and refresh, closing the tab, sign-out or switching accounts clears them. Sharing and factual confirmations need review again after recovery. Runs use a saved version of your record. A correction or withdrawal requires a new review before a packet can be downloaded again; it cannot recall a file already downloaded.</p><p>If you separately enable CV variant recovery, the variant draft and its original save request can also be kept in this tab’s browser session storage for a thirty-minute recovery window. Recovery is limited to the same signed-in session and workspace. You must choose private-save permission again; recovery never starts a save or job run automatically. Turning this option off removes the stored recovery copy. Account changes and detected expiry clear it; if browser storage is unavailable, only page-memory recovery is offered.</p>
    <h2>Optional models and search</h2><p>The CV Check comparison without AI runs on your device. Choosing AI tailoring sends your CV and vacancy text to the displayed provider after your consent. In the cloud loop, you can choose the available rules mode or consent to the selected Claude, OpenAI or Kimi provider for that run. A model labelled “via OpenRouter” sends the cleared input through OpenRouter to that named model provider, under a separate per-run processing choice. The available route is displayed before consent; changing the route requires renewed review. The model receives confirmed facts you marked shareable and vacancy text, rather than the entire raw source CV. Job search queries use target roles and locations. Availability depends on the configured accounts. Remove confidential or unnecessary sensitive information before saving or sharing.</p>
    <h2>Optional inbox access</h2><p>Signing in with Google does not connect your inbox. Connecting Gmail requires a separate Google permission screen. When configured, the loop can read relevant job-search messages and store selected summaries. Draft access is optional; creating a draft requires your approval of its recipient and attachment. Jobvance has no email-send or application-submit action. Disconnecting removes its stored connection credentials; it does not delete messages or drafts already in Gmail. Google permissions can also be revoked in your Google account.</p>
    <h2>Document access</h2><p>Approved documents are retained for your access after pack expiry. Public walkthroughs use example CVs and vacancies, not candidate records. <Link to="/contact">Contact and service availability</Link>.</p>
  </div>;
  if (kind === "terms") return <div className="product-prose">
    <h2>The free check</h2><p>The six-step check and its reviewed downloads are free and do not use preparation-pack credits. Evidence findings are comparisons of supplied English text. They do not verify qualifications, establish eligibility or predict screening results.</p>
    <h2>The information you provide</h2><p>Provide information you have the right to use. Check and approve the wording before downloading or submitting. Do not invent qualifications, experience or achievements.</p>
    <h2>Free beta access</h2><p>{currentOffer.statement} {currentOffer.future} Cloud preparation is limited to ten accounts and available processing capacity.</p>
    <h2>Application preparation and tracking</h2><p>Jobvance provides application preparation and tracking. It does not promise interviews, employment, recruiter access or automated submission. Employer decisions are outside the service’s control.</p>
    <h2>Cloud loop availability</h2><p>The pilot is free and subject to run limits and service availability. The rules mode uses confirmed facts. External models, search and inbox access require their respective configuration and consent. Reports identify unavailable or incomplete stages. A relevance score explains this tool’s comparison; it is not an ATS score or a prediction of hiring. Recurring preparation requires your explicit opt-in and a configured scheduler. The workspace reports the actual next run and execution history. Pause a schedule to stop future scheduling while retaining the current run. Cancel schedule also stops its latest queued or running scheduled job. A separate manual run has its own cancellation control.</p>
    <h2>Current availability</h2><p>These product terms describe the current workflow. Real-money checkout remains disabled. No paid plan is currently offered for sale.</p>
  </div>;
  return <div className="product-prose">
    <h2>Failed requests and credits</h2><p>A failed request that does not save a usable pack should not consume a credit. Retry the same request after resolving the error. Previously approved packs can be downloaded again without another credit.</p>
    <h2>Incorrect charges or unusable paid access</h2><p>For incorrect charges, duplicate purchases or unusable paid access, use the published support contact with your receipt reference. Confirmed refunds revoke unused credits from the relevant purchase and do not erase documents already downloaded.</p>
    <h2>Before paid access launches</h2><p>The operator must confirm the final refund window before real-money checkout is enabled. No interview or employment guarantee is offered.</p>
  </div>;
}

export default function ProductPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const start = user ? "/loop" : "/auth?next=%2Floop";
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  const legal = kind === "privacy" || kind === "terms" || kind === "refund";
  const path = kind === 'home' ? '/' : kind === 'how' ? '/how-it-works' : `/${kind}`;
  const meta = staticPageMeta(path);
  return <main className={`product-page product-page--${kind}`}>
    <Helmet><title>{meta?.title ?? `${titles[kind]} | Jobvance`}</title><meta name="description" content={meta?.description ?? intros[kind]} />{meta && <link rel="canonical" href={SITE_ORIGIN + meta.path} />}{meta && <meta property="og:title" content={meta.title} />}{meta && <meta property="og:description" content={meta.description} />}{meta && <meta property="og:url" content={SITE_ORIGIN + meta.path} />}<meta property="og:type" content="website" />{kind === 'notfound' && <meta name="robots" content="noindex,follow" />}</Helmet>
    {kind === "home" ? <HomePage /> : <div className="product-shell product-inner">
      <header className="product-page-heading"><p className="product-eyebrow"><Link to="/">Jobvance</Link><span aria-hidden="true">/</span>{labels[kind]}</p><h1>{titles[kind]}</h1><p className="product-page-intro">{intros[kind]}</p></header>
      {kind === "pricing" ? <SubscriptionPricing /> : <div className="product-content-layout"><article className="product-main-content">
        {(kind === "how" || kind === "help") && <><LoopJourney /><div className="product-help-bottom"><StartLink /><p>Scheduled runs use rules-based preparation from connected sources. Optional AI preparation requires consent for each run. Review your documents before applying.</p><Link to="/check" className="product-text-link">Only need one CV? Try the free CV Check <ArrowRight size={17} aria-hidden="true" /></Link></div></>}


        {kind === "faq" && <div className="product-faqs">{faqs.map(([question, answer], index) => <details key={question}><summary><span className="product-faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{question}</span><Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>}
        {kind === "about" && <div className="product-about"><p className="product-large-copy">Jobvance helps you prepare a CV for a job you want and keep track of what you send. You bring the experience and make the final call on the wording. Your experience stays the source of every application; employer decisions are theirs.</p><div className="product-about-principles"><span><FileText size={22} aria-hidden="true" />A visible source</span><span><CircleHelp size={22} aria-hidden="true" />Room for questions</span><span><CheckCircle2 size={22} aria-hidden="true" />Your final approval</span></div><StartLink /></div>}
        {kind === "contact" && <><GuestSupport />{support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) && <div className="product-contact-box"><a className="product-text-link" href={`mailto:${support}`}>Email Jobvance support<ArrowUpRight size={17} aria-hidden="true" /></a></div>}</>}
        {legal && <LegalContent kind={kind} />}
        {kind === "notfound" && <div className="product-notfound"><span aria-hidden="true">404<span>↗</span></span><p>The address does not match an available page. <Link to="/">Return to Jobvance</Link>.</p><StartLink /></div>}
      </article><aside className="product-aside"><span className="product-eyebrow">Your next step</span><h2>{legal ? "Questions about the details?" : "Have a vacancy in mind?"}</h2><p>{legal ? "Check service availability or read the answers to common questions." : "Bring your CV and one job description. Start without an account."}</p><Link to={legal ? "/contact" : "/check"} className="product-text-link">{legal ? "Contact & availability" : "Start a free check"}<ArrowRight size={17} aria-hidden="true" /></Link><nav aria-label="Related pages"><Link to="/faq">Questions & answers<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to={start}>Your workspace<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/privacy">Privacy<ArrowUpRight size={14} aria-hidden="true" /></Link></nav><span className="product-aside-symbol" aria-hidden="true">j↗</span></aside></div>}
    </div>}
  </main>;
}
