import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  CalendarClock,
  ExternalLink,
  Sparkles,
  FileText,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  DashboardApiError,
  JobDetail,
  fetchJobDetails,
  requestOptimizeATS,
  requestOptimizedCV,
} from "@/lib/dashboard-api";
import { PlanName, canUseFeature } from "@/utils/plans";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/utils/analytics";

interface JobDetailsDrawerProps {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanName;
  onUpgrade: () => void;
}

const highlightKeywords = (text: string, keywords: string[]) => {
  if (!keywords?.length) return text;
  const pattern = new RegExp(`(${keywords.map((keyword) => keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((segment, index) =>
    keywords.some((keyword) => keyword.toLowerCase() === segment.toLowerCase()) ? (
      <mark key={`${segment}-${index}`} className="rounded-sm bg-[var(--brand-from)]/20 px-1 py-0.5 text-[var(--brand-from)]">
        {segment}
      </mark>
    ) : (
      <span key={`${segment}-${index}`}>{segment}</span>
    ),
  );
};

export const JobDetailsDrawer = ({ jobId, open, onOpenChange, plan, onUpgrade }: JobDetailsDrawerProps) => {
  const { toast } = useToast();

  const { data, isLoading, isError, refetch } = useQuery<JobDetail>({
    queryKey: ["job-detail", jobId],
    queryFn: () => fetchJobDetails(jobId as string),
    enabled: open && Boolean(jobId),
  });

  useEffect(() => {
    if (open && jobId) {
      trackEvent("row_view_jd", { jobId });
    }
  }, [open, jobId]);

  const optimizeMutation = useMutation<{ atsScore: number; suggestions: string[] }, DashboardApiError, void>({
    mutationFn: () => requestOptimizeATS(plan),
    onSuccess: (payload) => {
      toast({
        title: "ATS recommendations ready",
        description: payload.suggestions.join(" · "),
      });
      trackEvent("optimize_ats_click", { jobId, gated: false });
    },
    onError: (error) => {
      if (error?.code === "UPGRADE_REQUIRED") {
        onUpgrade();
        toast({
          title: "Upgrade required",
          description: "ATS optimization unlocks with Pro plans.",
        });
        trackEvent("optimize_ats_click", { jobId, gated: true });
      } else {
        toast({
          title: "Optimization failed",
          description: "We couldn't optimize the ATS score right now.",
          variant: "destructive",
        });
      }
    },
  });

  const optimizedCvMutation = useMutation<{ cvId: string; url: string }, DashboardApiError, void>({
    mutationFn: () => requestOptimizedCV(plan),
    onSuccess: () => {
      toast({
        title: "Optimized CV generated",
        description: "Check your resume vault for the tailored variant.",
      });
      trackEvent("optimized_cv_click", { jobId, gated: false, state: "generate" });
    },
    onError: (error) => {
      if (error?.code === "UPGRADE_REQUIRED") {
        onUpgrade();
        toast({
          title: "Upgrade to generate CVs",
          description: "Optimized resumes are part of the Pro toolkit.",
        });
        trackEvent("optimized_cv_click", { jobId, gated: true, state: "generate" });
      } else {
        toast({
          title: "Generation failed",
          description: "Try again in a moment.",
          variant: "destructive",
        });
      }
    },
  });

  const header = data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-l bg-background sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b pb-4 text-left">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : isError ? (
            <div className="space-y-3">
              <SheetTitle>Couldn't load job details</SheetTitle>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : header ? (
            <>
              <SheetTitle className="text-xl font-semibold leading-tight text-foreground">{header.title}</SheetTitle>
              <SheetDescription className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    <Building2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {header.company.name}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    <MapPin className="mr-1 h-3 w-3" aria-hidden />
                    {header.location}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    <CalendarClock className="mr-1 h-3 w-3" aria-hidden />
                    {new Date(header.postedAt).toLocaleDateString()}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {header.jobBoard}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {header.highlightKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline" className="rounded-full text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </SheetDescription>
            </>
          ) : null}
        </SheetHeader>

        <div className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur px-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="rounded-full"
              onClick={() => (canUseFeature(plan, "optimizeATS") ? optimizeMutation.mutate() : onUpgrade())}
              disabled={optimizeMutation.isPending}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              {optimizeMutation.isPending ? "Optimizing…" : "Optimize ATS"}
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => (canUseFeature(plan, "optimizedCV") ? optimizedCvMutation.mutate() : onUpgrade())}
              disabled={optimizedCvMutation.isPending}
            >
              <FileText className="mr-2 h-4 w-4" aria-hidden />
              {optimizedCvMutation.isPending ? "Generating…" : "Generate CV"}
            </Button>
            <Button variant="outline" className="rounded-full">
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Cover letter
            </Button>
            <Button asChild variant="ghost" className="ml-auto rounded-full">
              <a href={header?.jobUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                Open job
              </a>
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-13rem)] px-1">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          ) : header ? (
            <div className="space-y-6 p-4">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Overview</h3>
                <div className="grid grid-cols-1 gap-3 rounded-xl bg-muted/30 p-4 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Match score</p>
                    <p className="font-semibold">{header.matchScore}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ATS score</p>
                    <p className="font-semibold">{header.atsScore}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Employment type</p>
                    <p className="font-semibold">{header.employmentType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Compensation</p>
                    <p className="font-semibold">
                      {header.salary.min && header.salary.max
                        ? `$${Math.round(header.salary.min / 1000)}k - $${Math.round(header.salary.max / 1000)}k`
                        : "Not disclosed"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Responsibilities</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {header.responsibilities.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Requirements</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {header.requirements.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job description</h3>
                <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  {highlightKeywords(header.description, header.highlightKeywords)}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Benefits</h3>
                <div className="flex flex-wrap gap-2">
                  {header.benefits.map((benefit) => (
                    <Badge key={benefit} variant="secondary" className="rounded-full">
                      <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
