import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Normalize a custom base path coming from the workflow. We allow a bare
// slash for root-hosted sites (custom domain / `username.github.io`) and make
// sure everything else has a single leading/trailing slash so Vite behaves.
const normalizeBase = (base?: string) => {
  if (!base) return undefined;
  const trimmed = base.trim();
  if (!trimmed) return undefined;
  if (trimmed === "/") return "/";
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, "");
  return withoutSlashes ? `/${withoutSlashes}/` : "/";
};

// Try to infer the repo name automatically for GitHub Pages deployments.
// Falls back to the previous hard-coded value so local builds keep working.
const repoSlug =
  process.env.GITHUB_PAGES_REPO ??
  process.env.GITHUB_REPOSITORY ??
  "career-climb-automagic";

const repoName = repoSlug.split("/").filter(Boolean).pop() ?? "career-climb-automagic";

// GitHub Pages serves user/org sites (repo name ends with `.github.io`) from
// the domain root, so they need a `/` base instead of `/<repo>/`.
const defaultPagesBase = repoName.endsWith(".github.io")
  ? "/"
  : `/${repoName}/`;

const envBase = normalizeBase(process.env.GITHUB_PAGES_BASE);

export default defineConfig(({ mode }) => ({
  // ✅ Use a base path ONLY when building for GitHub Pages
  //    (we'll set GITHUB_PAGES=true in the workflow)
  base: process.env.GITHUB_PAGES ? envBase ?? defaultPagesBase : "/",

  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
