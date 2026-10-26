import { useEffect, useLayoutEffect } from "react";

// Layout effect in the browser (runs before paint); plain effect on the server, where neither runs.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scroll reveals for marketing pages. Adds `html.jv-motion` only when the visitor allows
 * motion and IntersectionObserver exists, then marks each `[data-reveal]` element `.is-in`
 * once it enters the viewport. Without JS (or under reduced motion) content stays visible.
 * Runs before paint, and anything already on screen is marked `.is-in` in the same pass,
 * so above-the-fold content never flashes hidden.
 */
export function useReveal() {
  useBeforePaint(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (!window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) return;
    const root = document.documentElement;
    const pending = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    const fold = window.innerHeight * 0.9;
    for (const element of pending) if (element.getBoundingClientRect().top < fold) element.classList.add("is-in");
    root.classList.add("jv-motion");
    // Hide first with no transition, then enable the reveal transition two frames later, so arming never fades
    // below-the-fold blocks from visible to hidden.
    let frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(() => root.classList.add("jv-motion-ready")); });
    const observer = new IntersectionObserver((entries) => {
      // Stagger only elements that enter together (same callback batch); a lone element never waits.
      entries.filter(entry => entry.isIntersecting).forEach((entry, order) => {
        (entry.target as HTMLElement).style.setProperty("--i", String(order));
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "100000px 0px -10% 0px", threshold: 0.15 }); // the huge top margin also reveals anything a fast scroll jumped past
    for (const element of pending) if (!element.classList.contains("is-in")) observer.observe(element);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); root.classList.remove("jv-motion", "jv-motion-ready"); };
  }, []);
}
