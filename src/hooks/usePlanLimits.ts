import { useMemo } from "react";
import { PLAN_LIMITS, PlanName, normalizePlanName, canUseFeature } from "@/utils/plans";

export interface PlanLimitsInfo {
  plan: PlanName;
  resumeLimit: number;
  applicationsPerDay: number;
  visibleRows: number;
  canExport: boolean;
  canOptimize: boolean;
  canGenerateCV: boolean;
}

export const usePlanLimits = (plan?: string | null): PlanLimitsInfo => {
  return useMemo(() => {
    const normalized = normalizePlanName(plan);
    const limits = PLAN_LIMITS[normalized];
    return {
      plan: normalized,
      resumeLimit: limits.resumes,
      applicationsPerDay: limits.appsPerDay,
      visibleRows: limits.visibleRows,
      canExport: canUseFeature(normalized, "export"),
      canOptimize: canUseFeature(normalized, "optimizeATS"),
      canGenerateCV: canUseFeature(normalized, "optimizedCV"),
    };
  }, [plan]);
};
