import { useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, Copy, Download, FileCheck2, Mail, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PilotDemo from "@/pages/PilotDemo";
import { PILOT_CONTACT, preparePilotRequest, type PilotAudience } from "@/lib/pilot-request";

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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Helmet>
        <title>Free career-transition pilot & fictional demo | Jobvance</title>
        <meta name="description" content="Explore a fictional two-role application demo and request a free, guided Jobvance pilot discussion for UAE professionals and career coaches." />
        <link rel="canonical" href="https://jobvance.io/pilot" />
      </Helmet>
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]" aria-labelledby="pilot-title">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" /> Free, guided research pilot
          </span>
          <h1 id="pilot-title" className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl">Two career directions.<br /><span className="text-primary">One consistent story.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Considering strategy and transformation roles in the UAE? Explore how your real experience can support two different applications, with every factual change open to review.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><a href="#demo">Try the fictional demo <ArrowDown className="ml-2 h-4 w-4" /></a></Button>
            <Button asChild variant="outline" size="lg"><a href="#request">Prepare a pilot request <ArrowRight className="ml-2 h-4 w-4" /></a></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Free participation · No card · You decide what to share</p>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">One record, two perspectives</p>
          <div className="mt-5 rounded-xl border bg-muted/40 p-4">
            <div className="flex items-center gap-3"><FileCheck2 className="h-5 w-5 text-primary" /><strong>Alex Morgan</strong></div>
            <p className="mt-2 text-sm text-muted-foreground">Fictional consultant · Example Advisory</p>
            <p className="mt-4 text-sm leading-6">Helped design a pilot. Created a workstream tracker. Prepared leadership briefings.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"><p className="font-semibold">Strategy</p><p className="mt-1 text-sm text-muted-foreground">Choices & analysis</p></div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950"><p className="font-semibold">Transformation</p><p className="mt-1 text-sm text-muted-foreground">Planning & rollout</p></div>
          </div>
          <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />The emphasis changes. Contribution and result status stay grounded in the source.</p>
          <p className="mt-4 text-xs text-muted-foreground">Illustration using fictional facts. No customer results or live vacancies.</p>
        </div>
      </section>

      <div className="my-10 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <strong>What is available here:</strong> a prewritten, interactive concept demonstration. The guided pilot is an early research workflow with human review. This page does not run a live AI agent, search your inbox, apply for jobs or guarantee interviews.
      </div>

      <section aria-labelledby="pilot-fit" className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6"><Users className="h-6 w-6 text-primary" /><h2 id="pilot-fit" className="mt-4 text-xl font-semibold">For experienced professionals</h2><p className="mt-3 leading-7 text-muted-foreground">You have a career record to work from and are considering two plausible role directions. Help us test whether preparation is clearer and less repetitive.</p></div>
        <div className="rounded-2xl border bg-card p-6"><MessageCircle className="h-6 w-6 text-primary" /><h2 className="mt-4 text-xl font-semibold">For career coaches</h2><p className="mt-3 leading-7 text-muted-foreground">You already review client applications. Explore a fictional example first, then discuss a small task comparison with a consenting participant.</p></div>
      </section>

      <section aria-labelledby="pilot-format" className="my-14">
        <h2 id="pilot-format" className="text-2xl font-semibold sm:text-3xl">A small, practical pilot</h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">Start with a short discussion. If the fit is right, agree a preparation task and optional follow-up feedback over two weeks. Participation is voluntary and by mutual agreement.</p>
        <ol className="mt-6 grid gap-5 md:grid-cols-3">{stages.map(stage => <li key={stage.number} className="rounded-2xl border bg-card p-6"><span className="text-sm font-semibold text-primary">{stage.number}</span><h3 className="mt-3 text-lg font-semibold">{stage.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{stage.text}</p></li>)}</ol>
        <p className="mt-4 text-sm text-muted-foreground">We are testing preparation effort and useful review controls. No testimonials, placement claims or measured time savings are implied.</p>
      </section>

      <section aria-label="Fictional application demonstration"><PilotDemo /></section>

      <section id="request" className="mt-16 scroll-mt-48 rounded-3xl border bg-card p-6 sm:scroll-mt-32 sm:p-9" aria-labelledby="request-title">
        <div className="grid gap-9 lg:grid-cols-[0.8fr_1.2fr]">
          <div><p className="text-sm font-medium text-primary">No payment, no automatic send</p><h2 id="request-title" className="mt-3 text-2xl font-semibold sm:text-3xl">Prepare a free pilot request</h2><p className="mt-4 leading-7 text-muted-foreground">This creates a draft on this page. Review it, then choose whether to open your email app or download the text. It does not register you or reserve a session.</p><p className="mt-4 text-sm leading-6 text-muted-foreground">These form details are held only in this page’s memory until you leave or reload. They are not submitted to Jobvance by this form. Please do not include a CV, employer-confidential information or private client data.</p><p className="mt-4 text-sm leading-6">Your chosen email app sends to <a href={`mailto:${PILOT_CONTACT}`} className="break-all text-primary underline">{PILOT_CONTACT}</a> only if you send the draft yourself.</p></div>
          <form onSubmit={prepare} className="space-y-5">
            <div><label htmlFor="pilot-name" className="mb-2 block text-sm font-medium">Your name <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="pilot-name" autoComplete="name" maxLength={80} value={name} onChange={e => { setName(e.target.value); resetDraft(); }} /></div>
            <div><label htmlFor="pilot-audience" className="mb-2 block text-sm font-medium">I’m exploring this as</label><select id="pilot-audience" value={audience} onChange={e => { setAudience(e.target.value as PilotAudience); resetDraft(); }} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="professional">A professional considering a career move</option><option value="coach">A career coach</option></select></div>
            <div><label htmlFor="pilot-directions" className="mb-2 block text-sm font-medium">Role directions or preparation task</label><Textarea id="pilot-directions" required maxLength={500} rows={3} placeholder="For example: strategy and transformation roles, or reviewing two client CV versions." value={directions} onChange={e => { setDirections(e.target.value); resetDraft(); }} /><p className="mt-1 text-xs text-muted-foreground">A brief description is enough. No private career documents at this stage.</p></div>
            <div><label htmlFor="pilot-availability" className="mb-2 block text-sm font-medium">Possible discussion times and timezone <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="pilot-availability" maxLength={160} placeholder="For example: weekday afternoons, UAE time." value={availability} onChange={e => { setAvailability(e.target.value); resetDraft(); }} /></div>
            <Button type="submit" className="min-h-11">Prepare request draft <ArrowRight className="ml-2 h-4 w-4" /></Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {request ? <div className="rounded-xl border bg-muted/30 p-5"><p role="status" className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 text-primary" />Draft prepared. Nothing has been sent.</p><pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-6">{request.text}</pre><div className="mt-5 flex flex-wrap gap-3"><Button asChild><a href={request.href}><Mail className="mr-2 h-4 w-4" />Open email draft</a></Button><Button type="button" variant="outline" onClick={copyRequest}><Copy className="mr-2 h-4 w-4" />Copy request</Button><Button type="button" variant="outline" onClick={downloadRequest}><Download className="mr-2 h-4 w-4" />Download request</Button></div><p className="mt-3 text-xs leading-5 text-muted-foreground">If your email app is unavailable, copy or download the draft. A prepared draft is not a received pilot request.</p>{copyStatus ? <p className="mt-3 text-sm" role="status">{copyStatus}</p> : null}</div> : null}
          </form>
        </div>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-2" aria-label="Pilot questions">
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">What stays under my control?</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">What you share, which wording you approve, and whether you apply or send a message. The fictional demo stays in your browser. You can reload to reset it.</p></details>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Can I use the existing free workspace?</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">Yes. The current workspace offers private CV upload, reviewed preparation, downloads and manual tracking. The richer career-record demo on this page illustrates a proposed workflow. <Link to="/auth" className="text-primary underline">Sign in or create an account</Link>.</p></details>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Will you read my inbox or contact recruiters?</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">No. This pilot page has no Gmail or LinkedIn connection and sends no outreach. Any future research task involving selected messages will need your explicit agreement.</p></details>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">Is there a fee or outcome guarantee?</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">The research pilot is free. No card or payment is requested. Hiring decisions and interview outcomes are outside Jobvance’s control.</p></details>
      </section>
    </main>
  );
}
