import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, CheckCircle2, Clock3, Sparkles, Zap, RotateCcw } from "lucide-react";
import { PlanName, PLAN_LIMITS, getPlanLabel } from "@/utils/plans";
import { JobFetchState } from "@/lib/dashboard-api";
import { trackEvent } from "@/utils/analytics";
import { format } from "date-fns";

interface JobFetchTriggerProps {
  plan: PlanName;
  jobFetch?: JobFetchState;
  onTrigger: () => Promise<JobFetchState>;
  onViewNewJobs: () => void;
}

export const JobFetchTrigger = ({ plan, jobFetch, onTrigger, onViewNewJobs }: JobFetchTriggerProps) => {
  const [localState, setLocalState] = useState<JobFetchState | undefined>(jobFetch);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setLocalState(jobFetch);
  }, [jobFetch]);

  const quotaLabel = useMemo(() => {
    const used = localState?.status === "cooldown" || localState?.status === "success";
    const remaining = used ? 0 : 1;
    return `${remaining}/1 · ${getPlanLabel(plan)} plan`;
  }, [localState, plan]);

  const nextResetLabel = useMemo(() => {
    if (!localState?.nextAvailableAt) return null;
    try {
      return format(new Date(localState.nextAvailableAt), "MMM d, h:mm a");
    } catch (error) {
      return null;
    }
  }, [localState?.nextAvailableAt]);

  const handleTrigger = async () => {
    setIsProcessing(true);
    trackEvent("fetch_jobs_click", { plan });
    try {
      const result = await onTrigger();
      setLocalState(result);
      trackEvent("fetch_jobs_success", { plan, count: result.jobsFound });
    } catch (error) {
      if ((error as { code?: string }).code === "FETCH_COOLDOWN") {
        setLocalState(jobFetch);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const renderButtonContent = () => {
    if (isProcessing || localState?.status === "fetching") {
      return (
        <>
          <Sparkles className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Fetching…
        </>
      );
    }

    if (localState?.status === "success") {
      return (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
          Found {localState.jobsFound} jobs
        </>
      );
    }

    if (localState?.status === "cooldown") {
      return (
        <>
          <Clock3 className="mr-2 h-4 w-4" aria-hidden />
          Available again soon
        </>
      );
    }

    return (
      <>
        <Zap className="mr-2 h-4 w-4" aria-hidden />
        Fetch today\'s jobs
      </>
    );
  };

  const isDisabled =
    isProcessing ||
    localState?.status === "fetching" ||
    localState?.status === "cooldown";

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-[var(--brand-from)]" aria-hidden />
            Daily Job Fetch
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Your personalized crawler gathers fresh listings once per day. Use it to instantly populate the opportunities table.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="rounded-full border-dashed">
              {quotaLabel}
            </Badge>
            {PLAN_LIMITS[plan].appsPerDay > 0 && (
              <span className="flex items-center gap-1">
                <RotateCcw className="h-3 w-3" aria-hidden />
                Resets every 24 hours
              </span>
            )}
            {nextResetLabel && localState?.status === "cooldown" && (
              <span className="flex items-center gap-1">
                Next reset: {nextResetLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <Button
            onClick={handleTrigger}
            disabled={isDisabled}
            className="w-full rounded-full bg-[var(--brand-from)] px-6 text-white hover:bg-[var(--brand-from)]/90 md:w-auto"
          >
            {renderButtonContent()}
          </Button>

          {localState?.status === "success" && (
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-full" onClick={onViewNewJobs}>
                View new jobs
              </Button>
              <Progress value={100} className="h-1.5 w-32" />
            </div>
          )}

          {localState?.status === "cooldown" && nextResetLabel && (
            <p className="text-xs text-muted-foreground">Available again at {nextResetLabel}</p>
          )}

          {plan === "free" && (
            <p className="text-xs text-muted-foreground">
              Available once per day · free plan
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
