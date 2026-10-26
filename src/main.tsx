import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/marketing.css";
import "./styles/motion.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");

createRoot(container).render(<App />);
