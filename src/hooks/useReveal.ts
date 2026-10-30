import { useEffect, useLayoutEffect } from "react";
import { useMotionAllowed } from "@/lib/motion";

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
  const motionAllowed = useMotionAllowed();
  useBeforePaint(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (!motionAllowed) return;
    const root = document.documentElement;
    const pending = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    const fold = window.innerHeight * 0.9;
    // After its reveal has played, a block drops the reveal's transition so its own hover transitions are never delayed (see motion.css).
    const timers = new Set<number>();
    const settle = (element: Element, order: number) => { const timer = window.setTimeout(() => { timers.delete(timer); element.classList.add("is-done"); }, 420 + order * 70 + 80); timers.add(timer); };
    for (const element of pending) if (element.getBoundingClientRect().top < fold) { element.classList.add("is-in"); settle(element, 0); }
    root.classList.add("jv-motion");
    // Hide first with no transition, then enable the reveal transition two frames later, so arming never fades
    // below-the-fold blocks from visible to hidden.
    let frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(() => root.classList.add("jv-motion-ready")); });
    const observer = new IntersectionObserver((entries) => {
      // Stagger only elements that enter together (same callback batch); a lone element never waits.
      entries.filter(entry => entry.isIntersecting).forEach((entry, order) => {
        (entry.target as HTMLElement).style.setProperty("--i", String(order));
        entry.target.classList.add("is-in");
        settle(entry.target, order);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "100000px 0px -10% 0px", threshold: 0.15 }); // the huge top margin also reveals anything a fast scroll jumped past
    for (const element of pending) if (!element.classList.contains("is-in")) observer.observe(element);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); timers.forEach(timer => window.clearTimeout(timer)); root.classList.remove("jv-motion", "jv-motion-ready"); };
  }, [motionAllowed]);
}
