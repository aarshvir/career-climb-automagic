import { addDays, formatISO, subDays } from "date-fns";
import { PLAN_LIMITS, PlanName, canUseFeature, normalizePlanName } from "../utils/plans";

export type DashboardRange = "1d" | "7d" | "30d" | "all";

export interface DashboardFilters {
  remote?: boolean;
  employmentTypes?: string[];
  salaryThreshold?: number;
  recent?: boolean;
  seniorityLevels?: string[];
  visaSponsorship?: boolean;
  locations?: string[];
}

export interface DashboardJob {
  id: string;
  title: string;
  seniority: string;
  company: {
    name: string;
    logo?: string;
    industry: string;
    size: string;
    website?: string;
    glassdoorUrl?: string;
  };
  location: string;
  employmentType: string;
  remoteType: "Remote" | "Hybrid" | "On-site";
  salary: {
    min?: number;
    max?: number;
    currency: string;
  };
  matchScore: number;
  matchedSkills: string[];
  atsScore: number;
  postedAt: string;
  jobBoard: string;
  description: string;
  status: "not_applied" | "applied" | "interview" | "offer";
  jobUrl: string;
  tags: string[];
  visaSponsorship: boolean;
  descriptionPreview: string;
  highlightKeywords: string[];
  isVisible: boolean;
  isMasked: boolean;
}

export interface DashboardKPIs {
  discovered: { value: number; delta: number };
  applied: { value: number; delta: number };
  responseRate: { value: number; delta: number };
}

export interface JobFetchState {
  status: "idle" | "fetching" | "success" | "cooldown";
  jobsFound: number;
  triggeredAt?: string;
  nextAvailableAt?: string;
}

export interface DashboardResponse {
  kpis: DashboardKPIs;
  jobs: DashboardJob[];
  totalJobs: number;
  plan: { name: PlanName; limits: typeof PLAN_LIMITS[PlanName] };
  usage: { resumes: number; applicationsToday: number };
  jobFetch: JobFetchState;
}

export interface JobDetail extends DashboardJob {
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
}

export interface JobPreferences {
  locations: string[];
  remotePercentage: number;
  titles: string[];
  seniority: string[];
  workTypes: string[];
  salaryRange: { currency: string; min?: number; max?: number };
  industries: string[];
  companySizes: string[];
  visaSponsorship: boolean | null;
  keywordsInclude: string[];
  keywordsExclude: string[];
  excludeCompanies: string[];
  preferredBoards: string[];
  timezone?: string;
  travelPercentage?: number;
  languages: string[];
  workAuthorization?: string;
  relocation?: "willing" | "not_willing" | "open";
  commuteMinutes?: number;
  educationLevels: string[];
  noticePeriod?: string;
}

export interface DashboardApiError extends Error {
  code?: string;
}

const createUpgradeRequiredError = (): DashboardApiError => {
  const error: DashboardApiError = new Error("Upgrade required");
  error.code = "UPGRADE_REQUIRED";
  return error;
};

const BASE_PREFERENCES: JobPreferences = {
  locations: [],
  remotePercentage: 100,
  titles: [],
  seniority: [],
  workTypes: ["Remote"],
  salaryRange: { currency: "USD" },
  industries: [],
  companySizes: [],
  visaSponsorship: null,
  keywordsInclude: [],
  keywordsExclude: [],
  excludeCompanies: [],
  preferredBoards: ["LinkedIn", "Indeed"],
  timezone: "America/New_York",
  travelPercentage: 0,
  languages: ["English"],
  workAuthorization: undefined,
  relocation: "open",
  commuteMinutes: 45,
  educationLevels: [],
  noticePeriod: "2 weeks",
};

type JobFetchRecord = Record<PlanName, JobFetchState>;

const RANGE_WEIGHT: Record<DashboardRange, number> = {
  "1d": 0.3,
  "7d": 1,
  "30d": 2.6,
  all: 4,
};

const JOB_FETCH_KEY = "jobvance_dashboard_fetch_state_v2";
const PREFERENCES_KEY = "jobvance_dashboard_preferences_v2";

const inMemoryJobFetch: JobFetchRecord = {
  free: { status: "idle", jobsFound: 0 },
  pro: { status: "idle", jobsFound: 0 },
  elite: { status: "idle", jobsFound: 0 },
};

let inMemoryPreferences: JobPreferences = { ...BASE_PREFERENCES };

type SeedJob = Omit<DashboardJob, "descriptionPreview" | "isVisible" | "isMasked">;

