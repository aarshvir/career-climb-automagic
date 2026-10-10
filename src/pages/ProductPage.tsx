import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, CircleHelp, Download, FileText, FolderOpen, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import "./ProductPage.css";

type Kind = "home" | "pricing" | "how" | "faq" | "about" | "contact" | "privacy" | "terms" | "refund" | "help" | "notfound";
const titles: Record<Kind, string> = {
  home: "Prepare a CV you can stand behind", pricing: "A useful place to start. Free.", how: "One application. Six clear steps.", faq: "A few things worth knowing.", about: "Your experience belongs to you.", contact: "Let’s get you unstuck.", privacy: "Privacy", terms: "Terms of use", refund: "Refunds and failed tasks", help: "Using your workspace", notfound: "This page took a different path.",
};
const labels: Record<Kind, string> = { home: "Jobvance", pricing: "Access & pricing", how: "How it works", faq: "Questions & answers", about: "About Jobvance", contact: "Contact", privacy: "Your information", terms: "The details", refund: "Credits & refunds", help: "A little guidance", notfound: "Page not found" };
const intros: Partial<Record<Kind, string>> = {
  pricing: "Check the wording, make your edits and download the CV you approve. There’s no card to enter and no account required to begin.",
  how: "Start with a real vacancy. Keep the source visible. Make the final call on what you send.",
  faq: "What the check does, what stays private, and what happens next.",
  about: "A quieter, more deliberate way to prepare for the role you actually want.",
  contact: "For questions about your documents, your account or service access.",
  privacy: "How the free check, optional account saving and existing workspace handle your information.",
  terms: "Read these alongside the CV you review and the application you choose to submit.",
  refund: "How failed requests, pack credits and any future paid access are handled.",
  help: "Keep your source, vacancy and approved version together. Take the next step when you are ready.",
  notfound: "The address does not match an available page. Your next application can start here.",
};
const steps = [
  { title: "Pick your role", text: "Start with the role you want. Add the employer if you know it." },
  { title: "Bring your CV", text: "Add your CV as a PDF, Word or text file, or paste it. Check the extracted text and remove anything private." },
  { title: "Add the vacancy", text: "Paste one job description, including the responsibilities and requirements." },
  { title: "Read the evidence", text: "Read the job requirement beside the relevant part of your CV. Look closely at the gaps." },
  { title: "Make it yours", text: "Make your edits. Add an example only if it is yours to share, then check the revised CV." },
  { title: "Approve & download", text: "Approve your CV and download it for free. Sign in if you want to save it privately or track the application." },
];
const faqs = [
  ["Can I check my CV without signing up?", "Yes. Check your CV and download the version you approve, all for free. Sign in only if you want to save it privately. This check uses no pack credits."],
  ["Does a finding mean I meet a requirement?", "No. Matching words are a starting point. Read the requirement and the CV example yourself; the check cannot confirm your qualifications or predict what an employer will decide."],
  ["Does Jobvance apply for me?", "You submit on the employer’s site. The tracker records the progress you report. Opening a link does not count as a submission."],
  ["What does tailoring change?", "It brings relevant experience forward without inventing achievements. You read the result, make your edits and approve it before downloading."],
  ["Can I download my documents?", "Approved packs can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded."],
  ["Which files can I upload?", "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format."],
  ["Can I purchase more packs?", "Jobvance is currently a free beta with one preparation pack per account. Paid passes are not available. The planned pass is a one-time purchase, with no automatic renewal."],
  ["Are interviews or jobs guaranteed?", "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control."],
];

function StartLink({ children = "Check my CV for free", light = false }: { children?: React.ReactNode; light?: boolean }) {
  return <Link to="/check" className={`product-button${light ? " product-button--light" : ""}`}>{children}<ArrowRight size={18} aria-hidden="true" /></Link>;
}

