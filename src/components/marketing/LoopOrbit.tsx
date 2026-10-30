import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion";
import "./LoopOrbit.css";

// Layout effect in the browser (runs before paint); plain effect on the server.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Props = {
  size: number;
  variant?: "light" | "dark";
  labels?: boolean;
  /** Show the three stop nodes. */
  nodes?: boolean;
  /** Off gives a static ring (and nodes) with no comet at all. */
  animate?: boolean;
  /** Play one sweep, Find to You review, when the orbit scrolls into view, then rest. */
  once?: boolean;
  className?: string;
  children?: ReactNode;
};

/** The signature "orbit": the search goes round on its own; you are the last stop. Decorative only. */
export default function LoopOrbit({ size, variant = "light", labels = false, nodes = true, animate = true, once = false, className = "", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // The single pass starts on the client only. The server-painted frame shows the comet at rest on "You review",
  // and a prerendered page keeps that frame, so the comet never jumps back when the app mounts.
  const [live, setLive] = useState(false);
  const motionAllowed = useMotionAllowed();
  useBeforePaint(() => {
    const node = ref.current;
    if (!animate || !node || typeof IntersectionObserver === "undefined") return;
    // Without motion (or without JS) the comet simply rests on "You review".
    if (!motionAllowed) { setLive(false); return; }
    if (once) {
      // Already in view at mount (restored scroll, tall screens): leave it at rest rather than jump back to start.
      const box = node.getBoundingClientRect();
      const visible = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
      if (box.height > 0 && visible / box.height >= 0.4) return;
      node.classList.add("is-armed");
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        node.classList.add("is-in");
        observer.disconnect();
      }, { threshold: 0.4 });
      observer.observe(node);
      return () => observer.disconnect();
    }
    // A prerendered page also plays its pass: the comet rests on "You review" in the painted frame and sweeps round once.
    setLive(true);
    // Pause the pass while the orbit is off screen.
    const observer = new IntersectionObserver(([entry]) => node.classList.toggle("is-offscreen", !entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [animate, once, motionAllowed]);
  const mode = !animate ? "" : once ? " jv-orbit--once" : live ? " jv-orbit--animate" : "";
  return <div ref={ref} className={`jv-orbit jv-orbit--${variant}${mode} ${className}`.trim()} style={{ "--size": `${size}px` } as CSSProperties} aria-hidden="true">
    <span className="jv-orbit-ring" />
    {animate && <span className="jv-orbit-comet" />}
    {nodes && <>
      <span className="jv-orbit-node jv-orbit-node--find" />
      <span className="jv-orbit-node jv-orbit-node--tailor" />
      <span className="jv-orbit-node jv-orbit-node--approve" />
    </>}
    {nodes && labels && <>
      <span className="jv-orbit-label jv-orbit-label--find">Find</span>
      <span className="jv-orbit-label jv-orbit-label--tailor">Tailor</span>
      <span className="jv-orbit-label jv-orbit-label--approve">You review</span>
    </>}
    {children}
  </div>;
}
