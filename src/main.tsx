import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/marketing.css";
import "./styles/motion.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
// createRoot replaces prerendered markup; this keeps the already-painted hero from replaying its entrance.
const prerendered = !!container.firstElementChild;
if (prerendered) document.documentElement.classList.add("jv-prerendered");

// Lazy marketing routes: wait for the route's chunk before replacing the prerendered markup, so the painted page is
// never swapped for the loading skeleton (and back) while the chunk downloads.
const routeChunks: Record<string, () => Promise<unknown>> = {
  "/job-loop": () => import("./pages/JobLoopOverview"),
  "/guides": () => import("./pages/CareerGuides"),
  "/help": () => import("./pages/HelpCenter"),
  "/walkthroughs": () => import("./pages/Walkthroughs"),
  "/for-students": () => import("./pages/AudienceLanding"),
  "/for-mba": () => import("./pages/AudienceLanding"),
  "/for-career-switchers": () => import("./pages/AudienceLanding"),
};
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const chunk = prerendered ? (routeChunks[path] ?? (path.startsWith("/guides/") ? routeChunks["/guides"] : undefined)) : undefined;
const root = createRoot(container);
if (chunk) void chunk().catch(() => undefined).then(() => root.render(<App />));
else root.render(<App />);
