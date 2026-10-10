import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Download,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { configurationError } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  extractCvText,
  uploadCvDocument,
  deleteCvDocument,
  downloadOriginalCv,
} from "@/lib/cv-documents";
import { downloadPack } from "@/lib/document-export";
import { isPaddleClientReady, openPaymentCheckout } from "@/lib/payment-checkout";
import { listLegacyCvs, downloadLegacyCv } from "@/lib/cv-legacy";
import type { ApplicationPack, TrackedApplication } from "@/lib/cv-database";
import {
  loadWorkspace,
  createPack,
  approvePack,
  trackPack,
  addApplication,
  updateApplication,
  deleteApplication,
  applicationStatuses,
  safeEmployerUrl,
  workspaceCounts,
  startCheckout,
  type ApplicationStatus,
} from "@/lib/workspace-api";

type Tab = "cv" | "tailor" | "tracker" | "billing";
const tabs: { id: Tab; label: string }[] = [
  { id: "cv", label: "Your CVs" },
  { id: "tailor", label: "Tailor & download" },
  { id: "tracker", label: "Applications" },
  { id: "billing", label: "Packs & payments" },
];
const dateLabel = (value: string) => new Date(value).toLocaleDateString();

function TrackerRow({
  item,
  run,
}: {
  item: TrackedApplication;
  run: (task: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [followUp, setFollowUp] = useState(
    item.follow_up_at?.slice(0, 10) ?? "",
  );
  const url = safeEmployerUrl(item.job_url);
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h3 className="font-semibold">{item.job_title}</h3>
            <p className="text-sm text-muted-foreground">
              {item.company || "Company not recorded"} · saved{" "}
              {dateLabel(item.created_at)}
            </p>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline"
            >
              Open employer page <ExternalLink size={15} />
            </a>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            Status you report
            <select
              aria-label={`Status for ${item.job_title}`}
              className="block min-h-11 w-full rounded-md border bg-background p-2"
              value={item.status}
              onChange={(e) =>
                void run(
                  () =>
                    updateApplication(item, {
                      status: e.target.value as ApplicationStatus,
                      notes,
                      follow_up_at: followUp
                        ? new Date(`${followUp}T12:00:00Z`).toISOString()
                        : null,
                    }),
                  "Application status saved.",
                )
              }
            >
              {applicationStatuses.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            Follow-up date
            <Input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </label>
        </div>
        <label className="block space-y-2 text-sm">
          Notes
          <Textarea
            value={notes}
            maxLength={5000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Interview details, next action, or a reminder"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void run(
                () =>
                  updateApplication(item, {
                    notes,
                    follow_up_at: followUp
                      ? new Date(`${followUp}T12:00:00Z`).toISOString()
                      : null,
                  }),
                "Notes and reminder saved.",
              )
            }
          >
            Save notes & date
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  "Delete this tracker entry? Your saved CV pack will remain.",
                )
              )
                void run(
                  () => deleteApplication(item),
                  "Tracker entry deleted.",
                );
            }}
          >
            <Trash2 size={15} className="mr-2" />
            Delete entry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Workspace() {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.id === params.get("tab"))
    ? (params.get("tab") as Tab)
    : "cv";
  const [file, setFile] = useState<File | null>(null),
    [cvText, setCvText] = useState(""),
    [resumeId, setResumeId] = useState("");
  const [jobTitle, setJobTitle] = useState(""),
    [company, setCompany] = useState(""),
    [jobUrl, setJobUrl] = useState(""),
    [jd, setJd] = useState("");
  const [selectedId, setSelectedId] = useState(""),
    [reviewText, setReviewText] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const packRequest = useRef(crypto.randomUUID());
  const checkoutRequest = useRef(crypto.randomUUID());
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const query = useQuery({
    queryKey: ["workspace", user?.id],
    queryFn: () => loadWorkspace(user!.id),
    enabled: !!user && !configurationError,
    retry: 1,
  });
  const legacy = useQuery({
    queryKey: ["legacy-cvs", user?.id],
    queryFn: () => listLegacyCvs(user!.id),
    enabled: !!user && tab === "cv" && !configurationError,
    retry: 1,
  });
  const data = query.data;
  const selected = data?.packs.find((p) => p.id === selectedId);
  useEffect(() => {
    setFile(null);
    setCvText("");
    setResumeId("");
    setSelectedId("");
    setReviewText("");
    setConfirmed(false);
    setError("");
    setNotice("");
  }, [user?.id]);
  useEffect(() => {
    if (data?.cvs.length && !resumeId) setResumeId(data.cvs[0].id);
  }, [data?.cvs, resumeId]);
  useEffect(() => {
    setReviewText(selected?.tailored_text ?? "");
    setConfirmed(false);
  }, [selected?.id, selected?.tailored_text]);
  useEffect(() => {
    if (params.get("checkout") === "success")
      setNotice(
        "Checkout returned. Pack access is confirmed by the payment service; refresh if your balance has not updated yet.",
      );
    if (params.get("checkout") === "cancelled")
      setNotice("Checkout was cancelled. No new access was granted.");
  }, [params]);
  // Reconcile a completed checkout through the authenticated backend, never its URL.
  useEffect(() => {
    if (params.get("checkout") !== "success" || !user) return;
    let attempts = 0;
    const timer = setInterval(() => {
      void client.invalidateQueries({ queryKey: ["workspace", user.id] });
      if (++attempts >= 6) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [client, params, user]);

  async function run(
    task: () => Promise<unknown>,
    message: string,
  ): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await client.invalidateQueries({ queryKey: ["workspace", user?.id] });
      setNotice(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The task could not be completed. Please retry.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choosePack(pack: ApplicationPack) {
    setSelectedId(pack.id);
    setParams({ tab: "tailor" });
  }
  async function pickFile(next: File | undefined) {
    if (!next) return;
    setFile(null);
    setCvText("");
    await run(async () => {
      const text = await extractCvText(next);
      setFile(next);
      setCvText(text);
    }, "Review the extracted text, then save your CV.");
  }
  async function generate(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const pack = await createPack({
        resumeId,
        jobTitle,
        company,
        jobUrl,
        jobDescription: jd,
        requestId: packRequest.current,
      });
      setSelectedId(pack.id);
      packRequest.current = crypto.randomUUID();
    }, "Application pack saved. Review every fact before approving it.");
  }
  if (loading)
    return (
      <div className="mx-auto max-w-6xl p-8" role="status">
        Loading your account…
      </div>
    );
  if (!user) return <Navigate to="/auth?next=%2Fdashboard" replace />;
  const counts = workspaceCounts(data?.applications ?? []);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">
            Your job-search workspace
          </p>
          <h1 className="text-3xl font-semibold">
            Prepare. Review. Keep track.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your documents and the progress you record, in one place.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>
      {configurationError && (
        <Alert variant="destructive">
          <AlertDescription>
            Account services are temporarily unavailable. Please try again
            later.
          </AlertDescription>
        </Alert>
      )}
      {query.isLoading && (
        <p role="status" className="my-4">
          Loading your saved records…
        </p>
      )}
      {query.error && (
        <Alert variant="destructive" className="my-4">
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : "Your records could not be loaded."}{" "}
            <button className="underline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
      {data?.entitlementError && <Alert className="my-4"><AlertDescription>{data.entitlementError} Saved CVs, downloads and application tracking remain available.</AlertDescription></Alert>}
      {error && (
        <Alert variant="destructive" className="my-4" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="my-4" role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Saved applications", counts.saved],
            ["Marked applied", counts.applied],
            ["Interviews", counts.interviews],
            ["Packs remaining", data.entitlement?.creditsRemaining ?? "Unavailable"],
          ].map(([label, count]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <nav
        aria-label="Workspace sections"
        className="mb-6 flex flex-wrap gap-2"
      >
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setParams({ tab: t.id })}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </Button>
        ))}
      </nav>
      <fieldset
        disabled={busy || !data || !!configurationError}
        className="min-w-0 space-y-6"
      >
        {tab === "cv" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Upload and review your CV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  PDF, DOCX or TXT, up to 5 MB. You can correct the extracted
                  text before saving it privately. A scanned PDF needs a
                  text-based version.
                </p>
                <label className="block text-sm font-medium">
                  Choose CV file
                  <Input
                    className="mt-2"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => void pickFile(e.target.files?.[0])}
                  />
                </label>
                {file && (
                  <>
                    <label className="block space-y-2 text-sm">
                      Review extracted text
                      <Textarea
                        className="min-h-64"
                        maxLength={60000}
                        value={cvText}
                        onChange={(e) => setCvText(e.target.value)}
                      />
                    </label>
                    <Button
                      onClick={() =>
                        void run(async () => {
                          const cv = await uploadCvDocument(
                            user.id,
                            file,
                            cvText,
                          );
                          setResumeId(cv.id);
                          setFile(null);
                          setCvText("");
                        }, "CV saved privately. You can now tailor it for a vacancy.")
                      }
                    >
                      <Upload size={16} className="mr-2" />
                      Save reviewed CV
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <section aria-label="Saved CVs">
              <h2 className="mb-3 text-xl font-semibold">Saved CVs</h2>
              {data?.cvs.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
                  No CVs saved yet. Upload one above to begin.
                </p>
              )}
              <div className="grid gap-3">
                {data?.cvs.map((cv) => (
                  <Card key={cv.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <h3 className="font-medium">{cv.original_filename}</h3>
                        <p className="text-sm text-muted-foreground">
                          Saved {dateLabel(cv.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void run(
                              () => downloadOriginalCv(cv),
                              "Original CV download started.",
                            )
                          }
                        >
                          <Download size={15} className="mr-2" />
                          Original
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setResumeId(cv.id);
                            setParams({ tab: "tailor" });
                          }}
                        >
                          Tailor this CV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this original CV? Saved application packs will remain.",
                              )
                            )
                              void run(async () => {
                                await deleteCvDocument(cv);
                                if (resumeId === cv.id) setResumeId("");
                              }, "Original CV deleted.");
                          }}
                        >
                          <Trash2 size={15} />
                          <span className="sr-only">
                            Delete {cv.original_filename}
                          </span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
            {legacy.error && (
              <p className="text-sm text-destructive" role="alert">
                Older files could not be loaded.{" "}
                <button
                  onClick={() => void legacy.refetch()}
                  className="underline"
                >
                  Retry older files
                </button>
              </p>
            )}
            {!!legacy.data?.length && (
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">
                  Previously uploaded originals
                </h2>
                <p className="text-sm text-muted-foreground">
                  These files remain unchanged. Import one to review its text
                  for the current workflow.
                </p>
                {legacy.data.map((old) => (
                  <Card key={old.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        {old.original_filename}
                        {old.created_at && (
                          <p className="text-sm text-muted-foreground">
                            {dateLabel(old.created_at)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void run(async () => {
                              const original = await downloadLegacyCv(
                                old,
                                user.id,
                              );
                              const url = URL.createObjectURL(original);
                              const anchor = document.createElement("a");
                              anchor.href = url;
                              anchor.download = original.name;
                              anchor.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }, "Original file download started.")
                          }
                        >
                          Download original
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            void run(async () => {
                              const original = await downloadLegacyCv(
                                old,
                                user.id,
                              );
                              const text = await extractCvText(original);
                              setFile(original);
                              setCvText(text);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }, "Review the imported text, then save your CV.")
                          }
                        >
                          Import for review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
        {tab === "tailor" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Prepare a CV for a real vacancy</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void generate(e)} className="space-y-4">
                  <label className="block space-y-2 text-sm">
                    Your source CV
                    <select
                      required
                      className="min-h-11 w-full rounded-md border bg-background p-2"
                      value={resumeId}
                      onChange={(e) => {
                        setResumeId(e.target.value);
                        packRequest.current = crypto.randomUUID();
                      }}
                    >
                      <option value="">Choose a saved CV</option>
                      {data?.cvs.map((cv) => (
                        <option key={cv.id} value={cv.id}>
                          {cv.original_filename}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm">
                      Job title
                      <Input
                        required
                        minLength={2}
                        maxLength={200}
                        value={jobTitle}
                        onChange={(e) => {
                          setJobTitle(e.target.value);
                          packRequest.current = crypto.randomUUID();
                        }}
                        placeholder="Role you are applying for"
                      />
                    </label>
                    <label className="block space-y-2 text-sm">
                      Company (optional)
                      <Input
                        maxLength={200}
                        value={company}
                        onChange={(e) => {
                          setCompany(e.target.value);
                          packRequest.current = crypto.randomUUID();
                        }}
                      />
                    </label>
                  </div>
                  <label className="block space-y-2 text-sm">
                    Employer application link (optional)
                    <Input
                      type="url"
                      maxLength={2000}
                      value={jobUrl}
                      onChange={(e) => {
                        setJobUrl(e.target.value);
                        packRequest.current = crypto.randomUUID();
                      }}
                      placeholder="https://…"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    Job description
                    <Textarea
                      required
                      minLength={80}
                      maxLength={20000}
                      className="min-h-44"
                      value={jd}
                      onChange={(e) => {
                        setJd(e.target.value);
                        packRequest.current = crypto.randomUUID();
                      }}
                      placeholder="Paste the full responsibilities and requirements"
                    />
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Tailoring prioritizes relevant wording already in your CV.
                    It preserves your facts and highlights vocabulary to review.
                    One saved pack uses one credit; retries of the same request
                    do not use another.
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      !resumeId || !data?.entitlement || data.entitlement.creditsRemaining === 0
                    }
                  >
                    <FileText size={16} className="mr-2" />
                    Prepare application pack
                  </Button>
                  {data?.entitlement?.creditsRemaining === 0 && (
                    <p className="text-sm">
                      No packs remaining.{" "}
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => setParams({ tab: "billing" })}
                      >
                        View pack access
                      </button>
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
            {selected && (
              <Card>
                <CardHeader>
                  <CardTitle>Review: {selected.job_title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    <strong>Wording found:</strong>{" "}
                    {(selected.matched_keywords ?? []).join(", ") ||
                      "No shared keywords found."}
                  </p>
                  <p className="text-sm">
                    <strong>Vocabulary to check:</strong>{" "}
                    {(selected.missing_keywords ?? []).join(", ") ||
                      "None highlighted."}{" "}
                    Include a missing skill only if you genuinely have it.
                  </p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block space-y-2 text-sm">
                      Original CV
                      <Textarea
                        readOnly
                        className="min-h-80"
                        value={selected.original_text}
                      />
                    </label>
                    <label className="block space-y-2 text-sm">
                      Your reviewed version
                      <Textarea
                        className="min-h-80"
                        maxLength={60000}
                        value={reviewText}
                        onChange={(e) => {
                          setReviewText(e.target.value);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I have checked the wording, dates, skills and achievements.
                    This version accurately represents my experience.
                  </label>
                  <Button
                    disabled={!confirmed}
                    onClick={() =>
                      void run(
                        () => approvePack(selected, reviewText),
                        "Reviewed version approved and saved.",
                      )
                    }
                  >
                    <Check size={16} className="mr-2" />
                    Approve & save version
                  </Button>
                  {selected.status === "approved" && (
                    <div className="flex flex-wrap gap-2">
                      {(["pdf", "docx", "txt"] as const).map((format) => (
                        <Button
                          key={format}
                          variant="outline"
                          disabled={reviewText !== selected.tailored_text}
                          onClick={() =>
                            void run(
                              () => downloadPack(selected, format),
                              `${format.toUpperCase()} download started.`,
                            )
                          }
                        >
                          <Download size={16} className="mr-2" />
                          Download {format.toUpperCase()}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        onClick={() =>
                          void run(
                            () => trackPack(selected),
                            "Application saved in your tracker.",
                          )
                        }
                      >
                        Save to applications
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    You submit the application on the employer’s site. Jobvance
                    records only the progress you report.
                  </p>
                </CardContent>
              </Card>
            )}
            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Saved application packs
              </h2>
              {data?.packs.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
                  Your first saved pack will appear here.
                </p>
              )}
              <div className="grid gap-3">
                {data?.packs.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-left hover:bg-muted"
                    onClick={() => choosePack(p)}
                  >
                    <span>
                      <strong>{p.job_title}</strong>
                      <span className="block text-sm text-muted-foreground">
                        {p.company || "Company not recorded"} ·{" "}
                        {dateLabel(p.created_at)}
                      </span>
                    </span>
                    <span className="text-sm">
                      {p.status === "approved"
                        ? "Approved — open & download"
                        : "Draft — review"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === "tracker" && (
          <>
            <p className="text-sm text-muted-foreground">
              Statuses are your own reports. Opening an employer link never
              marks a job as applied.
            </p>
            <Card>
              <CardHeader>
                <CardTitle>Add an application</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const values = new FormData(form);
                    void run(
                      () =>
                        addApplication(user.id, {
                          jobTitle: String(values.get("title")),
                          company: String(values.get("company")),
                          jobUrl: String(values.get("url")),
                        }),
                      "Application saved.",
                    ).then((ok) => {
                      if (ok) form.reset();
                    });
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm">
                      Job title
                      <Input
                        name="title"
                        required
                        minLength={2}
                        maxLength={200}
                      />
                    </label>
                    <label className="block space-y-2 text-sm">
                      Company (optional)
                      <Input name="company" maxLength={200} />
                    </label>
                  </div>
                  <label className="block space-y-2 text-sm">
                    Employer link (optional)
                    <Input
                      name="url"
                      type="url"
                      maxLength={2000}
                      placeholder="https://…"
                    />
                  </label>
                  <Button type="submit">Save application</Button>
                </form>
              </CardContent>
            </Card>
            {data?.applications.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
                No applications recorded yet. Add one above or save an approved
                CV pack.
              </p>
            )}
            {data?.applications.map((item) => (
              <TrackerRow
                key={item.id}
                item={item}
                run={run}
              />
            ))}
          </>
        )}
        {tab === "billing" && data && (
          <Card>
            <CardHeader>
              <CardTitle>Pack access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold">
                {data.entitlement?.creditsRemaining ?? "Unavailable"}{" "}
                <span className="text-base font-normal">packs remaining</span>
              </p>
              {data.entitlement?.expiresAt && (
                <p className="text-sm">
                  Paid access expires {dateLabel(data.entitlement.expiresAt)}.
                  Saved documents remain available.
                </p>
              )}
              <div className="rounded-lg border bg-muted/30 p-5">
                <h3 className="text-xl font-semibold">$29 once</h3>
                <p className="mt-2">
                  Ten application packs for 30 days. No automatic renewal.
                  Includes your review and PDF, DOCX and TXT downloads.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Practitioner review is not included. Purchase access only
                  after you have tried the free pack.
                </p>
              </div>
              {data.entitlement?.billingMode === "test" && (
                <Alert>
                  <AlertDescription>
                    Test checkout: no real money is collected. Do not enter real
                    card details.
                  </AlertDescription>
                </Alert>
              )}
              {(!data.entitlement?.billingConfigured || (data.entitlement.paymentProvider === 'paddle' && !isPaddleClientReady(data.entitlement.billingMode))) && (
                <p role="status">
                  Jobvance is a free beta. Real-money purchases are unavailable. You can still use your
                  existing pack access and saved records.
                </p>
              )}
              <Button
                disabled={!data.entitlement?.billingConfigured || (data.entitlement.paymentProvider === 'paddle' && !isPaddleClientReady(data.entitlement.billingMode))}
                onClick={() =>
                  void run(async () => {
                    setCheckoutAttempted(true);
                    const checkout = await startCheckout(
                      checkoutRequest.current,
                    );
                    await openPaymentCheckout(checkout,()=>void client.invalidateQueries({queryKey:['workspace',user.id]}));
                  }, "Opening secure checkout…")
                }
              >
                <CreditCard size={16} className="mr-2" />
                Buy ten packs
              </Button>
              {checkoutAttempted && (
                <Button variant="outline" onClick={() => {
                  checkoutRequest.current = crypto.randomUUID();
                  setCheckoutAttempted(false);
                  setError("");
                  setNotice("A fresh checkout request is ready. Confirm your balance and that no payment was completed before opening it.");
                }}>
                  Start a new checkout request
                </Button>
              )}
              {checkoutAttempted && <p className="text-sm text-muted-foreground">Retrying Buy ten packs reuses your current request. Start a new request only after checking that the previous checkout did not complete, to avoid a duplicate purchase.</p>}
              <p className="text-sm text-muted-foreground">
                Access changes only after confirmed payment.{" "}
                <Link to="/refund" className="underline">
                  Refund terms
                </Link>{" "}
                ·{" "}
                <Link to="/privacy" className="underline">
                  Privacy
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </fieldset>
      {busy && (
        <div className="mt-4 flex items-center gap-2 text-sm" role="status">
          <Loader2 size={16} className="animate-spin" />
          Saving or processing your request…
        </div>
      )}
    </main>
  );
}
