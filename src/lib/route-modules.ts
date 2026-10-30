import { lazy, type ComponentType } from "react";

/** Route chunks that main.tsx can fetch before the first client render replaces prerendered markup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loaded = { default: ComponentType<any> };
type Loader<T extends Loaded> = () => Promise<T>;

const settled = new Map<string, Loaded>();

/** A thenable that is already settled: React's lazy() reads it in the same render pass instead of suspending. */
function settledThenable<T>(value: T): Promise<T> {
  const thenable = { then(onFulfilled?: (value: T) => unknown) { onFulfilled?.(value); return thenable; } };
  return thenable as unknown as Promise<T>;
}

/** React.lazy that resolves synchronously once its chunk has been preloaded, so a prerendered page is never swapped for the loading skeleton. */
export function lazyRoute<T extends Loaded>(key: string, load: Loader<T>) {
  return lazy<T["default"]>(() => {
    const hit = settled.get(key) as T | undefined;
    if (hit) return settledThenable(hit);
    return load().then(module => { settled.set(key, module); return module; });
  });
}

/** Fetch a route chunk ahead of time; the matching lazyRoute then renders without suspending. */
export function preloadRoute(key: string, load: () => Promise<Loaded>): Promise<void> {
  return load().then(module => { settled.set(key, module); });
}

export const routeLoaders = {
  audience: () => import("@/pages/AudienceLanding"),
  jobLoop: () => import("@/pages/JobLoopOverview"),
  guides: () => import("@/pages/CareerGuides"),
  guideArticle: () => import("@/pages/CareerGuides").then(module => ({ default: module.CareerGuideArticle })),
  help: () => import("@/pages/HelpCenter"),
  walkthroughs: () => import("@/pages/Walkthroughs"),
  onboarding: () => import("@/pages/LoopOnboarding"),
  auth: () => import("@/pages/Auth"),
} as const;

/** Client-only account entry routes (the Meta ad landing page): start their chunks at once, in parallel, instead of after the entry and the first route hop. */
export function warmAccountEntry(path: string): void {
  const quiet = () => undefined;
  if (path === "/onboarding") { routeLoaders.onboarding().catch(quiet); routeLoaders.auth().catch(quiet); }
  else if (path === "/auth") routeLoaders.auth().catch(quiet);
}

/** The chunk keys a prerendered public path needs on its first client render. */
export function routeKeysFor(path: string): Array<keyof typeof routeLoaders> {
  if (path === "/job-loop") return ["jobLoop"];
  if (path === "/guides") return ["guides"];
  if (path.startsWith("/guides/")) return ["guides", "guideArticle"];
  if (path === "/help") return ["help"];
  if (path === "/walkthroughs") return ["walkthroughs"];
  if (path === "/for-students" || path === "/for-mba" || path === "/for-career-switchers") return ["audience"];
  return [];
}
