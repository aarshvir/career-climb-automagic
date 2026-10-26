import { useEffect, useRef, type CSSProperties } from "react";
import "./LoopOrbit.css";

type Props = { size: number; variant?: "light" | "dark"; labels?: boolean; animate?: boolean; className?: string };

/** The signature "orbit": the search goes round on its own; you are the last stop. Decorative only. */
export default function LoopOrbit({ size, variant = "light", labels = false, animate = true, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!animate || !node || typeof IntersectionObserver === "undefined") return;
    // Pause the comet while the orbit is off screen.
    const observer = new IntersectionObserver(([entry]) => node.classList.toggle("is-offscreen", !entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [animate]);
  return <div ref={ref} className={`jv-orbit jv-orbit--${variant}${animate ? " jv-orbit--animate" : ""}${labels ? " jv-orbit--labels" : ""} ${className}`.trim()} style={{ "--size": `${size}px` } as CSSProperties} aria-hidden="true">
    <span className="jv-orbit-ring" />
    <span className="jv-orbit-comet" />
    <span className="jv-orbit-node jv-orbit-node--find" />
    <span className="jv-orbit-node jv-orbit-node--tailor" />
    <span className="jv-orbit-node jv-orbit-node--approve" />
    {labels && <>
      <span className="jv-orbit-label jv-orbit-label--find">01 Find</span>
      <span className="jv-orbit-label jv-orbit-label--tailor">02 Tailor</span>
      <span className="jv-orbit-label jv-orbit-label--approve">03 You approve</span>
    </>}
  </div>;
}
