import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Repeat2 } from "lucide-react";
import "./LoopRunMock.css";

// Layout effect in the browser (runs before paint); plain effect on the server.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Placeholder employers and times only. No scores, percentages or result counts: this is an illustration.
// One US 12-hour format throughout. Rows run newest first and every run precedes the next one (Wed), so Monday leads Friday.
const rows = [
  { role: "Junior Product Analyst", company: "Fabrikam", time: "Mon 7:00 AM" },
  { role: "Data Analyst", company: "Contoso Health", time: "Wed 7:00 AM" },
  { role: "Product Analyst", company: "Northwind Labs", time: "Fri 7:00 AM" },
];

/** Hero product mock: example Automated Job Loop history across separate scheduled runs.
 * Its one short pass (each row: found, CV tailored, ready for review) ends within 5 seconds, so it needs no pause control.
 * The newest row rests on "CV tailored", so the resting state shows the progression, not three identical tags. All three illustrative history rows show at every width. */
export default function LoopRunMock() {
  const ref = useRef<HTMLElement>(null);
  useBeforePaint(() => {
    const node = ref.current;
    // A prerendered page keeps its server-painted "Ready for review" frame, so nothing steps backwards on mount.
    if (!node) return;
    // A prerendered page keeps its painted "Ready for review" frame and only settles forward: a 2px rise and a brief ring on each
    // status, in row order. Nothing steps backwards. Other pages play the full found, tailored, ready pass.
    if (document.documentElement.classList.contains("jv-prerendered")) { node.classList.add("is-settle"); return; }
    node.classList.add("is-live");
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => node.classList.toggle("is-offscreen", !entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <figure ref={ref} className="jv-mock" aria-label="Example of Automated Job Loop history">
    <div className="jv-mock-card">
      <div className="jv-mock-top">
        <span className="jv-chip jv-chip--caption jv-mock-tag">Example history · illustrative data</span>
      </div>
      <div className="jv-mock-head">
        <p className="jv-mock-title">Automated Job Loop</p>
        <span className="jv-mock-schedule"><Repeat2 aria-hidden="true" />3×/week · Mon Wed Fri</span>
        <p className="jv-mock-next"><span className="jv-mock-pulse" aria-hidden="true" />Next run · <span className="jv-mock-time">Wed 7:00 AM</span></p>
      </div>
      <div className="jv-mock-filters">
        <span className="jv-chip jv-chip--plain">Product Analyst · Data Analyst</span>
        <span className="jv-chip jv-chip--plain">Remote (US) · Austin, TX</span>
      </div>
      <ul className="jv-mock-rows">
        {rows.map((row, index) => <li key={row.company} style={{ "--i": index } as CSSProperties}>
          <span className="jv-mock-when" aria-hidden="true">{row.time}</span>
          <span className="jv-mock-job"><span className="jv-mock-role">{row.role}</span><span className="jv-mock-company">{row.company}</span></span>
          <span className="jv-mock-status" aria-hidden="true">
            <span className="jv-status jv-status--found">Found</span>
            <span className="jv-status jv-status--tailored">CV tailored</span>
            <span className="jv-status jv-status--ready">Ready for review</span>
          </span>
        </li>)}
      </ul>
      <p className="jv-sr-only">Prepared roles move from found, to CV tailored, to ready for your review.</p>
    </div>
    <p className="jv-mock-foot"><span aria-hidden="true" />Matched jobs · prepared CVs</p>
  </figure>;
}
