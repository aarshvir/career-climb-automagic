import { Children, cloneElement, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import "./ProductPage.css";
import SubscriptionPricing from "./SubscriptionPricing";
import LoopJourney from "@/components/LoopJourney";
import AdsMeasurementChoice from "@/components/AdsMeasurementChoice";
import GuestSupport from "./GuestSupport";
import HomePage from "./HomePage";
import './JobLoop.css';
import { currentOffer } from '@/lib/current-offer';
import { subscriptionPlans } from '@/lib/subscription-plans';
import { RunCard } from '@/components/marketing/ProductCards';
import { CvDiffCard, SetupCard } from '@/components/marketing/PageCards';
import { useReveal } from '@/hooks/useReveal';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';

type Kind = "home" | "pricing" | "how" | "faq" | "about" | "contact" | "privacy" | "terms" | "refund" | "help" | "notfound";
const titles: Record<Kind, string> = {
  home: "Automate your job search", pricing: "Choose your plan.", how: "How the Automated Job Loop works", faq: "Questions about the Automated Job Loop", about: "Why we built Jobvance", contact: "Get help with Jobvance", privacy: "Privacy", terms: "Terms of use", refund: "Refunds and failed tasks", help: "Using your workspace", notfound: "We couldn’t find that page",
};
const labels: Record<Kind, string> = { home: "Jobvance", pricing: "Pricing", how: "How it works", faq: "FAQ", about: "About Jobvance", contact: "Contact", privacy: "Your information", terms: "The details", refund: "Refunds", help: "Help with your application", notfound: "Page not found" };
const intros: Partial<Record<Kind, string>> = {
  pricing: `Choose how often your Automated Job Loop runs. Plans from $${subscriptionPlans[0].priceUsd}/month, with a free account to start.`,
  how: "Add your experience, choose the roles and locations you want, then come back to matched jobs and a tailored CV for each.",
  faq: "How the Automated Job Loop works, what it prepares for you and how your information is handled.",
  about: "Applying for another role shouldn’t mean rebuilding your experience from scratch.",
  contact: "For questions about your documents, your account or service access.",
  privacy: "How the free check, your saved documents, payments and the optional Automated Job Loop handle your information.",
  terms: "Read these alongside the CV you review and the application you choose to submit.",
  refund: "Cancelling Automated Job Loop renewal, requesting payment help and our 7-day money-back promise for CV passes.",
  help: "Keep your source, vacancy and approved version together. Take the next step when you are ready.",
  notfound: "The address does not match an available page. Your next application can start here.",
};
const faqs = [
  ["Do I need an account?", "Yes. Your Jobvance account keeps your CVs, preferences and applications together. Create an account, complete your search setup and choose how to prepare your applications."],
  ["Does a finding mean I meet a requirement?", "No. Matching words are a starting point. Read the requirement and the CV example yourself; the check cannot confirm your qualifications or predict what an employer will decide."],
  ["What does the Automated Job Loop prepare for me?", "It finds jobs from connected sources for your roles and locations, prepares a tailored CV for each prepared role and keeps everything in your dashboard. Download PDF, DOCX or TXT and open the employer’s vacancy when you are ready."],
  ["Does Jobvance rewrite my CV?", "It rewords and reorders what is already in your CV so it reads well for the job, and adds a short profile built only from your own lines. It never adds employers, numbers, tools or qualifications you have not listed, and it asks you about gaps instead of filling them. You check every change before downloading."],
  ["Can I download my documents?", "Your approved CV can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded."],
  ["Which files can I upload?", "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format."],
  ["What does Jobvance cost?", `${currentOffer.statement} Your account includes 3 AI-tailored CVs each month. For more, a one-time pass gives you Sprint: 25 tailored CVs over 7 days for $9, Job Search: 100 over 30 days for $19, or Career Move: 300 over 90 days for $39. ${currentOffer.passes}`],
  ["Are interviews or jobs guaranteed?", "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control."],
  ["Can I use projects or internships in my CV?", "Yes. Your reviewed CV can include clearly labelled academic projects, internships, activities and previous employment. Describe your own contribution accurately. Project work is not automatically evidence of required professional experience."],
  ["How does the Automated Job Loop work?", "Add your experience, choose your roles, locations and schedule, and the loop searches connected sources and prepares a separate CV for each role. Come back to your dashboard to download PDF, DOCX or TXT. Search, model and inbox connections depend on operator setup; the workspace shows which are available."],
];

/** The visible FAQ, exported so the prerender can describe exactly the questions on the page. */
export const productFaqs = faqs;

/** Wraps the product name in a no-break span so it never splits across lines. */
function nb(text: string): ReactNode {
  const parts = text.split("Automated Job Loop");
  return parts.map((part, index) => <Fragment key={index}>{index > 0 && <span className="jv-nb">Automated Job Loop</span>}{part}</Fragment>);
}
/** Long legal paragraphs break at sentence ends into short paragraphs (about two or three sentences each). */
function readable(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    current = current ? `${current} ${sentence}` : sentence;
    if (current.length >= 240) { out.push(current); current = ""; }
  }
  if (current) { if (out.length && current.length < 90) out[out.length - 1] += ` ${current}`; else out.push(current); }
  return out;
}
function StartLink({ children = "Start my search", to = "/onboarding", variant = "primary", size = "lg" }: { children?: React.ReactNode; to?: string; variant?: "primary" | "secondary"; size?: "md" | "lg" }) {
  return <Link to={to} className={`jv-btn jv-btn--${variant}${size === "lg" ? " jv-btn--lg" : ""}`}>{children}<ArrowRight aria-hidden="true" /></Link>;
}
function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="jv-link"><span>{children}</span><ArrowRight aria-hidden="true" /></Link>;
}
/** The closing moment on explainer and utility pages: one tinted bar (heading, one line, two actions). The full dark band is kept for the home page and the Automated Job Loop page. */
function CtaBar({ start, heading = "Ready to automate your search?", body = "Set your roles and schedule once. Come back to the best-matching jobs and tailored CVs.", secondary = true }: { start: string; heading?: string; body?: string; secondary?: boolean }) {
  return <section className="jv-cta-bar" aria-labelledby="page-cta-title">
    <div className="jv-cta-bar-copy"><h2 id="page-cta-title">{heading}</h2><p>{body}</p></div>
    <div className="jv-cta-bar-actions"><StartLink to={start} />{secondary && <TextLink to="/check">Try the free CV Check</TextLink>}</div>
  </section>;
}