const seedJobs: SeedJob[] = [
  {
    id: "job-1",
    title: "Senior Frontend Engineer",
    seniority: "Senior",
    company: {
      name: "Lumina Labs",
      industry: "AI Software",
      size: "201-500",
      website: "https://lumina.example",
    },
    location: "San Francisco, CA",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 170000, max: 210000, currency: "USD" },
    matchScore: 92,
    matchedSkills: ["React", "TypeScript", "GraphQL", "Design Systems"],
    atsScore: 88,
    postedAt: formatISO(subDays(new Date(), 2)),
    jobBoard: "LinkedIn",
    description:
      "Lead the development of a design-system driven web application, collaborate with product design, and mentor engineers while shipping delightful experiences.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/lumina/frontend",
    tags: ["Remote friendly", "Equity"],
    visaSponsorship: true,
    highlightKeywords: ["React", "TypeScript", "Design systems"],
  },
  {
    id: "job-2",
    title: "Staff Product Manager",
    seniority: "Staff",
    company: {
      name: "Northwind Commerce",
      industry: "E-commerce",
      size: "1001-5000",
      website: "https://northwind.example",
    },
    location: "Remote - US",
    employmentType: "Full-time",
    remoteType: "Remote" as const,
    salary: { min: 180000, max: 230000, currency: "USD" },
    matchScore: 88,
    matchedSkills: ["Roadmaps", "Experimentation", "Stakeholder Management"],
    atsScore: 76,
    postedAt: formatISO(subDays(new Date(), 5)),
    jobBoard: "Indeed",
    description:
      "Own core growth initiatives, partner with engineering to prioritize experiments, and deliver measurable revenue impact across the shopper experience.",
    status: "applied" as const,
    jobUrl: "https://jobs.example.com/northwind/product",
    tags: ["Remote", "Stock options"],
    visaSponsorship: false,
    highlightKeywords: ["Growth", "Experimentation", "Roadmaps"],
  },
  {
    id: "job-3",
    title: "AI Solutions Architect",
    seniority: "Senior",
    company: {
      name: "Aurora Analytics",
      industry: "Data Platform",
      size: "501-1000",
      website: "https://aurora.example",
    },
    location: "Austin, TX",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 190000, max: 240000, currency: "USD" },
    matchScore: 95,
    matchedSkills: ["Machine Learning", "Python", "MLOps", "Client Advisory"],
    atsScore: 91,
    postedAt: formatISO(subDays(new Date(), 1)),
    jobBoard: "Himalayas",
    description:
      "Design large scale AI architectures, guide clients through deployment best practices, and lead cross-functional teams delivering measurable ROI.",
    status: "interview" as const,
    jobUrl: "https://jobs.example.com/aurora/ai-solutions",
    tags: ["Hybrid", "Client facing"],
    visaSponsorship: true,
    highlightKeywords: ["AI", "MLOps", "Architecture"],
  },
  {
    id: "job-4",
    title: "Lead UX Researcher",
    seniority: "Lead",
    company: {
      name: "Atlas Health",
      industry: "Healthcare Tech",
      size: "51-200",
      website: "https://atlashealth.example",
    },
    location: "New York, NY",
    employmentType: "Full-time",
    remoteType: "On-site" as const,
    salary: { min: 155000, max: 190000, currency: "USD" },
    matchScore: 81,
    matchedSkills: ["Mixed Methods", "Healthcare", "Stakeholder Presentations"],
    atsScore: 73,
    postedAt: formatISO(subDays(new Date(), 8)),
    jobBoard: "Greenhouse",
    description:
      "Lead discovery efforts for new patient-facing features, synthesize insights for executives, and champion inclusive design practices across the product org.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/atlas/ux-research",
    tags: ["On-site", "Equity"],
    visaSponsorship: false,
    highlightKeywords: ["Research", "Healthcare", "Inclusive design"],
  },
  {
    id: "job-5",
    title: "Growth Marketing Manager",
    seniority: "Mid",
    company: {
      name: "Sequoia Fintech",
      industry: "Fintech",
      size: "201-500",
      website: "https://sequoia.example",
    },
    location: "Chicago, IL",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 120000, max: 145000, currency: "USD" },
    matchScore: 77,
    matchedSkills: ["Lifecycle", "Paid Acquisition", "SQL"],
    atsScore: 68,
    postedAt: formatISO(subDays(new Date(), 3)),
    jobBoard: "Lever",
    description:
      "Own lifecycle marketing experiments, partner with analytics to drive channel ROI, and mentor specialists executing cross-channel campaigns.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/sequoia/growth",
    tags: ["Hybrid", "Bonus"],
    visaSponsorship: false,
    highlightKeywords: ["Lifecycle", "SQL", "Paid acquisition"],
  },
  {
    id: "job-6",
    title: "Senior Data Engineer",
    seniority: "Senior",
    company: {
      name: "Nova Insights",
      industry: "Analytics",
      size: "1001-5000",
      website: "https://nova.example",
    },
    location: "Remote - Americas",
    employmentType: "Full-time",
    remoteType: "Remote" as const,
    salary: { min: 160000, max: 195000, currency: "USD" },
    matchScore: 89,
    matchedSkills: ["dbt", "Snowflake", "Data Architecture"],
    atsScore: 84,
    postedAt: formatISO(subDays(new Date(), 6)),
    jobBoard: "Wellfound",
    description:
      "Design resilient data pipelines, optimize warehouse performance, and partner with ML teams on model-ready datasets.",
    status: "applied" as const,
    jobUrl: "https://jobs.example.com/nova/data-engineer",
    tags: ["Remote", "Unlimited PTO"],
    visaSponsorship: true,
    highlightKeywords: ["dbt", "Snowflake", "Pipelines"],
  },
  {
    id: "job-7",
    title: "Director of Customer Success",
    seniority: "Director",
    company: {
      name: "Nimbus Cloud",
      industry: "SaaS",
      size: "501-1000",
      website: "https://nimbus.example",
    },
    location: "Seattle, WA",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 150000, max: 190000, currency: "USD" },
    matchScore: 83,
    matchedSkills: ["Retention", "Renewals", "Leadership"],
    atsScore: 74,
    postedAt: formatISO(subDays(new Date(), 10)),
    jobBoard: "LinkedIn",
    description:
      "Lead a 25-person CS org, design health scoring frameworks, and partner with product on voice-of-customer insights.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/nimbus/cs-director",
    tags: ["Hybrid", "Bonus"],
    visaSponsorship: false,
    highlightKeywords: ["Customer success", "Renewals", "Leadership"],
  },
  {
    id: "job-8",
    title: "Principal Security Engineer",
    seniority: "Principal",
    company: {
      name: "Sentinel One",
      industry: "Cybersecurity",
      size: "5000+",
      website: "https://sentinel.example",
    },
    location: "Boston, MA",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 200000, max: 260000, currency: "USD" },
    matchScore: 94,
    matchedSkills: ["Threat Modeling", "Zero Trust", "AWS"],
    atsScore: 89,
    postedAt: formatISO(subDays(new Date(), 4)),
    jobBoard: "Indeed",
    description:
      "Define product security strategy, lead incident response tabletop exercises, and guide the adoption of zero-trust architecture.",
    status: "interview" as const,
    jobUrl: "https://jobs.example.com/sentinel/security",
    tags: ["Hybrid", "Security clearance"],
    visaSponsorship: true,
    highlightKeywords: ["Security", "Zero trust", "AWS"],
  },
  {
    id: "job-9",
    title: "Lead DevOps Engineer",
    seniority: "Lead",
    company: {
      name: "Orbit Media",
      industry: "Media Tech",
      size: "201-500",
      website: "https://orbit.example",
    },
    location: "Los Angeles, CA",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 150000, max: 185000, currency: "USD" },
    matchScore: 87,
    matchedSkills: ["Kubernetes", "CI/CD", "AWS"],
    atsScore: 80,
    postedAt: formatISO(subDays(new Date(), 12)),
    jobBoard: "Lever",
    description:
      "Automate infrastructure provisioning, lead incident response improvements, and mentor engineers on observability best practices.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/orbit/devops",
    tags: ["Hybrid", "On-call"],
    visaSponsorship: false,
    highlightKeywords: ["Kubernetes", "CI/CD", "Observability"],
  },
  {
    id: "job-10",
    title: "Senior Product Designer",
    seniority: "Senior",
    company: {
      name: "Peak Fitness",
      industry: "Health & Wellness",
      size: "201-500",
      website: "https://peakfitness.example",
    },
    location: "Denver, CO",
    employmentType: "Full-time",
    remoteType: "Remote" as const,
    salary: { min: 130000, max: 165000, currency: "USD" },
    matchScore: 86,
    matchedSkills: ["UX", "UI", "Design Systems"],
    atsScore: 78,
    postedAt: formatISO(subDays(new Date(), 9)),
    jobBoard: "Wellfound",
    description:
      "Own end-to-end product design for mobile experiences, partner with research to validate hypotheses, and maintain the design system.",
    status: "applied" as const,
    jobUrl: "https://jobs.example.com/peak/designer",
    tags: ["Remote", "Equity"],
    visaSponsorship: false,
    highlightKeywords: ["Design", "Mobile", "System"],
  },
  {
    id: "job-11",
    title: "Head of Analytics",
    seniority: "Head",
    company: {
      name: "Brightline Energy",
      industry: "Climate Tech",
      size: "501-1000",
      website: "https://brightline.example",
    },
    location: "Austin, TX",
    employmentType: "Full-time",
    remoteType: "Hybrid" as const,
    salary: { min: 180000, max: 225000, currency: "USD" },
    matchScore: 90,
    matchedSkills: ["Data Strategy", "Team Leadership", "Analytics"],
    atsScore: 82,
    postedAt: formatISO(subDays(new Date(), 7)),
    jobBoard: "LinkedIn",
    description:
      "Build analytics strategy for grid optimization, manage a team of 12 analysts, and define data quality metrics across the org.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/brightline/analytics",
    tags: ["Hybrid", "ESG"],
    visaSponsorship: true,
    highlightKeywords: ["Analytics", "Leadership", "Data strategy"],
  },
  {
    id: "job-12",
    title: "Senior QA Automation Engineer",
    seniority: "Senior",
    company: {
      name: "Catalyst Robotics",
      industry: "Robotics",
      size: "501-1000",
      website: "https://catalyst.example",
    },
    location: "Pittsburgh, PA",
    employmentType: "Full-time",
    remoteType: "On-site" as const,
    salary: { min: 115000, max: 140000, currency: "USD" },
    matchScore: 79,
    matchedSkills: ["Automation", "Python", "Robotics"],
    atsScore: 71,
    postedAt: formatISO(subDays(new Date(), 14)),
    jobBoard: "Indeed",
    description:
      "Design automated test suites for robotic systems, collaborate with hardware engineers, and ensure compliance with safety standards.",
    status: "not_applied" as const,
    jobUrl: "https://jobs.example.com/catalyst/qa",
    tags: ["On-site", "Hardware"],
    visaSponsorship: false,
    highlightKeywords: ["Automation", "Python", "Robotics"],
  },
];

