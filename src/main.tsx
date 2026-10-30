import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/marketing.css";
import "./styles/motion.css";
import { preloadRoute, routeKeysFor, routeLoaders, warmAccountEntry } from "./lib/route-modules";

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
// createRoot replaces prerendered markup; this keeps the already-painted hero from replaying its entrance.
const prerendered = !!container.firstElementChild;
if (prerendered) document.documentElement.classList.add("jv-prerendered");

// Lazy marketing routes: fetch the route's chunk before replacing the prerendered markup. The route's lazy component then
// resolves synchronously (see lazyRoute), so the painted page is never swapped for the loading skeleton while it downloads.
const path = window.location.pathname.replace(/\/+$/, "") || "/";
warmAccountEntry(path);
const keys = prerendered ? routeKeysFor(path) : [];
const root = createRoot(container);
if (keys.length) void Promise.all(keys.map(key => preloadRoute(key, routeLoaders[key]))).catch(() => undefined).then(() => root.render(<App />));
else root.render(<App />);
