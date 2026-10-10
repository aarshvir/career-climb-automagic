import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
export default function MvpHeader() {
  const { user, loading, signOut } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">
            Job<span className="text-primary">vance</span>
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-3 text-sm"
        >
          <Link to="/check" className="min-h-11 content-center font-medium text-primary hover:underline">Free CV check</Link>
          <Link
            to="/how-it-works"
            className="min-h-11 content-center hover:underline"
          >
            How it works
          </Link>
          <Link
            to="/pilot"
            className="min-h-11 content-center font-medium text-primary hover:underline"
          >
            Free pilot
          </Link>
          <Link
            to="/pricing"
            className="min-h-11 content-center hover:underline"
          >
            Pricing
          </Link>
          {!loading &&
            (user ? (
              <>
                <Button asChild size="sm">
                  <Link to="/dashboard">Workspace</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await signOut();
                      client.clear();
                    } catch {
                      setError("Sign out failed. Please retry.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in / sign up</Link>
              </Button>
            ))}
        </nav>
      </div>
      {error && (
        <p
          className="mx-auto max-w-6xl px-4 pb-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </header>
  );
}
