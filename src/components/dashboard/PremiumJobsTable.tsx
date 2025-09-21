import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  FileText,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  ArrowUpRight,
  Filter,
  LayoutList,
  RefreshCcw,
  Lock,
} from "lucide-react";
import { DashboardJob } from "@/lib/dashboard-api";
import { PlanName, PLAN_LIMITS, canUseFeature } from "@/utils/plans";

interface PremiumJobsTableProps {
  plan: PlanName;
  jobs: DashboardJob[];
  totalJobs: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onViewJob: (jobId: string) => void;
  onOptimize: (job: DashboardJob) => void;
  onGenerateCv: (job: DashboardJob) => void;
  onUpgrade: () => void;
  filtersApplied: number;
  onResetFilters: () => void;
}

const STATUS_VARIANTS: Record<DashboardJob["status"], string> = {
  not_applied: "outline",
  applied: "secondary",
  interview: "default",
  offer: "success",
};

const statusLabel = (status: DashboardJob["status"]) => {
  switch (status) {
    case "applied":
      return "Applied";
    case "interview":
      return "Interview";
    case "offer":
      return "Offer";
    default:
      return "Not applied";
  }
};

export const PremiumJobsTable = ({
  plan,
  jobs,
  totalJobs,
  isLoading,
  isError,
  onRetry,
  onViewJob,
  onOptimize,
  onGenerateCv,
  onUpgrade,
  filtersApplied,
  onResetFilters,
}: PremiumJobsTableProps) => {
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  const visibleRows = PLAN_LIMITS[plan].visibleRows;

  const handleBookmark = (jobId: string) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const empty = !isLoading && jobs.length === 0;

  const headerLabel = useMemo(() => {
    if (isLoading) return "Loading opportunities";
    if (empty) return "No jobs match";
    return `Job opportunities (${jobs.length} of ${totalJobs})`;
  }, [isLoading, empty, jobs.length, totalJobs]);

  return (
    <Card className="overflow-hidden rounded-2xl shadow-sm">
      <CardHeader className="space-y-3 border-b bg-muted/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg font-semibold">{headerLabel}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full" onClick={onResetFilters}>
                  <RefreshCcw className="mr-2 h-4 w-4" aria-hidden />
                  Reset filters
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear search and preference filters</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" className="rounded-full">
              <Filter className="mr-2 h-4 w-4" aria-hidden />
              Columns
            </Button>
            <Button variant="outline" size="sm" className="rounded-full">
              <LayoutList className="mr-2 h-4 w-4" aria-hidden />
              Density
            </Button>
            <Badge variant="secondary" className="rounded-full">
              {filtersApplied} filters
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {plan === "free"
            ? "Free plan shows the top 2 matches. Upgrade to reveal the full list and enable automation features."
            : plan === "pro"
            ? "Pro unlocks 20 visible matches per fetch with 30 more preview rows."
            : "Elite members see the top 50 matches with priority updates."}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">We couldn\'t load jobs right now.</p>
            <Button onClick={onRetry}>Retry</Button>
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-base font-medium text-foreground">No jobs match your filters</p>
              <p className="text-sm text-muted-foreground">Try widening your filters or adjusting your preferences.</p>
            </div>
            <Button variant="outline" onClick={onResetFilters}>
              Reset filters
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[260px]">Position</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>ATS Score</TableHead>
                  <TableHead>JD Preview</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job, index) => {
                  const gated = index >= visibleRows;
                  const maskedClass = gated ? "opacity-30 pointer-events-none select-none" : "";
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onDoubleClick={() => !gated && onViewJob(job.id)}
                    >
                      <TableCell>
                        <div className={`flex flex-col gap-1 ${maskedClass}`}>
                          <span className="font-medium text-sm text-foreground">{job.title}</span>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="rounded-full text-xs">
                              {job.remoteType}
                            </Badge>
                            <Badge variant="outline" className="rounded-full text-xs">
                              {job.employmentType}
                            </Badge>
                            <Badge variant="secondary" className="rounded-full text-xs">
                              {job.jobBoard}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex flex-col ${maskedClass}`}>
                          <span className="text-sm font-medium">{job.company.name}</span>
                          <span className="text-xs text-muted-foreground">{job.company.industry}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm text-muted-foreground ${maskedClass}`}>{job.location}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${maskedClass}`}>
                          {job.salary.min && job.salary.max
                            ? `$${Math.round(job.salary.min / 1000)}k - $${Math.round(job.salary.max / 1000)}k`
                            : job.salary.min
                            ? `$${Math.round(job.salary.min / 1000)}k`
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={`flex flex-col ${maskedClass}`}>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-[var(--brand-from)]"
                                style={{ width: `${job.matchScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">{job.matchScore}%</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {job.matchedSkills.slice(0, 3).join(", ")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex flex-col ${maskedClass}`}>
                          <span className="text-sm font-medium">{job.atsScore}%</span>
                          <span className="text-xs text-muted-foreground">Estimated alignment</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className={`line-clamp-2 text-sm text-muted-foreground ${maskedClass}`}>{job.descriptionPreview}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[job.status]} className={maskedClass}>
                          {statusLabel(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {gated ? (
                          <Button size="sm" className="rounded-full" onClick={onUpgrade}>
                            Upgrade
                          </Button>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleBookmark(job.id)}
                                  aria-label={savedJobs.has(job.id) ? "Remove bookmark" : "Save job"}
                                >
                                  {savedJobs.has(job.id) ? (
                                    <BookmarkCheck className="h-4 w-4" />
                                  ) : (
                                    <Bookmark className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Save job</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onViewJob(job.id)}
                                  aria-label="View job details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open job drawer</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    canUseFeature(plan, "optimizeATS") ? onOptimize(job) : onUpgrade()
                                  }
                                  aria-label={canUseFeature(plan, "optimizeATS") ? "Optimize ATS" : "Upgrade for ATS"}
                                >
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {canUseFeature(plan, "optimizeATS")
                                  ? "Optimize ATS score"
                                  : "Pro unlocks ATS optimization"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    canUseFeature(plan, "optimizedCV") ? onGenerateCv(job) : onUpgrade()
                                  }
                                  aria-label={canUseFeature(plan, "optimizedCV") ? "Generate optimized CV" : "Upgrade for optimized CV"}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {canUseFeature(plan, "optimizedCV")
                                  ? "Generate tailored resume"
                                  : "Upgrade to generate optimized CVs"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Open original job"
                                >
                                  <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open job posting</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
