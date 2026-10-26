import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarClock, Pause, Play } from "lucide-react";
import "./LoopRunMock.css";

// Placeholder employers only. No scores, percentages or result counts: this is an illustration.
const rows = [
  { role: "Product Analyst", company: "Northwind Labs", initial: "N" },
  { role: "Data Analyst", company: "Contoso Health", initial: "C" },
  { role: "Junior Product Analyst", company: "Fabrikam", initial: "F" },
];

type Props = { onPausedChange?: (paused: boolean) => void };

/** Hero product mock: an example Automated Job Loop run, in HTML and CSS. */
export default function LoopRunMock({ onPausedChange }: Props) {
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const toggle = () => { const next = !paused; setPaused(next); onPausedChange?.(next); };
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // The status cycle starts once the client is running, so server HTML rests on "Ready for review".
    node.classList.add("is-live");
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => node.classList.toggle("is-offscreen", !entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <figure ref={ref} className={`jv-mock${paused ? " is-paused" : ""}`} aria-label="Example of an Automated Job Loop run">
    <div className="jv-mock-card">
      <div className="jv-mock-top">
        <span className="jv-chip jv-chip--caption"><span className="jv-mock-tag-long">Example run · illustrative data</span><span className="jv-mock-tag-short">Example run</span></span>
        <button type="button" className="jv-mock-pause" aria-pressed={paused} aria-label="Pause motion" onClick={toggle}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
      </div>
      <div className="jv-mock-head">
        <p className="jv-mock-title">Automated Job Loop</p>
        <span className="jv-mock-schedule"><CalendarClock aria-hidden="true" />3×/week · Mon Wed Fri</span>
        <p className="jv-mock-next"><span className="jv-mock-pulse" aria-hidden="true" />Next run · <span className="jv-mock-time">Wed 7:00 AM</span></p>
      </div>
      <div className="jv-mock-filters">
        <span className="jv-chip jv-chip--plain">Product Analyst · Data Analyst</span>
        <span className="jv-chip jv-chip--plain">Remote (US) · Austin, TX</span>
      </div>
      <ul className="jv-mock-rows">
        {rows.map((row, index) => <li key={row.company} style={{ "--i": index } as CSSProperties}>
          <span className="jv-mock-logo" aria-hidden="true">{row.initial}</span>
          <span className="jv-mock-job"><span className="jv-mock-role">{row.role}</span><span className="jv-mock-company">{row.company}</span></span>
          <span className="jv-mock-status" aria-hidden="true">
            <span className="jv-status jv-status--found">Found</span>
            <span className="jv-status jv-status--tailored">CV tailored</span>
            <span className="jv-status jv-status--ready">Ready for review</span>
          </span>
          <span className="jv-mock-review" aria-hidden="true">Review →</span>
        </li>)}
      </ul>
      <p className="jv-sr-only">Each job moves from found, to CV tailored, to ready for your review.</p>
    </div>
    <p className="jv-mock-foot"><span aria-hidden="true" />Nothing is sent. You apply yourself.</p>
  </figure>;
}