function EvidencePreview() {
  return <figure className="product-preview" aria-labelledby="product-preview-caption">
    <div className="product-preview-label"><span className="product-live-dot" aria-hidden="true" />A look inside <span>Fictional demo</span></div>
    <div className="product-preview-window">
      <div className="product-preview-bar"><span className="product-preview-logo">j<span aria-hidden="true">↗</span></span><span>CV check / Evidence review</span><span className="product-preview-step">04 / 06</span></div>
      <div className="product-preview-body">
        <div className="product-preview-role"><div><span className="product-micro">ROLE IN FOCUS</span><h2>Operations analyst</h2><p>A fictional vacancy</p></div><FileText size={24} aria-hidden="true" /></div>
        <div className="product-evidence-pair">
          <div className="product-passage"><span className="product-micro">THE VACANCY SAYS</span><p>“Produce stakeholder reports.”</p></div>
          <div className="product-passage product-passage--cv"><span className="product-micro">YOUR CV SAYS</span><p>“Prepared stakeholder reports.”</p><span className="product-status product-status--direct"><CheckCircle2 size={13} aria-hidden="true" />Direct wording found</span></div>
        </div>
        <div className="product-evidence-pair product-evidence-pair--second">
          <div className="product-passage"><span className="product-micro">THE VACANCY SAYS</span><p>“Lead stakeholder reporting.”</p></div>
          <div className="product-passage product-passage--cv"><span className="product-micro">YOUR CV SAYS</span><p>“Assisted in leading stakeholder reporting.”</p><span className="product-status product-status--review"><CircleHelp size={13} aria-hidden="true" />Related passage—review needed</span></div>
        </div>
        <div className="product-preview-question"><CircleHelp size={17} aria-hidden="true" /><p>Did you lead this work, or support someone who did?</p></div>
        <div className="product-preview-bottom"><span>Read the passage. Make the call.</span><span><LockKeyhole size={12} aria-hidden="true" />Your review</span></div>
      </div>
    </div>
    <figcaption id="product-preview-caption">Illustrative example using fictional text. Findings compare wording; they do not confirm qualifications.</figcaption>
  </figure>;
}

function StepList({ compact = false }: { compact?: boolean }) {
  return <ol className={`product-steps${compact ? " product-steps--compact" : ""}`}>{steps.map((step, index) => <li key={step.title}><span className="product-step-number" aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div>{index === 5 && <Download size={21} aria-hidden="true" />}</li>)}</ol>;
}

