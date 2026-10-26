import { Link, useLocation } from "react-router-dom";
import { Brand } from "./MvpHeader";

// The same 8 site links as before, grouped into columns.
const columns: [string, [string, string][]][] = [
  ["Product", [["/job-loop", "Automated Job Loop"], ["/check", "Free CV Check"], ["/pricing", "Plans & pricing"]]],
  ["Resources", [["/guides", "Career guides"], ["/walkthroughs", "Walkthroughs"], ["/help", "Help"]]],
  ["Company", [["/about", "About Jobvance"], ["/contact", "Contact"]]],
];
const legal: [string, string][] = [["/privacy", "Privacy"], ["/privacy#advertising-measurement", "Your privacy choices"], ["/terms", "Terms"], ["/refund", "Refunds"]];

export default function MvpFooter() {
  const { pathname } = useLocation();
  const compact = pathname === "/check" || pathname === "/dashboard";
  return <footer className={`jv-footer${compact ? " jv-footer-compact" : ""}`}>
    <div className="jv-footer-inner">
      <div className="jv-footer-top">
        <div className="jv-footer-brand"><Brand /><p className="jv-footer-description">Automated Job Loop finds jobs on your schedule and prepares a tailored CV for each. You review, download and apply.</p><p className="jv-footer-note">Prepared by Jobvance. Reviewed by you.</p></div>
        <nav aria-label="Footer navigation" className="jv-footer-links">{columns.map(([head, items]) => <div key={head} className="jv-footer-col"><h2 className="jv-footer-col-title">{head}</h2><ul>{items.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul></div>)}</nav>
      </div>
      <div className="jv-footer-bottom"><p>© {new Date().getFullYear()} Jobvance</p><nav aria-label="Legal navigation">{legal.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav></div>
    </div>
    <span className="jv-footer-mark" aria-hidden="true" />
  </footer>;
}
