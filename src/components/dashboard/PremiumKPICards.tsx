import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Target, BarChart3, LineChart, Zap, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardKPIs, DashboardRange } from "@/lib/dashboard-api";
import { PlanName } from "@/utils/plans";

const RANGE_PILLS: { label: string; value: DashboardRange; description: string }[] = [
  { label: "Today", value: "1d", description: "View today's activity" },
  { label: "7 Days", value: "7d", description: "Week to date" },
  { label: "30 Days", value: "30d", description: "Month to date" },
  { label: "All Time", value: "all", description: "Lifetime performance" },
];

interface PremiumKPICardsProps {
  kpis: DashboardKPIs | undefined;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  plan: PlanName;
  onUpgrade: () => void;
}

export const PremiumKPICards = ({ kpis, range, onRangeChange, plan, onUpgrade }: PremiumKPICardsProps) => {
  const metricCards = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        title: "Jobs Discovered",
        value: kpis.discovered.value.toLocaleString(),
        delta: kpis.discovered.delta,
        icon: Target,
      },
      {
        title: "Applications Sent",
        value: kpis.applied.value.toLocaleString(),
        delta: kpis.applied.delta,
        icon: BarChart3,
      },
      {
        title: "Response Rate",
        value: `${kpis.responseRate.value}%`,
        delta: kpis.responseRate.delta,
        icon: LineChart,
      },
    ];
  }, [kpis]);

  const isFreePlan = plan === "free";

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Your pipeline at a glance</h2>
          <p className="text-muted-foreground text-sm">Range comparisons update in real-time when you adjust the pills.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_PILLS.map((pill) => {
            const active = pill.value === range;
            return (
              <Button
                key={pill.value}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => onRangeChange(pill.value)}
                className={cn(
                  "rounded-full px-4 text-sm",
                  active
                    ? "bg-[var(--brand-from)] hover:bg-[var(--brand-from)]/90 text-white shadow"
                    : "border-dashed"
                )}
              >
                {pill.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric, index) => {
          const Icon = metric.icon;
          const positive = metric.delta >= 0;
          return (
            <Card key={metric.title} className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-from)]/10 text-[var(--brand-from)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                      <p className="text-2xl font-semibold tracking-tight">{metric.value}</p>
                    </div>
                  </div>
                  <Badge variant={positive ? "secondary" : "outline"} className={cn("flex items-center gap-1", positive ? "text-emerald-600" : "text-rose-600")}> 
                    {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} {Math.abs(metric.delta)}%
                  </Badge>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Compared to previous period. Keep your automations running to maintain the trend.
                </p>
              </CardContent>
            </Card>
          );
        })}

        <Card className="relative overflow-hidden rounded-2xl shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Analytics Deep-Dive</p>
                <p className="text-xl font-semibold mt-1">Interview funnel insights</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-to)]/10 text-[var(--brand-to)]">
                <Zap className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Unlock conversion tracking, recruiter response speed, and tailored follow-up cadences.
            </p>

            {isFreePlan ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-background/90 backdrop-blur-sm">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Included with Pro</p>
                <Button className="mt-4" onClick={onUpgrade}>
                  Upgrade now
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">Live cohort tracking</p>
                  <p className="text-muted-foreground">Updated every 15 minutes</p>
                </div>
                <Badge variant="default" className="bg-[var(--brand-from)] text-white">
                  {plan === "elite" ? "Elite" : "Pro"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