function HomePage() {
  return <>
    <section className="product-hero product-shell">
      <div className="product-hero-copy"><p className="product-eyebrow"><span aria-hidden="true" />A little more clarity for your next move</p><h1>Prepare a CV you can <em>stand behind.</em></h1><p className="product-hero-intro">Have a job in mind? Bring your CV and the vacancy. See where your experience comes through, work through the gaps, and leave with a version you’re ready to send.</p><div className="product-actions"><StartLink /><a href="#example" className="product-text-link">See a worked example<ArrowUpRight size={17} aria-hidden="true" /></a></div><p className="product-hero-note">Free to check and download. No account or card needed.</p></div>
      <div className="product-hero-art"><span className="product-orbit" aria-hidden="true" /><EvidencePreview /></div>
    </section>
    <div className="product-assurances product-shell" aria-label="A workflow you control"><span><FileText size={17} aria-hidden="true" />Your actual experience</span><span><ShieldCheck size={18} aria-hidden="true" />Check on your device</span><span><CheckCircle2 size={18} aria-hidden="true" />Your approval comes first</span></div>
    <section id="example" className="product-evidence-section product-shell">
      <div className="product-section-copy"><p className="product-eyebrow">01 / See what’s already there</p><h2>Relevant experience.<br /><em>In clearer view.</em></h2><p>A good application starts with a real example. Read the vacancy beside your own words, then bring the experience that matters forward.</p><p>Missing evidence is a question for you. Add an example only when it’s yours to share.</p><Link to="/how-it-works" className="product-text-link">How the check works<ArrowRight size={17} aria-hidden="true" /></Link></div>
      <div className="product-order-demo"><div className="product-order-heading"><span>THE SAME CV. A MORE RELEVANT ORDER.</span><span className="product-demo-tag">Fictional example</span></div><div className="product-order-sheet"><span className="product-micro">ORIGINAL ORDER</span><ol><li>Coordinated team meeting schedules.</li><li>Prepared monthly management reports.</li></ol></div><div className="product-order-transition" aria-hidden="true"><ArrowRight size={21} /><span>Reporting role in focus</span></div><div className="product-order-sheet product-order-sheet--after"><span className="product-micro">RELEVANT ORDER</span><ol><li><mark>Prepared monthly management reports.</mark></li><li>Coordinated team meeting schedules.</li></ol></div><p className="product-demo-note">The original wording and facts stay intact. This is a fictional illustration, not a customer outcome.</p></div>
    </section>
    <section className="product-path-section"><div className="product-shell"><div className="product-section-heading"><div><p className="product-eyebrow">02 / A path you can follow</p><h2>One real vacancy.<br /><em>Six clear steps.</em></h2></div><p>Bring the source. Review the evidence. Approve what leaves your hands.</p></div><StepList /><div className="product-path-footer"><span>PDF, Word or text file. One vacancy at a time.</span><StartLink>Start with your role</StartLink></div></div></section>
    <section className="product-private-section product-shell"><div className="product-private-copy"><p className="product-eyebrow">03 / Room to prepare</p><h2>Your working draft.<br /><em>Your choice to save.</em></h2><p>The free check compares text on your device. Take your time: read, revise and download without creating an account.</p><p>Sign in when you want to save an approved check privately or keep an honest record of the applications you submit yourself.</p><Link to="/privacy" className="product-text-link">Read how your information is handled<ArrowUpRight size={17} aria-hidden="true" /></Link></div><div className="product-private-note"><LockKeyhole size={29} aria-hidden="true" /><span className="product-micro">YOU CONTROL THE NEXT STEP</span><ul><li><Check size={18} aria-hidden="true" /><span>Review the source text</span></li><li><Check size={18} aria-hidden="true" /><span>Approve your final wording</span></li><li><FolderOpen size={18} aria-hidden="true" /><span>Choose whether to save privately</span></li></ul><p>Unsaved checks are held in memory and cleared when the page closes or refreshes. Account saving is an explicit choice.</p></div></section>
    <section className="product-pilot-section product-shell"><div className="product-pilot-index" aria-hidden="true"><span>YOUR</span><em>next</em><span>CHAPTER</span></div><div><p className="product-eyebrow">A focused place to begin</p><h2>Exploring strategy or transformation roles?</h2><p>Take a look at the free guided pilot and a fictional example. See the workflow before deciding what you want to share.</p><Link to="/pilot" className="product-text-link">Explore the guided pilot<ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
    <section className="product-final-section"><div className="product-shell"><p className="product-eyebrow">Your next application starts with what you know</p><h2>Bring your experience.<br /><em>Make it clearer.</em></h2><div className="product-final-actions"><StartLink light /><span>Free check. Reviewed download.<br />No account needed to start.</span></div><span className="product-final-arrow" aria-hidden="true">↗</span></div></section>
  </>;
}

