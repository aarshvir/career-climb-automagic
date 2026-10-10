import { Link } from "react-router-dom";
export default function MvpFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Jobvance</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-4">
          {[
            ["/help", "Help"],
            ["/contact", "Contact"],
            ["/privacy", "Privacy"],
            ["/terms", "Terms"],
            ["/refund", "Refunds"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