const expandJobs = () => {
  const clones: SeedJob[] = [];
  const statusCycle: DashboardJob["status"][] = ["not_applied", "applied", "interview", "offer"];
  seedJobs.forEach((job, idx) => {
    clones.push(job);
    const duplicateCount = 4;
    for (let i = 1; i <= duplicateCount; i += 1) {
      const status = statusCycle[(idx + i) % statusCycle.length];
      clones.push({
        ...job,
        id: `${job.id}-${i}`,
        title: `${job.title.replace("Senior", "")} ${job.seniority} ${2024 + i}`.trim(),
        matchScore: Math.max(60, Math.min(99, job.matchScore - i * 3 + idx)),
        atsScore: Math.max(55, Math.min(97, job.atsScore - i * 2 + idx)),
        postedAt: formatISO(subDays(new Date(), (idx + i) % 15)),
        status,
        jobUrl: `${job.jobUrl}?variant=${i}`,
      });
    }
  });
  return clones;
};

const jobsDataset = expandJobs();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const loadJobFetchState = (): JobFetchRecord => {
  const storage = getStorage();
  if (!storage) return inMemoryJobFetch;
  const raw = storage.getItem(JOB_FETCH_KEY);
  if (!raw) return inMemoryJobFetch;
  try {
    const parsed = JSON.parse(raw) as JobFetchRecord;
    return {
      free: parsed.free || { status: "idle", jobsFound: 0 },
      pro: parsed.pro || { status: "idle", jobsFound: 0 },
      elite: parsed.elite || { status: "idle", jobsFound: 0 },
    };
  } catch (error) {
    console.error("Failed to parse job fetch state", error);
    return inMemoryJobFetch;
  }
};

