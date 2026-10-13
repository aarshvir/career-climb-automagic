import { Link, useLocation } from "react-router-dom";
import { Brand } from "./MvpHeader";
export default function MvpFooter() {
  const { pathname } = useLocation();
  const compact = pathname === "/check" || pathname === "/dashboard";
  return <footer className={`jv-footer${compact ? " jv-footer-compact" : ""}`}>
    <div className="jv-footer-inner">
      <div className="jv-footer-top"><div><Brand /><p className="jv-footer-description">Your experience, clearly presented.<br />Your next application, prepared with care.</p></div>
        <nav aria-label="Footer navigation" className="jv-footer-links">{[["/check","Free CV check"],["/job-loop","Job Loop explained"],["/guides","Career guides"],["/walkthroughs","Walkthroughs"],["/help","Help"],["/pricing","Free pilot & plans"],["/about","About Jobvance"],["/contact","Contact"]].map(([to,label])=><Link key={to} to={to}>{label}</Link>)}</nav>
      </div>
      <div className="jv-footer-bottom"><p>© {new Date().getFullYear()} Jobvance · Free beta</p><nav aria-label="Legal navigation" className="flex flex-wrap gap-5">{[["/privacy","Privacy"],["/terms","Terms"],["/refund","Refunds"]].map(([to,label])=><Link key={to} to={to} className="hover:underline">{label}</Link>)}</nav><p>You make the final call.</p></div>
    </div>
  </footer>;
}

