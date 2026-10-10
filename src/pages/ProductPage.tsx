import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FileText, CheckCircle2, FolderOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
type Kind =
  | "home"
  | "pricing"
  | "how"
  | "faq"
  | "about"
  | "contact"
  | "privacy"
  | "terms"
  | "refund"
  | "help"
  | "notfound";
const titles: Record<Kind, string> = {
  home: "Prepare a CV you can stand behind",
  pricing: "Simple application-pack access",
  how: "Your application, step by step",
  faq: "Questions about Jobvance",
  about: "About Jobvance",
  contact: "Contact",
  privacy: "Privacy",
  terms: "Terms of use",
  refund: "Refunds and failed tasks",
  help: "Using your workspace",
  notfound: "Page not found",
};
const steps = [
  "Create your account and confirm your email if prompted.",
  "Upload a PDF, DOCX or TXT CV. Correct the extracted text and save it.",
  "Choose the CV, enter a role, and paste the real job description.",
  "Review the prioritized wording. Verify all facts and approve it.",
  "Download the approved PDF, DOCX or TXT. Submit on the employer’s site.",
  "Save the vacancy in Applications. Record your status, notes and follow-up date.",
];
const faqs = [
  [
    "Does Jobvance apply for me?",
    "You submit on the employer’s site. The tracker records the progress you report. Opening a link does not count as a submission.",
  ],
  [
    "What does tailoring change?",
    "It prioritizes relevant wording already in your CV, preserves factual text and highlights vocabulary for your review. You can edit and approve the final version.",
  ],
  [
    "Can I download my documents?",
    "Approved packs can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded.",
  ],
  [
    "Which files can I upload?",
    "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format.",
  ],
  [
    "Can I purchase more packs?",
    "Jobvance is currently a free beta with one preparation pack per account. Paid passes are not available. The planned pass is a one-time purchase, with no automatic renewal.",
  ],
  [
    "Are interviews or jobs guaranteed?",
    "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control.",
  ],
];
const features = [
  {
    icon: FileText,
    title: "Use your actual experience",
    text: "Upload a readable CV and correct its text before saving.",
  },
  {
    icon: CheckCircle2,
    title: "Review before downloading",
    text: "Check the relevant ordering and wording against your facts, then approve your version.",
  },
  {
    icon: FolderOpen,
    title: "Keep an honest record",
    text: "Save each document with its vacancy and update the progress you report.",
  },
];
export default function ProductPage({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const start = user ? "/dashboard" : "/auth";
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Helmet>
        <title>{titles[kind]} | Jobvance</title>
        <meta
          name="description"
          content="Review your CV, tailor existing experience to a real vacancy, download your documents, and track your applications."
        />
      </Helmet>
      {kind === "home" ? (
        <>
          <section className="mx-auto max-w-3xl py-8 text-center sm:py-16">
            <p className="mb-4 text-sm font-semibold text-primary">
              Your next application, prepared with care
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Prepare a CV you can stand behind.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Bring your experience and a target vacancy. Review relevant
              changes, download the version you approve, and keep your
              applications organized.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to={start}>
                  Start with one free pack{" "}
                  <ArrowRight size={17} className="ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#example">See a worked example</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No card needed for your first pack. You stay in control of every
              fact.
            </p>
            <p className="mt-5 text-sm text-muted-foreground">
              Considering strategy and transformation roles?{" "}
              <Link to="/pilot" className="font-medium text-primary underline">
                Explore the free guided pilot and fictional demo
              </Link>
              .
            </p>
          </section>
          <section
            aria-label="What you can do"
            className="my-10 grid gap-5 md:grid-cols-3"
          >
            {features.map((f) => (
              <Card key={f.title}>
                <CardContent className="p-6">
                  <f.icon className="mb-4 text-primary" />
                  <h2 className="font-semibold">{f.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </section>
          <section
            id="example"
            className="rounded-2xl border bg-muted/30 p-6 sm:p-9"
          >
            <p className="mb-2 text-sm font-medium text-primary">
              Illustrative example — fictional CV
            </p>
            <h2 className="text-2xl font-semibold">
              Relevant experience comes first.
            </h2>
            <p className="mt-3 text-muted-foreground">
              For a vacancy emphasizing reporting, an existing reporting bullet
              can appear before an unrelated administration bullet. Missing
              evidence is a question for you, not an invented achievement.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-background p-5">
                <h3 className="mb-3 font-medium">Original order</h3>
                <p>• Coordinated team meeting schedules.</p>
                <p>• Prepared monthly management reports.</p>
              </div>
              <div className="rounded-lg bg-background p-5">
                <h3 className="mb-3 font-medium">Relevant order</h3>
                <p>• Prepared monthly management reports.</p>
                <p>• Coordinated team meeting schedules.</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              The wording and facts are retained. This example is not a customer
              outcome.
            </p>
          </section>
        </>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-semibold sm:text-4xl">
            {titles[kind]}
          </h1>
          {kind === "pricing" && (
            <div className="grid max-w-4xl gap-6 md:grid-cols-2">
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-xl font-semibold">Try one pack</h2>
                  <p className="text-3xl font-semibold">Free</p>
                  <p>
                    One application pack to try the complete review and download
                    workflow. Private CV storage and tracking are included.
                  </p>
                  <Button asChild>
                    <Link to={start}>Start your first pack</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-xl font-semibold">Planned thirty-day pass</h2>
                  <p className="text-3xl font-semibold">
                    $29 <span className="text-base font-normal">once</span>
                  </p>
                  <p>
                    Ten application packs for thirty days. PDF, DOCX and TXT
                    downloads. No automatic renewal or included practitioner
                    review.
                  </p>
                  <Button disabled>Paid pass not available</Button>
                  <p className="text-sm text-muted-foreground">
                    Free beta access is available now. Paid sales have not launched.{" "}
                    <Link className="underline" to="/refund">
                      Refund terms
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
          {(kind === "how" || kind === "help") && (
            <ol className="max-w-3xl space-y-5">
              {steps.map((s, i) => (
                <li key={s} className="rounded-lg border p-4">
                  <strong className="mr-3 text-primary">{i + 1}.</strong>
                  {s}
                </li>
              ))}
            </ol>
          )}
          {kind === "faq" && (
            <div className="max-w-3xl space-y-4">
              {faqs.map(([q, a]) => (
                <details key={q} className="rounded-lg border p-5">
                  <summary className="cursor-pointer font-medium">{q}</summary>
                  <p className="mt-3 text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          )}
          {kind === "about" && (
            <p className="max-w-3xl leading-7 text-muted-foreground">
              Jobvance helps job seekers prepare factual, reviewable CV versions
              for specific vacancies and keep their applications organized.
              Public examples are illustrative; hiring outcomes are not
              guaranteed.
            </p>
          )}
          {kind === "contact" && (
            <div className="max-w-3xl space-y-4">
              <p>
                For help with documents, access or a payment, include the
                relevant record or receipt reference. Please do not send
                passwords, card details or your full CV.
              </p>
              {support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) ? (
                <Button asChild variant="outline">
                  <a href={`mailto:${support}`}>Email Jobvance support</a>
                </Button>
              ) : (
                <p className="text-muted-foreground">
                  Direct support contact details are currently unavailable.
                  Real-money purchases remain disabled until support is
                  available.
                </p>
              )}
            </div>
          )}
          {kind === "privacy" && (
            <div className="max-w-3xl space-y-4 leading-7">
              <p>
                Your account, uploaded CV, extracted text, application documents
                and tracker entries are processed to provide this service.
                Supabase supplies authentication, database and private file
                storage. Real-money payments are currently disabled. If payment
                testing is enabled, the configured processor is Paddle or Stripe;
                Jobvance does not collect full card numbers.
              </p>
              <p>
                You can delete an original CV or a tracker entry in your
                workspace. Original deletion does not remove separately saved
                application packs. Contact support for account erasure or other
                data requests; necessary financial records may require
                retention.
              </p>
              <p>
                This tailoring workflow compares your existing text with the
                description you provide and does not send CV content to an
                external AI service. Do not include confidential employer
                documents or unnecessary sensitive information.
              </p>
              <p>
                Approved documents are retained for your access after pack
                expiry. Public examples use fictional data.{" "}
                <Link to="/contact" className="text-primary underline">
                  Contact and service availability
                </Link>
                .
              </p>
            </div>
          )}
          {kind === "terms" && (
            <div className="max-w-3xl space-y-4 leading-7">
              <p>
                Provide information you have the right to use. Check and approve
                the wording before downloading or submitting. Do not invent
                qualifications, experience or achievements.
              </p>
              <p>
                The pass provides ten saved packs over thirty days after
                confirmed payment. It does not renew automatically. A newly
                saved pack uses one credit; retrying an identical request does
                not use another. Approved versions can be downloaded again
                without another pack charge.
              </p>
              <p>
                Jobvance provides application preparation and tracking. It does
                not promise interviews, employment, recruiter access or
                automated submission. Employer decisions are outside the
                service’s control.
              </p>
              <p>
                These product terms describe the current workflow. Real-money
                checkout remains disabled. Jobvance is currently a free beta;
                the planned commercial pass is not offered for sale.
              </p>
            </div>
          )}
          {kind === "refund" && (
            <div className="max-w-3xl space-y-4 leading-7">
              <p>
                A failed request that does not save a usable pack should not
                consume a credit. Retry the same request after resolving the
                error. Previously approved packs can be downloaded again without
                another credit.
              </p>
              <p>
                For incorrect charges, duplicate purchases or unusable paid
                access, use the published support contact with your receipt
                reference. Confirmed refunds revoke unused credits from the
                relevant purchase and do not erase documents already downloaded.
              </p>
              <p>
                The operator must confirm the final refund window before
                real-money checkout is enabled. No interview or employment
                guarantee is offered.
              </p>
            </div>
          )}
          {kind === "notfound" && (
            <p>
              The address does not match an available page.{" "}
              <Link to="/" className="text-primary underline">
                Return to Jobvance
              </Link>
              .
            </p>
          )}
        </>
      )}
    </main>
  );
}