function LegalContent({ kind }: { kind: "privacy" | "terms" | "refund" }) {
  if (kind === "privacy") return <div className="product-prose">
    <h2>Your free check</h2><p>The free CV check reads your file and compares CV/vacancy text on your device. It does not upload the original file or transmit check content during analysis or guest downloads. Unsaved work is held in memory and is cleared when the page closes or refreshes. It does not send check data to advertising tools.</p>
    <h2>Choosing account saving</h2><p>If you explicitly choose account saving, the role, company, vacancy, reviewed source CV and approved final CV texts are stored privately in your existing Supabase account. The exact save payload is shown before saving. Saved free checks can be deleted in the check page; deletion does not remove files you already downloaded.</p>
    <h2>Signing in with an unsaved check</h2><p>Google sign-in can retain an unsaved check in this browser tab only after specific consent. A retained draft is eligible for restoration for 30 minutes and cleared on return or when you clear the check; closing the tab also removes tab storage. An expired draft is discarded when next read. This temporary storage is accessible to someone using the same browser tab. Email sign-in can keep the check in memory without this handoff.</p>
    <h2>Your existing workspace</h2><p>Your account, uploaded CV, extracted text, application documents and tracker entries are processed to provide this service. Supabase supplies authentication, database and private file storage. Real-money payments are currently disabled. If payment testing is enabled, the configured processor is Paddle or Stripe; Jobvance does not collect full card numbers.</p>
    <h2>Deleting information</h2><p>You can delete an original CV or a tracker entry in your workspace. Original deletion does not remove separately saved application packs. Contact support for account erasure or other data requests; necessary financial records may require retention.</p>
    <h2>CV content and services</h2><p>This tailoring workflow compares your existing text with the description you provide and does not send CV content to an external AI service. Do not include confidential employer documents or unnecessary sensitive information.</p>
    <h2>Document access</h2><p>Approved documents are retained for your access after pack expiry. Public examples use fictional data. <Link to="/contact">Contact and service availability</Link>.</p>
  </div>;
  if (kind === "terms") return <div className="product-prose">
    <h2>The free check</h2><p>The six-step check and its reviewed downloads are free and do not use preparation-pack credits. Evidence findings are comparisons of supplied English text. They do not verify qualifications, establish eligibility or predict screening results.</p>
    <h2>The information you provide</h2><p>Provide information you have the right to use. Check and approve the wording before downloading or submitting. Do not invent qualifications, experience or achievements.</p>
    <h2>The planned pass</h2><p>The pass provides ten saved packs over thirty days after confirmed payment. It does not renew automatically. A newly saved pack uses one credit; retrying an identical request does not use another. Approved versions can be downloaded again without another pack charge.</p>
    <h2>Application preparation and tracking</h2><p>Jobvance provides application preparation and tracking. It does not promise interviews, employment, recruiter access or automated submission. Employer decisions are outside the service’s control.</p>
    <h2>Current availability</h2><p>These product terms describe the current workflow. Real-money checkout remains disabled. Jobvance is currently a free beta; the planned commercial pass is not offered for sale.</p>
  </div>;
  return <div className="product-prose">
    <h2>Failed requests and credits</h2><p>A failed request that does not save a usable pack should not consume a credit. Retry the same request after resolving the error. Previously approved packs can be downloaded again without another credit.</p>
    <h2>Incorrect charges or unusable paid access</h2><p>For incorrect charges, duplicate purchases or unusable paid access, use the published support contact with your receipt reference. Confirmed refunds revoke unused credits from the relevant purchase and do not erase documents already downloaded.</p>
    <h2>Before paid access launches</h2><p>The operator must confirm the final refund window before real-money checkout is enabled. No interview or employment guarantee is offered.</p>
  </div>;
}

