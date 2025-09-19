import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// ---------- CHANGE THIS to your repo name ----------
const REPO = "career-climb-automagic";
// ---------------------------------------------------

export default defineConfig(({ mode }) => ({
  // ✅ Use a base path ONLY when building for GitHub Pages
  //    (we'll set GITHUB_PAGES=true in the workflow)
  base: process.env.GITHUB_PAGES ? `/${REPO}/` : "/",

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
