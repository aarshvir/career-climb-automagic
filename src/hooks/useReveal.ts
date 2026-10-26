import { useEffect } from "react";

/**
 * Scroll reveals for marketing pages. Adds `html.jv-motion` only when the visitor allows
 * motion and IntersectionObserver exists, then marks each `[data-reveal]` element `.is-in`
 * once it enters the viewport. Without JS (or under reduced motion) content stays visible.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (!window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) return;
    document.documentElement.classList.add("jv-motion");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}