export default function ProductPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const start = user ? "/dashboard" : "/auth";
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  const legal = kind === "privacy" || kind === "terms" || kind === "refund";
  return <main className={`product-page product-page--${kind}`}>
    <Helmet><title>{titles[kind]} | Jobvance</title><meta name="description" content="Review your CV, tailor existing experience to a real vacancy, download your documents, and track your applications." /></Helmet>
    {kind === "home" ? <HomePage /> : <div className="product-shell product-inner">
      <header className="product-page-heading"><p className="product-eyebrow"><Link to="/">Jobvance</Link><span aria-hidden="true">/</span>{labels[kind]}</p><h1>{titles[kind]}</h1><p className="product-page-intro">{intros[kind]}</p></header>
      {kind === "pricing" ? <><div className="product-pricing"><section className="product-plan product-plan--free"><div className="product-plan-top"><span className="product-eyebrow">Available now</span><span className="product-demo-tag">Free beta</span></div><h2>Check, review & download</h2><p className="product-price">Free<span>For your next application</span></p><p>The six-step CV check and approved downloads are free. Optional private account saving does not use a pack credit. The existing workspace also includes one free preparation pack per account.</p><ul><li><Check size={17} aria-hidden="true" />Check your CV against one vacancy</li><li><Check size={17} aria-hidden="true" />Read the original evidence and make your edits</li><li><Check size={17} aria-hidden="true" />Approve and download your version</li></ul><StartLink>Start your free check</StartLink></section><section className="product-plan product-plan--planned"><div className="product-plan-top"><span className="product-eyebrow">Planned access</span><LockKeyhole size={17} aria-hidden="true" /></div><h2>Thirty-day pass</h2><p className="product-price">$29<span>Once · planned price</span></p><p>Ten application packs for thirty days. PDF, DOCX and TXT downloads. No automatic renewal or included practitioner review.</p><button type="button" className="product-button product-button--disabled" disabled>Paid pass not available</button><p className="product-plan-note">Free beta access is available now. Paid sales have not launched. <Link to="/refund">Refund terms</Link>.</p></section></div><p className="product-pricing-note">You submit your application on the employer’s site. Jobvance helps you prepare and keep track.</p></> : <div className="product-content-layout"><article className="product-main-content">
        {(kind === "how" || kind === "help") && <><StepList compact /><div className="product-help-bottom"><StartLink>Start a free CV check</StartLink><p>The existing <Link to={start}>workspace</Link> remains available for saved CV files, preparation packs and tracking. You submit separately on the employer’s site.</p></div></>}
        {kind === "faq" && <div className="product-faqs">{faqs.map(([question, answer], index) => <details key={question}><summary><span className="product-faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{question}</span><Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>}
        {kind === "about" && <div className="product-about"><p className="product-large-copy">Jobvance helps you prepare a CV for a job you want and keep track of what you send. You bring the experience and make the final call on the wording. Examples on this site are fictional; employer decisions are theirs.</p><div className="product-about-principles"><span><FileText size={22} aria-hidden="true" />A visible source</span><span><CircleHelp size={22} aria-hidden="true" />Room for questions</span><span><CheckCircle2 size={22} aria-hidden="true" />Your final approval</span></div><StartLink /></div>}
        {kind === "contact" && <div className="product-prose"><p>For help with documents, access or a payment, include the relevant record or receipt reference. Please do not send passwords, card details or your full CV.</p><div className="product-contact-box"><span className="product-eyebrow">Support availability</span>{support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) ? <a className="product-button" href={`mailto:${support}`}>Email Jobvance support<ArrowUpRight size={17} aria-hidden="true" /></a> : <p>Direct support contact details are currently unavailable. Real-money purchases remain disabled until support is available.</p>}</div></div>}
        {legal && <LegalContent kind={kind} />}
        {kind === "notfound" && <div className="product-notfound"><span aria-hidden="true">404<span>↗</span></span><p>The address does not match an available page. <Link to="/">Return to Jobvance</Link>.</p><StartLink /></div>}
      </article><aside className="product-aside"><span className="product-eyebrow">Your next step</span><h2>{legal ? "Questions about the details?" : "Have a vacancy in mind?"}</h2><p>{legal ? "Check service availability or read the answers to common questions." : "Bring your CV and one job description. Start without an account."}</p><Link to={legal ? "/contact" : "/check"} className="product-text-link">{legal ? "Contact & availability" : "Start a free check"}<ArrowRight size={17} aria-hidden="true" /></Link><nav aria-label="Related pages"><Link to="/faq">Questions & answers<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to={start}>Your workspace<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/privacy">Privacy<ArrowUpRight size={14} aria-hidden="true" /></Link></nav><span className="product-aside-symbol" aria-hidden="true">j↗</span></aside></div>}
    </div>}
  </main>;
}