/** Table of contents for long legal pages: ids come from the h2 text, so the links and the headings cannot drift apart. */
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement(child) ? textOf((child.props as { children?: ReactNode }).children) : '').join('');
}
function slugOf(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function LegalLayout({ kind }: { kind: "privacy" | "terms" | "refund" }) {
  // The index is a single disclosure on phones so the first section starts above the fold.
  const [tocOpen, setTocOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(max-width: 1023px)').matches);
  const prose = LegalContent({ kind }) as ReactElement<{ children?: ReactNode }>;
  const toc: { id: string; text: string }[] = [];
  const body = Children.toArray(prose.props.children).map(node => {
    if (isValidElement(node) && node.type === 'h2') {
      const props = node.props as { id?: string; children?: ReactNode };
      const text = textOf(props.children), id = props.id ?? slugOf(text);
      toc.push({ id, text });
      return cloneElement(node as ReactElement<{ id?: string }>, { id });
    }
    if (isValidElement(node) && node.type === 'p') {
      const only = (node.props as { children?: ReactNode }).children;
      if (typeof only === 'string') return <Fragment key={node.key ?? undefined}>{readable(only).map((chunk, index) => <p key={index}>{chunk}</p>)}</Fragment>;
    }
    return node;
  });
  return <div className="jv-legal">
    <nav className="jv-toc" aria-label="On this page"><details open={tocOpen} onToggle={event => setTocOpen(event.currentTarget.open)}><summary className="jv-caption">On this page</summary><ol>{toc.map(item => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ol></details></nav>
    <div className="product-prose jv-prose">{body}</div>
  </div>;
}

function LegalContent({ kind }: { kind: "privacy" | "terms" | "refund" }) {
  if (kind === "privacy") return <div className="product-prose jv-prose">
    <h2>Your free check</h2><p>The free CV check reads your file on your device; the original file is never uploaded. Comparing without AI runs entirely on your device. If you choose “Tailor my CV for this job”, the text of your CV and the job description is sent to our AI provider (OpenRouter, with model providers’ data collection declined) to prepare one tailored version. Jobvance does not store that text unless you save the check; we keep only a cost record, which also counts your free and pass allowance, and historical network-limit records from earlier guest access, deleted after 90 days. Unsaved drafts can be recovered during in-app navigation from this tab’s memory for up to 30 minutes after your last change. Without optional tab-storage permission, refreshing or closing the tab clears the draft. It does not send check data to advertising tools.</p>
    <h2>Optional refresh recovery</h2><p>Choosing “Keep my draft in this tab across refresh” allows your CV and vacancy texts to be stored temporarily in this browser tab. They are eligible for restoration for 30 minutes after your last change; an expired stored copy is removed when next read. Anyone using the same browser tab may access this copy. Turning off the option, clearing the check or changing accounts removes it; closing the tab also removes tab storage. Restoring a draft clears its approval, so review and approve again. This permission does not save the check to your account.</p>
    <h2>Choosing account saving</h2><p>If you explicitly choose account saving, the role, company, vacancy, reviewed source CV and approved final CV texts are stored privately in your existing Supabase account. The exact save payload is shown before saving. Saved free checks can be deleted in the check page; deletion does not remove files you already downloaded.</p>
    <h2>Signing in with an unsaved check</h2><p>Google sign-in can retain an unsaved check in this browser tab only after specific consent. A retained draft is eligible for restoration for 30 minutes and cleared on return or when you clear the check; closing the tab also removes tab storage. An expired draft is discarded when next read. This temporary storage is accessible to someone using the same browser tab. Email sign-in can keep the check in memory without this handoff.</p>
    <h2>Your existing workspace</h2><p>Your account, uploaded CV, extracted text, application documents and tracker entries are processed to provide this service. Supabase supplies authentication, database and private file storage.</p>
    <h2>Payments</h2><p>Automated Job Loop subscriptions and CV passes are sold through Dodo Payments, which acts as our merchant of record and payment processor. Dodo Payments collects your payment details, email address and billing location to take payment, calculate sales tax, prevent fraud and send your invoice, under its own privacy policy. Jobvance never receives your full card number. Dodo Payments tells us the payment and subscription status, billing period, renewal or cancellation, amount, tax and payment reference so we can provide or revoke the corresponding access. We keep necessary billing records for accounting, tax, payment reconciliation and fraud prevention. Your card, billing address and CV contents are not sent to advertising tools; the limited purchase notice described under Advertising measurement is the only payment information Meta receives.</p>
    <h2 id="advertising-measurement">Advertising measurement</h2><p>To learn whether our Facebook and Instagram ads lead to visits and new accounts, jobvance.io uses the Meta Pixel from Meta Platforms. It starts only when you open a public page or the sign-up page, never from a sign-in, password-reset, mailbox or checkout return link. It sends Meta the address of the public page you arrive on, your browser and device type, your IP address, the referring site and Meta cookie identifiers (<code>_fbp</code>, and <code>_fbc</code> when you arrive from an ad), plus a notice that an account was created when you sign up. The Pixel does not report navigation inside your workspace, CV check or Automated Job Loop; the separate, limited checkout and first-payment notices below can be sent when you return to the site. When you create an account, our server also sends Meta that sign-up notice with irreversibly hashed (SHA-256) copies of your email address and account ID, your IP address and browser type, so Meta can match it to the ad you came from. When you are signed in and open a secure Automated Job Loop checkout, or your first subscription payment is confirmed, our server sends Meta a notice of that event with the plan name and, for a confirmed payment, the amount and currency, the same hashed identifiers and the Meta cookie identifiers above. Later renewals are not reported. Meta’s automatic collection of page content and button clicks is turned off, and Meta is never given your CV, vacancy text, documents, card or billing details or your email address in readable form. Meta processes this information under its own privacy policy, including to measure and improve ads. Neither the pixel nor server notices are sent when your browser sends a Global Privacy Control signal, for visitors whose device is set to a European time zone, or when you choose to turn off advertising measurement below.</p><AdsMeasurementChoice />
    <h2>Support information</h2><p>Public support needs no account, name or email. Your message is stored privately for up to 90 days for manual administration review. A random private receipt code lets its holder read the status and any reply; keep it private and download it if you need to return. The code is never included in a page URL. Requests are removed by daily maintenance after expiry. An irreversible hash of a limited network identifier is used to limit new requests; raw IP addresses are not stored in the support table. Support messages are not sent to models and this form does not send email.</p>
    <h2>Deleting information</h2><p>You can delete an original CV or a tracker entry in your workspace. Original deletion does not remove separately saved application packs. Use Help & privacy in your Automated Job Loop to erase its career record, generated documents, schedule and mailbox connection. Your sign-in account and separately saved workspace CVs remain. Minimal security and usage records remain to prevent old requests restoring deleted work and to retain committed spending; these records do not contain your CV text or document files. Record an account-wide or privacy request there or on the contact page; its receipt is visible and does not imply review. Necessary financial records may require retention.</p>
    <h2>Your Automated Job Loop</h2><p>Saving a career record is an explicit choice. Its source text, target preferences, confirmed facts, vacancies, run reports and prepared documents are stored in your private Supabase account. Unsaved career record, claim and new-vacancy edits can be recovered during in-app navigation from this tab’s memory for up to thirty minutes. They are not written to browser storage, and refresh, closing the tab, sign-out or switching accounts clears them. Sharing and factual confirmations need review again after recovery. Runs use a saved version of your record. A correction or withdrawal requires a new review before a packet can be downloaded again; it cannot recall a file already downloaded.</p><p>If you separately enable CV variant recovery, the variant draft and its original save request can also be kept in this tab’s browser session storage for a thirty-minute recovery window. Recovery is limited to the same signed-in session and workspace. You must choose private-save permission again; recovery never starts a save or job run automatically. Turning this option off removes the stored recovery copy. Account changes and detected expiry clear it; if browser storage is unavailable, only page-memory recovery is offered.</p>
    <h2>Optional models and search</h2><p>The CV Check comparison without AI runs on your device. Choosing AI tailoring sends your CV and vacancy text to the displayed provider after your consent. In the cloud loop, you can choose the available rules mode or consent to the selected Claude, OpenAI or Kimi provider for that run. A model labelled “via OpenRouter” sends the cleared input through OpenRouter to that named model provider, under a separate per-run processing choice. The available route is displayed before consent; changing the route requires renewed review. The model receives confirmed facts you marked shareable and vacancy text, rather than the entire raw source CV. Job search queries use target roles and locations. Availability depends on the configured accounts. Remove confidential or unnecessary sensitive information before saving or sharing.</p>
    <h2>Optional inbox access</h2><p>Signing in with Google does not connect your inbox. Connecting Gmail requires a separate Google permission screen. When configured, the loop can read relevant job-search messages and store selected summaries. Draft access is optional; creating a draft requires your approval of its recipient and attachment. Jobvance has no email-send or application-submit action. Disconnecting removes its stored connection credentials; it does not delete messages or drafts already in Gmail. Google permissions can also be revoked in your Google account.</p>
    <h2>Document access</h2><p>Approved documents are retained for your access after pack expiry. Public walkthroughs use example CVs and vacancies, not candidate records. <Link to="/contact">Contact and service availability</Link>.</p>
  </div>;
  if (kind === "terms") return <div className="product-prose jv-prose">
    <h2>The free check</h2><p>The six-step check and its reviewed downloads are free and do not use preparation-pack credits. Evidence findings are comparisons of supplied English text. They do not verify qualifications, establish eligibility or predict screening results.</p>
    <h2>The information you provide</h2><p>Provide information you have the right to use. Check and approve the wording before downloading or submitting. Do not invent qualifications, experience or achievements.</p>
    <h2>Free access</h2><p>{currentOffer.statement} Your account includes 3 AI-tailored CVs each calendar month (UTC). Compare without AI, editing, downloads and the applications tracker stay free. Automated Job Loop access and processing availability are shown in your account.</p>
    <h2>Automated Job Loop monthly subscriptions</h2><p>Starter includes one Automated Job Loop run a week, Advanced includes three runs a week on your chosen weekdays, and Pro Job Seeker includes one run each calendar day. The US-dollar prices remain $29, $59 and $99 per month. Pricing also offers fixed local monthly amounts in EUR, GBP, INR, AED, CAD, AUD, SGD and JPY. Choose your billing country and currency to see the actual price; the final quoted total includes tax and is confirmed before purchase. These fixed prices are not a live bank exchange-rate estimate. Other countries can pay in US dollars and provide their actual billing country at secure checkout. Each plan supports up to three saved CV variants and guided CV creation. A run is a search and preparation cycle, not a guaranteed number of vacancies, interviews or job offers. Connected source coverage, preparation limits and actual execution reports are shown in your account. AI processing and scheduling require their respective explicit consent; a subscription purchase does not grant those permissions.</p><p>Subscriptions are billed every month in their original purchase currency and automatically renew until cancelled. Selecting another country or currency does not reprice an existing subscription or an already-created checkout. An unused price quote can expire; review a fresh quote and confirm again before a new purchase. No free trial or subscription starts without your explicit purchase. Access starts only when payment is confirmed. A checkout return page or pending payment does not grant access. Failed, overdue, refunded or disputed payments may restrict paid access; your billing page shows the current confirmed status. Cancel monthly renewal in your Automated Job Loop billing settings to stop future renewal. Confirmed paid access continues through the displayed period end unless payment is refunded, disputed or revoked. Pausing or cancelling an Automated Job Loop schedule does not cancel subscription billing. Saved records and earlier outputs remain subject to their existing ownership, source review and document access controls.</p>
    <h2>Passes</h2><p>A pass is a one-time purchase in US dollars: Sprint ($9, 7 days, 25 AI-tailored CVs), Job Search ($19, 30 days, 100) or Career Move ($39, 90 days, 300). It starts when the payment is confirmed and ends when its days run out; tailored CVs left at the end do not carry over. If you buy another pass while one is active, its tailored CVs are added and its days start when the current pass ends. The pass that ends soonest is used first. For fair use, any account can tailor up to 40 CVs a day. A tailored CV counts when the AI prepares a version; a request that fails before any AI work does not count. Nothing renews and there is no subscription.</p>
    <h2>Payment and refunds</h2><p>Dodo Payments sells subscriptions and passes as our merchant of record and handles payment, sales tax and invoices. Cancelling a subscription stops future renewal and does not by itself refund an existing billing period. Ask through our contact page about incorrect charges or service problems; statutory consumer rights remain unaffected. CV passes separately come with a 7-day money-back promise if you have used fewer than 5 tailored CVs; see <Link to="/refund">refunds</Link>. A refunded pass stops working.</p>
    <h2>Application preparation and tracking</h2><p>Jobvance provides application preparation and tracking. It does not promise interviews, employment, recruiter access or automated submission. Employer decisions are outside the service’s control.</p>
    <h2>Cloud loop availability</h2><p>Automated Job Loop is subject to the run limits shown in your account and service availability. The rules mode uses confirmed facts. External models, search and inbox access require their respective configuration and consent. Reports identify unavailable or incomplete stages. A relevance score explains this tool’s comparison; it is not an ATS score or a prediction of hiring. Recurring preparation requires your explicit opt-in and a configured scheduler. The workspace reports the actual next run and execution history. Pause a schedule to stop future scheduling while retaining the current run. Cancel schedule also stops its latest queued or running scheduled job. A separate manual run has its own cancellation control.</p>
    <h2>Current availability</h2><p>These product terms describe the current workflow. Your signed-in billing page confirms whether checkout is available and your current paid access. A price card alone does not start a subscription. Test checkouts are labelled and do not buy live access.</p>
  </div>;
  return <div className="product-prose jv-prose">
    <h2>Automated Job Loop cancellation</h2><p>Use Cancel monthly renewal in your Automated Job Loop billing settings to stop the next renewal. Review the confirmation and the exact paid-through date. Your current confirmed access continues to that date unless the underlying payment is refunded, disputed or revoked. Pausing or cancelling the search schedule does not cancel billing. If cancellation is awaiting confirmation, refresh billing or contact us with your receipt reference; an unconfirmed request is not presented as cancelled.</p><p>Cancellation is not a refund request. For an incorrect or duplicate subscription charge, or a service problem, ask through the <Link to="/contact">contact page</Link> with your Dodo Payments receipt reference. We review the actual payment and service record; mandatory consumer rights remain unaffected. We do not promise a job, interview or hiring outcome.</p>
    <h2>7-day money-back promise</h2><p>If a pass is not right for you, ask for a refund within 7 days of buying it. If you have used fewer than 5 tailored CVs from that pass, we refund it in full. Ask through the <Link to="/contact">contact page</Link> with your Dodo Payments receipt reference.</p>
    <h2>What a refund does</h2><p>Refunds are paid back to your original payment method by Dodo Payments, our merchant of record. A refunded pass stops working straight away, including any tailored CVs left on it, and this also applies to a partial refund. Documents you already downloaded stay yours.</p>
    <h2>Failed requests</h2><p>An AI tailoring request that fails before any AI work is done does not use a tailored CV. A failed request that does not save a usable pack does not use a pack credit. Previously approved documents can be downloaded again at no cost. If you think something was counted wrongly, contact us.</p>
    <h2>Incorrect or duplicate charges</h2><p>For incorrect charges, duplicate purchases or a pass that does not work, contact us with your receipt reference and we will put it right. A refund of an earlier application-pack purchase removes that purchase’s unused packs. No interview or employment outcome is guaranteed, and refunds do not depend on hiring results.</p>
  </div>;
}

const relatedLinks: [string, string][] = [["/faq", "Questions about the Automated Job Loop"], ["/contact", "Contact"], ["/privacy", "Privacy"], ["/terms", "Terms"], ["/refund", "Refunds"], ["/help", "Help"], ["/walkthroughs", "Walkthroughs"]];
const relatedFor: Partial<Record<Kind, string[]>> = { privacy: ["/faq", "/contact", "/terms"], terms: ["/faq", "/contact", "/refund"], refund: ["/contact", "/terms", "/faq"], contact: ["/help", "/walkthroughs", "/privacy"] };

export default function ProductPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  useReveal();
  const start = user ? "/loop" : "/onboarding";
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  const legal = kind === "privacy" || kind === "terms" || kind === "refund";
  const band = kind === "how" || kind === "faq" || kind === "about";
  const path = kind === 'home' ? '/' : kind === 'how' ? '/how-it-works' : `/${kind}`;
  const meta = staticPageMeta(path);
  // One product fragment beside the intro on the explainer pages that would otherwise open on text alone.
  // Contact and privacy get a quiet summary card (real facts from the policy); the explainers get their own product moment.
  const visual = kind === "how" ? <SetupCard /> : kind === "about" ? <CvDiffCard /> : kind === "privacy" ? <aside className="jv-notecard" aria-label="Your information at a glance"><p className="jv-caption">At a glance</p><ol><li><strong>Your file stays on your device</strong><span>The free check reads it locally.</span></li><li><strong>Saving is your choice</strong><span>Nothing is stored in your account until you confirm.</span></li><li><strong>Advertising measurement is optional</strong><span>You can turn it off further down this page.</span></li></ol></aside> : null;
  const contactNote = <aside className="jv-notecard" aria-label="How support works"><p className="jv-caption">How support works</p><ol><li><strong>No account needed</strong><span>Public support needs no name or email.</span></li><li><strong>Keep your receipt code</strong><span>It lets you read the status and any reply.</span></li><li><strong>Kept up to 90 days</strong><span>Your message is read by a person, then removed.</span></li></ol></aside>;
  const visualDecor = kind === "how" || kind === "about";
  const related = (relatedFor[kind] ?? []).map(to => relatedLinks.find(([href]) => href === to)!).filter(Boolean);
  return <main className={`product-page product-page--${kind}${kind === "home" ? "" : " jv-rails"}`}>
    <Helmet><title>{meta?.title ?? `${titles[kind]} | Jobvance`}</title><meta name="description" content={meta?.description ?? intros[kind]} />{meta && <link rel="canonical" href={SITE_ORIGIN + meta.path} />}{meta && <meta property="og:title" content={meta.title} />}{meta && <meta property="og:description" content={meta.description} />}{meta && <meta property="og:url" content={SITE_ORIGIN + meta.path} />}<meta property="og:type" content="website" />{kind === 'notfound' && <meta name="robots" content="noindex,follow" />}</Helmet>
    {kind === "home" ? <HomePage /> : <>
      <div className="jv-page product-inner">
        <header className={`jv-page-head product-page-heading${visual ? " jv-page-head--split" : ""}`}><p className="jv-caption">{labels[kind]}</p><h1 className="jv-page-title jv-enter-h1">{nb(titles[kind])}</h1><p className="jv-lead product-page-intro jv-enter" style={{ "--d": "60ms" } as React.CSSProperties}>{nb(intros[kind] ?? "")}</p>
          {band && <div className="jv-page-actions"><StartLink to={start} /><TextLink to="/check">Try the free CV Check</TextLink></div>}
          {visual && <div className="jv-page-visual" {...(visualDecor ? { "aria-hidden": true } : {})}>{visual}</div>}
        </header>
        {kind === "pricing" ? <SubscriptionPricing /> : <div className="product-main-content">
          {kind === "how" && <>
            <section className="jv-section product-section" aria-labelledby="how-journey-title"><div className="jv-head"><p className="jv-caption">Your Automated Job Loop journey</p><h2 id="how-journey-title" className="jv-section-title">Set it up once. It runs on your schedule.</h2></div><LoopJourney /></section>
            <section className="jv-section product-section" aria-labelledby="how-run-title"><div className="jv-split"><div data-reveal><p className="jv-caption">Every run</p><h2 id="how-run-title" className="jv-section-title">Jobs found. A CV tailored for each.</h2><ul className="jv-ticks"><li>Searches the sources connected to your account for your roles and locations.</li><li>Matches openings to the experience you confirmed.</li><li>Prepares a tailored CV for each prepared role.</li><li>Keeps every job, CV and next step together in your dashboard.</li></ul></div><div className="product-visual" aria-hidden="true"><RunCard /></div></div></section>
            <section className="jv-section product-section" aria-labelledby="how-cv-title"><div className="jv-split"><div className="product-visual" aria-hidden="true"><CvDiffCard /></div><div data-reveal><p className="jv-caption">Every CV</p><h2 id="how-cv-title" className="jv-section-title">Reworded for the job, from your experience.</h2><ul className="jv-ticks"><li>Each CV starts from experience you added, so it stays accurate to you.</li><li>Wording is matched to what the job asks for, line by line.</li><li>Review it, then download PDF, DOCX or TXT from your dashboard.</li></ul></div></div></section>
            <p className="jv-related"><span>Not ready for a schedule?</span><Link to="/check">Try the free CV Check</Link><Link to="/job-loop">See the Automated Job Loop in depth</Link></p>
          </>}
          {kind === "faq" && <div className="jv-faq jv-faq--wide product-faqs" data-reveal>{faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><span className="jv-faq-toggle" aria-hidden="true"><Plus /></span></summary><p>{answer}</p></details>)}</div>}
          {kind === "about" && <div className="product-about"><p className="product-large-copy" data-reveal>Jobvance automates the repetitive part of a job search. Choose your roles and locations once, and <span className="jv-nb">Automated Job Loop</span> finds matching jobs and prepares a tailored, role-specific CV for each, built from your own experience.</p>
            <ol className="jv-steps product-about-principles"><li><p className="jv-caption">01 / Source</p><h2>Your experience, every time</h2><p>Every CV is reworded from experience you added, so it stays accurate to you.</p></li><li><p className="jv-caption">02 / Schedule</p><h2>Jobs on your schedule</h2><p>Pick roles, locations and a weekly, three-times-weekly or daily pace. Runs happen in the background.</p></li><li><p className="jv-caption">03 / Result</p><h2>A CV for each role</h2><p>Each prepared role comes with its own tailored CV, ready to download.</p></li></ol></div>}
          {kind === "contact" && <><div className="jv-contact-grid"><GuestSupport />{contactNote}</div>{support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) && <div className="product-contact-box"><a className="jv-link" href={`mailto:${support}`}><span>Email Jobvance support</span><ArrowUpRight aria-hidden="true" /></a></div>}</>}
          {legal && <LegalLayout kind={kind} />}
          {kind === "notfound" && <div className="product-notfound"><p className="product-404" aria-hidden="true">404</p><p>The address does not match an available page. <Link to="/">Return to Jobvance</Link>.</p><StartLink to={start} /></div>}
          {related.length > 0 && <nav className="jv-related" aria-label="Related pages"><span>Related</span>{related.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav>}
        </div>}
      </div>
      {band && <CtaBar start={start} />}
      {(kind === "contact" || kind === "privacy") && <CtaBar start={start} heading="Back to your search?" body="Choose your roles and locations once. Automated Job Loop does the repeat work." secondary={false} />}
    </>}
  </main>;
}
