import { useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, Copy, Download, FileCheck2, Layers3, LockKeyhole, Mail, MessageCircle, Route, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PilotDemo from "@/pages/PilotDemo";
import { PILOT_CONTACT, preparePilotRequest, type PilotAudience } from "@/lib/pilot-request";
import "./AccountPilot.css";

const stages = [
  { number: "01", title: "Choose two directions", text: "Explore strategy and transformation roles using the same career facts." },
  { number: "02", title: "Review the wording", text: "Check your contribution, result status and what you want to keep private." },
  { number: "03", title: "Prepare your next step", text: "Review an application packet and keep its version with the role." },
];

export default function PilotLanding() {
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<PilotAudience>("professional");
  const [directions, setDirections] = useState("");
  const [availability, setAvailability] = useState("");
  const [request, setRequest] = useState<ReturnType<typeof preparePilotRequest> | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function resetDraft() { setRequest(null); setError(""); setCopyStatus(""); }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopyStatus("");
    try { setRequest(preparePilotRequest({ name, audience, directions, availability })); setError(""); }
    catch (reason) { setRequest(null); setError(reason instanceof Error ? reason.message : "Check the request details."); }
  }
  async function copyRequest() {
    if (!request) return;
    try { await navigator.clipboard.writeText(request.text); setCopyStatus("Request copied. Nothing has been sent."); }
    catch { setCopyStatus("Copy is unavailable here. Select the draft text below or download it."); }
  }
  function downloadRequest() {
    if (!request) return;
    const url = URL.createObjectURL(new Blob([request.text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "Jobvance-pilot-request-UNSENT.txt"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="jv-pilot">
      <Helmet>
        <title>Free career-transition pilot & fictional demo | Jobvance</title>
        <meta name="description" content="Explore a fictional two-role application demo and request a free, guided Jobvance pilot discussion for UAE professionals and career coaches." />
        <link rel="canonical" href="https://jobvance.io/pilot" />
      </Helmet>
      <section className="ap-pilot-hero" aria-labelledby="pilot-title">
        <div className="ap-pilot-intro">
          <p className="ap-eyebrow"><span className="ap-dot" aria-hidden="true" /> THE FREE RESEARCH PILOT</p>
          <h1 id="pilot-title">Two directions.<br /><span>One true story.</span></h1>
          <p>Considering strategy and transformation roles in the UAE? Explore two ways to present your experience, while keeping your contribution and every factual change open to review.</p>
          <div className="ap-pilot-actions">
            <Button asChild className="ap-primary"><a href="#demo">Try the fictional demo <ArrowDown size={16} aria-hidden="true" /></a></Button>
            <Button asChild variant="outline" className="ap-outline"><a href="#request">Prepare a pilot request <ArrowRight size={16} aria-hidden="true" /></a></Button>
          </div>
          <p className="ap-pilot-promise"><span><Check size={13} aria-hidden="true" /> Free participation</span><span><Check size={13} aria-hidden="true" /> No card</span><span><Check size={13} aria-hidden="true" /> You choose what to share</span></p>
        </div>
        <figure className="ap-career-board" aria-label="Fictional career record illustrated in two role directions">
          <figcaption className="ap-board-caption"><span>ONE RECORD. TWO PERSPECTIVES.</span><span className="ap-fiction-tag"><FileCheck2 size={12} aria-hidden="true" /> FICTIONAL EXAMPLE</span></figcaption>
          <div className="ap-source-record">
            <div className="ap-source-profile"><span className="ap-profile-monogram" aria-hidden="true">AM</span><div><strong>Alex Morgan</strong><p>Fictional consultant · Example Advisory</p></div><span className="ap-source-number">SRC–01</span></div>
            <blockquote className="ap-source-quote">Helped design a procurement pilot across 5 business units, with <mark>8% projected savings.</mark></blockquote>
            <div className="ap-claim-labels"><span>Contribution: helped design</span><span>Result: projected</span></div>
          </div>
          <div className="ap-board-connector" aria-hidden="true"><ArrowDown size={20} /></div>
          <div className="ap-direction-grid">
            <div className="ap-direction"><span>DIRECTION 01</span><strong><Route size={17} aria-hidden="true" /> Strategy</strong><p>Bring business-case design and briefing preparation forward.</p></div>
            <div className="ap-direction ap-direction--ink"><span>DIRECTION 02</span><strong><Layers3 size={17} aria-hidden="true" /> Transformation</strong><p>Bring workstream tracking and pilot design support forward.</p></div>
          </div>
          <p className="ap-board-rule"><ShieldCheck size={16} aria-hidden="true" />The emphasis changes. Support stays support, and a projected result stays projected. No real candidate, customer result or live vacancy is shown.</p>
        </figure>
      </section>

      <aside className="ap-pilot-disclosure" aria-label="What is available here">
        <FileCheck2 size={21} aria-hidden="true" />
        <div><strong>A concept to try. A pilot to shape together.</strong><p>The interactive example is prewritten. The guided pilot is an early research workflow with human review, by mutual agreement. This page does not run a live AI agent, search your inbox, apply for jobs or guarantee interviews.</p></div>
      </aside>

      <section className="ap-audience-section" aria-labelledby="pilot-fit">
        <div className="ap-section-heading"><div><p className="ap-eyebrow">WHO IT IS FOR</p><h2 id="pilot-fit">A thoughtful next move.</h2></div><p>For people with experience to draw on, and coaches helping them make that experience clearer.</p></div>
        <div className="ap-audience-grid">
          <article className="ap-audience"><span className="ap-audience-icon"><Users size={21} aria-hidden="true" /></span><div><h3>Experienced professionals</h3><p>You have a career record to work from and are considering two plausible role directions. Help us test whether preparation is clearer and less repetitive.</p></div></article>
          <article className="ap-audience"><span className="ap-audience-icon"><MessageCircle size={21} aria-hidden="true" /></span><div><h3>Career coaches</h3><p>You already review client applications. Explore a fictional example first, then discuss a small task comparison with a consenting participant.</p></div></article>
        </div>
      </section>

      <section className="ap-program" aria-labelledby="pilot-format">
        <div className="ap-section-heading"><div><p className="ap-eyebrow">THE GUIDED PROGRAM</p><h2 id="pilot-format">Small steps.<br />Useful questions.</h2></div><p>Start with a short discussion. If the fit is right, agree a preparation task and optional feedback over two weeks. Participation is voluntary and by mutual agreement.</p></div>
        <ol className="ap-program-steps">{stages.map((stage, index) => <li key={stage.number} className="ap-stage"><div className="ap-stage-top"><span className="ap-stage-number">{stage.number}</span>{index < stages.length - 1 ? <ArrowRight size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}</div><h3>{stage.title}</h3><p>{stage.text}</p></li>)}</ol>
        <p className="ap-program-note"><ShieldCheck size={14} aria-hidden="true" />We are testing preparation effort and useful review controls. No testimonials, placement claims or measured time savings are implied.</p>
      </section>

      <section className="ap-pilot-demo-shell" aria-label="Fictional application demonstration"><PilotDemo /></section>

      <section id="request" className="ap-pilot-request" aria-labelledby="request-title">
        <div className="ap-request-intro">
          <p className="ap-eyebrow">A CONVERSATION TO START</p>
          <h2 id="request-title">Prepare a free<br />pilot request.</h2>
          <p>A little context is enough. Create a draft here, review it, then decide whether to send it yourself. Preparing a draft does not register you or reserve a session.</p>
          <ol className="ap-request-steps"><li><span>01</span> Add a brief, non-confidential outline.</li><li><span>02</span> Prepare and review your request draft.</li><li><span>03</span> Send it yourself, if you choose.</li></ol>
          <p className="ap-request-privacy"><LockKeyhole size={16} aria-hidden="true" /><span>Form details stay only in this page’s memory until you leave or reload. They are not submitted to Jobvance. Please do not include a CV, employer-confidential information or private client data.</span></p>
          <p className="ap-request-email">Your chosen email app sends to <a href={`mailto:${PILOT_CONTACT}`}>{PILOT_CONTACT}</a> only if you send the draft yourself. No payment is requested.</p>
        </div>
        <form onSubmit={prepare} className="ap-pilot-form">
          <div><label htmlFor="pilot-name">Your name <span>(optional)</span></label><Input id="pilot-name" autoComplete="name" maxLength={80} value={name} onChange={e => { setName(e.target.value); resetDraft(); }} /></div>
          <div><label htmlFor="pilot-audience">I’m exploring this as</label><select id="pilot-audience" value={audience} onChange={e => { setAudience(e.target.value as PilotAudience); resetDraft(); }}><option value="professional">A professional considering a career move</option><option value="coach">A career coach</option></select></div>
          <div><label htmlFor="pilot-directions">Role directions or preparation task</label><Textarea id="pilot-directions" required maxLength={500} rows={3} aria-describedby="pilot-directions-help" placeholder="For example: strategy and transformation roles, or reviewing two client CV versions." value={directions} onChange={e => { setDirections(e.target.value); resetDraft(); }} /><p id="pilot-directions-help" className="ap-request-help">A brief description is enough. No private career documents at this stage.</p></div>
          <div><label htmlFor="pilot-availability">Possible discussion times and timezone <span>(optional)</span></label><Input id="pilot-availability" maxLength={160} placeholder="For example: weekday afternoons, UAE time." value={availability} onChange={e => { setAvailability(e.target.value); resetDraft(); }} /></div>
          <Button type="submit" className="ap-primary">Prepare request draft <ArrowRight size={16} aria-hidden="true" /></Button>
          {error ? <p role="alert" className="ap-form-error">{error}</p> : null}
          {request ? <div className="ap-prepared-request"><p role="status" className="ap-draft-status"><Check size={16} aria-hidden="true" />Draft prepared. Nothing has been sent.</p><pre>{request.text}</pre><div className="ap-draft-actions"><Button asChild className="ap-primary"><a href={request.href}><Mail size={14} aria-hidden="true" />Open email draft</a></Button><Button type="button" variant="outline" className="ap-outline" onClick={copyRequest}><Copy size={14} aria-hidden="true" />Copy request</Button><Button type="button" variant="outline" className="ap-outline" onClick={downloadRequest}><Download size={14} aria-hidden="true" />Download request</Button></div><p className="ap-request-help">If your email app is unavailable, copy or download the draft. A prepared draft is not a received pilot request.</p>{copyStatus ? <p className="ap-copy-status" role="status">{copyStatus}</p> : null}</div> : null}
        </form>
      </section>

      <section className="ap-pilot-faq" aria-labelledby="pilot-faq-title">
        <h2 id="pilot-faq-title">A few things to know.</h2>
        <div className="ap-faq-grid">
          <details><summary>What stays under my control?</summary><p>What you share, which wording you approve, and whether you apply or send a message. The fictional demo stays in your browser. You can reload to reset it.</p></details>
          <details><summary>Can I check my own CV now?</summary><p>Yes. The free CV check compares your reviewed CV text with one vacancy on your device and offers approved downloads. Saving to a private account is optional. The richer career-record demo here illustrates a proposed workflow. <Link to="/check">Start a free CV check</Link>.</p></details>
          <details><summary>Will you read my inbox or contact recruiters?</summary><p>No. This pilot page has no Gmail or LinkedIn connection and sends no outreach. Any future research task involving selected messages will need your explicit agreement.</p></details>
          <details><summary>Is there a fee or outcome guarantee?</summary><p>The research pilot is free. No card or payment is requested. Hiring decisions and interview outcomes are outside Jobvance’s control.</p></details>
        </div>
      </section>
    </main>
  );
}