const persistJobFetchState = (state: JobFetchRecord) => {
  const storage = getStorage();
  if (!storage) {
    inMemoryJobFetch.free = state.free;
    inMemoryJobFetch.pro = state.pro;
    inMemoryJobFetch.elite = state.elite;
    return;
  }
  storage.setItem(JOB_FETCH_KEY, JSON.stringify(state));
};

const loadPreferences = (): JobPreferences => {
  const storage = getStorage();
  if (!storage) return inMemoryPreferences;
  const raw = storage.getItem(PREFERENCES_KEY);
  if (!raw) return BASE_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as JobPreferences;
    inMemoryPreferences = { ...BASE_PREFERENCES, ...parsed };
    return inMemoryPreferences;
  } catch (error) {
    console.error("Failed to parse preferences", error);
    return BASE_PREFERENCES;
  }
};

const persistPreferences = (preferences: JobPreferences) => {
  const storage = getStorage();
  inMemoryPreferences = preferences;
  if (!storage) return;
  storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
};

const formatDescriptionPreview = (description: string) => {
  const words = description.split(/\s+/);
  if (words.length <= 10) return description;
  return `${words.slice(0, 10).join(" ")}…`;
};

const applyFilters = (
  jobs: typeof jobsDataset,
  query?: string,
  filters?: DashboardFilters,
) => {
  return jobs.filter((job) => {
    if (query) {
      const haystack = `${job.title} ${job.company.name} ${job.description}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) {
        return false;
      }
    }

    if (filters?.remote && job.remoteType !== "Remote") {
      return false;
    }

    if (filters?.employmentTypes?.length) {
      if (!filters.employmentTypes.includes(job.employmentType)) {
        return false;
      }
    }

    if (typeof filters?.salaryThreshold === "number") {
      const max = job.salary.max || job.salary.min;
      if (max && max < filters.salaryThreshold) {
        return false;
      }
    }

    if (filters?.recent) {
      const posted = new Date(job.postedAt);
      if (posted < subDays(new Date(), 7)) {
        return false;
      }
    }

    if (filters?.seniorityLevels?.length) {
      if (!filters.seniorityLevels.includes(job.seniority)) {
        return false;
      }
    }

    if (typeof filters?.visaSponsorship === "boolean") {
      if (job.visaSponsorship !== filters.visaSponsorship) {
        return false;
      }
    }

    if (filters?.locations?.length) {
      const match = filters.locations.some((location) =>
        job.location.toLowerCase().includes(location.toLowerCase()),
      );
      if (!match) return false;
    }

    return true;
  });
};

const computeKpis = (plan: PlanName, range: DashboardRange): DashboardKPIs => {
  const weight = RANGE_WEIGHT[range];
  const planMultiplier = plan === "elite" ? 2.5 : plan === "pro" ? 1.5 : 1;
  const discovered = Math.round(40 * planMultiplier * weight + (plan === "free" ? 5 : 15));
  const applied = Math.round(12 * planMultiplier * weight + (plan === "elite" ? 12 : plan === "pro" ? 7 : 2));
  const response = Math.min(75, Math.round((plan === "elite" ? 0.42 : plan === "pro" ? 0.34 : 0.22) * 100 + weight * 6));

  return {
    discovered: { value: discovered, delta: plan === "free" ? 6 : plan === "pro" ? 11 : 15 },
    applied: { value: applied, delta: plan === "free" ? 4 : plan === "pro" ? 9 : 14 },
    responseRate: { value: response, delta: plan === "free" ? 2 : plan === "pro" ? 5 : 7 },
  };
};

const sliceByPlan = (jobs: typeof jobsDataset, plan: PlanName) => {
  if (plan === "free") return jobs.slice(0, 12);
  return jobs.slice(0, 50);
};

export const fetchDashboardData = async (
  params: {
    plan?: string | null;
    range?: DashboardRange;
    query?: string;
    filters?: DashboardFilters;
  },
): Promise<DashboardResponse> => {
  await wait(350);
  const normalizedPlan = normalizePlanName(params.plan);
  const range = params.range ?? "7d";
  const filtered = applyFilters(jobsDataset, params.query, params.filters).sort(
    (a, b) => b.matchScore - a.matchScore,
  );
  const sliced = sliceByPlan(filtered, normalizedPlan);
  const visibleLimit = PLAN_LIMITS[normalizedPlan].visibleRows;

  const jobs: DashboardJob[] = sliced.map((job, index) => ({
    ...job,
    descriptionPreview: formatDescriptionPreview(job.description),
    isVisible: index < visibleLimit,
    isMasked: index >= visibleLimit,
    company: {
      ...job.company,
      glassdoorUrl: job.company.glassdoorUrl || `https://www.glassdoor.com/${job.company.name}`,
    },
  }));

  const jobFetchState = loadJobFetchState()[normalizedPlan];

  return {
    kpis: computeKpis(normalizedPlan, range),
    jobs,
    totalJobs: filtered.length,
    plan: { name: normalizedPlan, limits: PLAN_LIMITS[normalizedPlan] },
    usage: {
      resumes: normalizedPlan === "elite" ? 6 : normalizedPlan === "pro" ? 3 : 1,
      applicationsToday: normalizedPlan === "elite" ? 18 : normalizedPlan === "pro" ? 9 : 2,
    },
    jobFetch: jobFetchState,
  };
};

