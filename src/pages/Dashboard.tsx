import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PremiumDashboardLayout } from "@/components/dashboard/PremiumDashboardLayout";
import { PremiumJobsTable } from "@/components/dashboard/PremiumJobsTable";
import { PremiumKPICards } from "@/components/dashboard/PremiumKPICards";
import { SearchAndFilters } from "@/components/dashboard/SearchAndFilters";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ResumeVariantManager } from "@/components/dashboard/ResumeVariantManager";
import { JobFetchTrigger } from "@/components/dashboard/JobFetchTrigger";
import { JobDetailsDrawer } from "@/components/dashboard/JobDetailsDrawer";
import { useToast } from "@/hooks/use-toast";
import SEOHead from "@/components/SEOHead";
import {
  DashboardApiError,
  DashboardFilters,
  DashboardRange,
  DashboardResponse,
  JobFetchState,
  fetchDashboardData,
  triggerJobFetch,
  fetchPreferences,
  updatePreferences,
} from "@/lib/dashboard-api";
import { normalizePlanName, PlanName } from "@/utils/plans";
import { trackEvent } from "@/utils/analytics";

interface UserProfile {
  plan: string;
  subscription_status?: string;
}

const filterCount = (filters: DashboardFilters) => {
  let total = 0;
  if (filters.remote) total += 1;
  if (filters.recent) total += 1;
  if (filters.visaSponsorship !== undefined) total += 1;
  if (filters.salaryThreshold) total += 1;
  total += filters.employmentTypes?.length ?? 0;
  total += filters.seniorityLevels?.length ?? 0;
  total += filters.locations?.length ?? 0;
  return total;
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [profileLoading, setProfileLoading] = useState(true);
  const [plan, setPlan] = useState<PlanName>("free");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const initialRangeParam = (searchParams.get("range") as DashboardRange) || "7d";
  const [range, setRange] = useState<DashboardRange>(initialRangeParam);

  const jobTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const checkProfile = async () => {
      try {
        const { data: interestData, error: interestError } = await supabase
          .from("interest_forms")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (interestError) {
          console.error("Error checking interest form:", interestError);
        }

        if (!interestData) {
          setProfileLoading(false);
          return;
        }

        const { data: planSelectionData, error: planSelectionError } = await supabase
          .from("plan_selections")
          .select("id, status")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .maybeSingle();

        if (planSelectionError) {
          console.error("Error checking plan selection:", planSelectionError);
        }

        if (!planSelectionData) {
          navigate("/plan-selection");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("plan, subscription_status")
          .eq("id", user.id)
          .maybeSingle<UserProfile>();

        if (error || !data?.plan) {
          navigate("/plan-selection");
          return;
        }

        const normalized = normalizePlanName(data.plan);
        setPlan(normalized);
      } catch (error) {
        console.error("Error checking profile:", error);
        navigate("/plan-selection");
      } finally {
        setProfileLoading(false);
      }
    };

    checkProfile();
  }, [navigate, user]);

  useEffect(() => {
    if (plan) {
      trackEvent("dashboard_view", { range, plan });
    }
  }, [plan, range]);

  useEffect(() => {
    setSearchParams({ range });
  }, [range, setSearchParams]);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const dashboardQuery = useQuery<DashboardResponse>({
    queryKey: ["dashboard", plan, range, searchQuery, filtersKey],
    queryFn: () => fetchDashboardData({ plan, range, query: searchQuery, filters }),
    enabled: !profileLoading && Boolean(user),
    staleTime: 60_000,
    keepPreviousData: true,
  });

  const preferencesQuery = useQuery({
    queryKey: ["job-preferences"],
    queryFn: fetchPreferences,
    enabled: Boolean(user),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(["job-preferences"], data);
    },
  });

  const jobFetchMutation = useMutation<JobFetchState, DashboardApiError, void>({
    mutationFn: () => triggerJobFetch(plan),
    onSuccess: (state) => {
      queryClient.setQueryData<DashboardResponse | undefined>(
        ["dashboard", plan, range, searchQuery, filtersKey],
        (current) => (current ? { ...current, jobFetch: state } : current),
      );
      dashboardQuery.refetch();
    },
  });

  const handleTriggerFetch = async () => {
    const result = await jobFetchMutation.mutateAsync();
    return result;
  };

  const handleViewJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setDrawerOpen(true);
  };

  const promptUpgrade = () => {
    toast({
      title: "Upgrade required",
      description: "Unlock this feature on the Pro plan.",
    });
    trackEvent("upgrade_modal_show", { source: "dashboard" });
  };

  const dashboardData = dashboardQuery.data;
  const filtersApplied = filterCount(filters);
  const userName = user?.email?.split("@")[0] ?? "there";

  if (profileLoading) {
    return (
      <PremiumDashboardLayout plan={plan}>
        <div className="space-y-6">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted/50" />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      </PremiumDashboardLayout>
    );
  }

  return (
    <>
      <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
      <PremiumDashboardLayout plan={plan}>
        <div className="space-y-8">
          <section className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold text-foreground">Welcome back, {userName}</h1>
              <p className="text-sm text-muted-foreground">
                Track discoveries, tailor resumes, and keep your applications on pace.
              </p>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <JobFetchTrigger
                  plan={plan}
                  jobFetch={dashboardData?.jobFetch}
                  onTrigger={handleTriggerFetch}
                  onViewNewJobs={() => {
                    jobTableRef.current?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <ExportButton plan={plan} />
              </div>
            </div>
            <PremiumKPICards
              kpis={dashboardData?.kpis}
              range={range}
              onRangeChange={setRange}
              plan={plan}
              onUpgrade={promptUpgrade}
            />
          </section>

          <section className="grid gap-8 xl:grid-cols-4">
            <div className="xl:col-span-3 space-y-6" ref={jobTableRef}>
              <SearchAndFilters
                query={searchQuery}
                onQueryChange={setSearchQuery}
                filters={filters}
                onFiltersChange={setFilters}
                preferences={preferencesQuery.data}
                onPreferencesSave={(updates) => updatePreferencesMutation.mutateAsync(updates)}
                preferencesSaving={updatePreferencesMutation.isPending}
              />
              <PremiumJobsTable
                plan={plan}
                jobs={dashboardData?.jobs ?? []}
                totalJobs={dashboardData?.totalJobs ?? 0}
                isLoading={dashboardQuery.isLoading}
                isError={dashboardQuery.isError}
                onRetry={() => dashboardQuery.refetch()}
                onViewJob={handleViewJob}
                onOptimize={(job) => handleViewJob(job.id)}
                onGenerateCv={(job) => handleViewJob(job.id)}
                onUpgrade={promptUpgrade}
                filtersApplied={filtersApplied}
                onResetFilters={() => {
                  setFilters({});
                  setSearchQuery("");
                }}
              />
            </div>
            <div className="space-y-6">
              <ResumeVariantManager userPlan={plan} />
            </div>
          </section>
        </div>
        <JobDetailsDrawer
          jobId={selectedJobId}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          plan={plan}
          onUpgrade={promptUpgrade}
        />
      </PremiumDashboardLayout>
    </>
  );
};

export default Dashboard;
