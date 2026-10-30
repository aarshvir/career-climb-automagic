import { Link, useLocation } from "react-router-dom";
import { Brand } from "./MvpHeader";

// The same site links as before, grouped into four balanced columns of three.
const columns: [string, [string, string][]][] = [
  ["Product", [["/job-loop", "Automated Job Loop"], ["/check", "Free CV Check"], ["/pricing", "Plans & pricing"]]],
  ["Resources", [["/guides", "Career guides"], ["/walkthroughs", "Walkthroughs"], ["/help", "Help"]]],
  ["Who it's for", [["/for-students", "Students"], ["/for-mba", "MBA career pivots"], ["/for-career-switchers", "Busy professionals"]]],
  ["Company", [["/about", "About Jobvance"], ["/contact", "Contact"], ["/faq", "FAQ"]]],
];
const legal: [string, string][] = [["/privacy", "Privacy"], ["/privacy#advertising-measurement", "Your privacy choices"], ["/terms", "Terms"], ["/refund", "Refunds"]];

export default function MvpFooter() {
  const { pathname } = useLocation();
  const compact = pathname === "/check" || pathname === "/dashboard" || /^\/(auth|onboarding)(\/|$)/.test(pathname);
  return <footer className={`jv-footer${compact ? " jv-footer-compact" : ""}`}>
    <div className="jv-footer-inner">
      <div className="jv-footer-top">
        <div className="jv-footer-brand"><Brand /><p className="jv-footer-description">Automated Job Loop runs in the background and finds the best-matching jobs for you, with a tailored, role-specific CV for each prepared role.</p></div>
        <nav aria-label="Footer navigation" className="jv-footer-links">{columns.map(([head, items]) => <div key={head} className="jv-footer-col" role="group" aria-label={head}><p className="jv-footer-col-title">{head}</p><ul>{items.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul></div>)}</nav>
      </div>
      <div className="jv-footer-bottom"><p>© {new Date().getFullYear()} Jobvance</p><nav aria-label="Legal navigation">{legal.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav></div>
    </div>
    <div className="jv-footer-mark" aria-hidden="true"><span /></div>
  </footer>;
}