export const getJobFetchState = (plan?: string | null): JobFetchState => {
  const normalized = normalizePlanName(plan);
  return loadJobFetchState()[normalized];
};

export const triggerJobFetch = async (plan?: string | null): Promise<JobFetchState> => {
  const normalized = normalizePlanName(plan);
  const state = loadJobFetchState();
  const existing = state[normalized];
  if (existing.status === "cooldown" && existing.nextAvailableAt) {
    const nextAvailable = new Date(existing.nextAvailableAt);
    if (nextAvailable > new Date()) {
      const error = new Error("Fetch already used today");
      (error as Error & { code?: string }).code = "FETCH_COOLDOWN";
      throw error;
    }
  }

  state[normalized] = { status: "fetching", jobsFound: 0, triggeredAt: new Date().toISOString() };
  persistJobFetchState(state);
  await wait(1200);
  const jobsFound = normalized === "elite" ? 48 : normalized === "pro" ? 24 : 6;
  const nextAvailable = addDays(new Date(), 1);
  const updated: JobFetchState = {
    status: "success",
    jobsFound,
    triggeredAt: state[normalized].triggeredAt,
    nextAvailableAt: nextAvailable.toISOString(),
  };
  state[normalized] = updated;
  persistJobFetchState(state);
  await wait(400);
  state[normalized] = { ...updated, status: "cooldown" };
  persistJobFetchState(state);
  return state[normalized];
};

