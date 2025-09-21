export type PlanName = "free" | "pro" | "elite";

export type PlanFeature =
  | "export"
  | "optimizeATS"
  | "optimizedCV"
  | "analytics"
  | "prioritySupport";

export interface PlanUsageLimits {
  resumes: number;
  appsPerDay: number;
  visibleRows: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanUsageLimits> = {
  free: { resumes: 1, appsPerDay: 2, visibleRows: 2 },
  pro: { resumes: 3, appsPerDay: 20, visibleRows: 20 },
  elite: { resumes: 10, appsPerDay: 50, visibleRows: 50 },
};

const FEATURE_MATRIX: Record<PlanFeature, PlanName[]> = {
  export: ["pro", "elite"],
  optimizeATS: ["pro", "elite"],
  optimizedCV: ["pro", "elite"],
  analytics: ["pro", "elite"],
  prioritySupport: ["elite"],
};

export const normalizePlanName = (plan?: string | null): PlanName => {
  switch (plan?.toLowerCase()) {
    case "pro":
      return "pro";
    case "elite":
      return "elite";
    default:
      return "free";
  }
};

export const getPlanLabel = (plan: PlanName) => {
  switch (plan) {
    case "elite":
      return "Elite";
    case "pro":
      return "Pro";
    default:
      return "Free";
  }
};

export const canUseFeature = (plan: PlanName, feature: PlanFeature) =>
  FEATURE_MATRIX[feature]?.includes(plan) ?? false;

export const isRowVisible = (index: number, plan: PlanName) =>
  index < PLAN_LIMITS[plan].visibleRows;

export const gatedFeatureCopy: Record<PlanFeature, { title: string; description: string }> = {
  export: {
    title: "Export your pipeline",
    description: "Download CSV exports, unlock analytics, and automate follow-ups with Pro.",
  },
  optimizeATS: {
    title: "Boost your ATS score",
    description: "Instant keyword suggestions and tailored resume guidance are available on Pro and Elite plans.",
  },
  optimizedCV: {
    title: "Generate optimized CVs",
    description: "Generate role-specific resume variants instantly once you upgrade.",
  },
  analytics: {
    title: "Deep-dive analytics",
    description: "Response rates, funnel metrics, and interview pacing dashboards unlock on Pro plans.",
  },
  prioritySupport: {
    title: "Priority support",
    description: "Elite members receive 24/7 support and concierge onboarding.",
  },
};

export interface PlanUsageSummary {
  resumes: number;
  applicationsToday: number;
}