export const fetchJobDetails = async (jobId: string): Promise<JobDetail> => {
  await wait(300);
  const job = jobsDataset.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  return {
    ...job,
    descriptionPreview: formatDescriptionPreview(job.description),
    isVisible: true,
    isMasked: false,
    responsibilities: [
      "Own discovery with cross-functional partners",
      "Ship measurable improvements every quarter",
      "Mentor teammates and uplift craft",
    ],
    requirements: [
      "5+ years experience in similar roles",
      "Proven track record in fast-paced environments",
      "Excellent communication and collaboration skills",
    ],
    benefits: [
      "Comprehensive healthcare",
      "401(k) with match",
      "Flexible PTO",
    ],
  };
};

export const requestOptimizeATS = async (plan?: string | null) => {
  await wait(200);
  const normalized = normalizePlanName(plan);
  if (!canUseFeature(normalized, "optimizeATS")) {
    throw createUpgradeRequiredError();
  }
  await wait(800);
  return {
    atsScore: 94,
    suggestions: [
      "Incorporate keywords for leadership impact",
      "Highlight quantifiable outcomes in summary",
      "Mention cloud migration initiatives from 2024",
    ],
  };
};

export const requestOptimizedCV = async (plan?: string | null) => {
  await wait(200);
  const normalized = normalizePlanName(plan);
  if (!canUseFeature(normalized, "optimizedCV")) {
    throw createUpgradeRequiredError();
  }
  await wait(1000);
  return {
    cvId: `cv-${Date.now()}`,
    url: "https://cdn.jobvance.io/resumes/optimized.pdf",
  };
};

export const exportApplications = async (plan?: string | null) => {
  await wait(150);
  const normalized = normalizePlanName(plan);
  if (!canUseFeature(normalized, "export")) {
    throw createUpgradeRequiredError();
  }
  await wait(600);
  return {
    url: "data:text/csv;charset=utf-8,Company,Role,Status\nLumina Labs,Senior Frontend Engineer,Interview",
  };
};

export const fetchPreferences = async (): Promise<JobPreferences> => {
  await wait(200);
  return loadPreferences();
};

export const updatePreferences = async (
  updates: Partial<JobPreferences>,
): Promise<JobPreferences> => {
  await wait(150);
  const current = loadPreferences();
  const merged = { ...current, ...updates };
  persistPreferences(merged);
  return merged;
};
