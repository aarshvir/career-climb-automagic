import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProductPage from "@/pages/ProductPage";
const Auth = lazy(() => import("@/pages/Auth")),
  AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword")),
  ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const JobLoop = lazy(() => import("@/pages/JobLoop"));
const AudienceLanding = lazy(() => import("@/pages/AudienceLanding"));
const PilotLanding = lazy(() => import("@/pages/PilotLanding"));
const CvCheck = lazy(() => import("@/pages/CvCheck"));
const AdminPortal = lazy(() => import("@/pages/admin/AdminPortal"));
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 20000, retry: 1 } },
});
function ProtectedWorkspace() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p className="p-8" role="status">
        Loading your account…
      </p>
    );
  return user ? (
    <Workspace key={user.id} />
  ) : (
    <Navigate to="/auth?next=%2Fdashboard" replace />
  );
}
function ProtectedJobLoop() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Capture the presence only; the sealed ticket belongs to the page's memory.
  // An expired auth session can sign in in another tab without discarding it.
  const [mailboxReturn] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('gmail_ticket'));
  if (loading) return <p className="p-8" role="status">Opening your Job Loop…</p>;
  return user || mailboxReturn ? <JobLoop /> : <Navigate to={`/auth?next=${encodeURIComponent(`/loop${location.search}`)}`} replace />;
}
function SiteChrome({ position }: { position: 'header' | 'footer' }) {
  const { pathname } = useLocation();
  // Private navigation is rendered only after a verified administration response.
  const path = pathname.replace(/\/+$/, '');
  if (path === '/admin' || path === '/admin2') return null;
  return position === 'header' ? <Header /> : <Footer />;
}
export default function MvpApp() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={client}>
          <AuthProvider>
            <TooltipProvider>
              <BrowserRouter>
                <SiteChrome position="header" />
                <div id="main-content" tabIndex={-1} className="outline-none">
                <Suspense
                  fallback={
                    <div className="jv-loading" role="status"><div className="jv-loading-line" aria-hidden="true" /><p>Opening your next step…</p><div className="jv-loading-line" aria-hidden="true" /><div className="jv-loading-line" aria-hidden="true" /></div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<ProductPage kind="home" />} />
                    <Route path="/pilot" element={<PilotLanding />} />
                    <Route path="/check" element={<CvCheck />} />
                    <Route path="/loop" element={<ProtectedJobLoop />} />
                    <Route path="/for-students" element={<AudienceLanding audience="student" />} />
                    <Route path="/for-mba" element={<AudienceLanding audience="mba" />} />
                    <Route path="/for-career-switchers" element={<AudienceLanding audience="professional" />} />
                    <Route
                      path="/pricing"
                      element={<ProductPage kind="pricing" />}
                    />
                    <Route
                      path="/how-it-works"
                      element={<ProductPage kind="how" />}
                    />
                    <Route path="/faq" element={<ProductPage kind="faq" />} />
                    <Route
                      path="/about"
                      element={<ProductPage kind="about" />}
                    />
                    <Route
                      path="/contact"
                      element={<ProductPage kind="contact" />}
                    />
                    <Route
                      path="/privacy"
                      element={<ProductPage kind="privacy" />}
                    />
                    <Route
                      path="/terms"
                      element={<ProductPage kind="terms" />}
                    />
                    <Route
                      path="/refund"
                      element={<ProductPage kind="refund" />}
                    />
                    <Route path="/help" element={<ProductPage kind="help" />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route
                      path="/auth/forgot-password"
                      element={<ForgotPassword />}
                    />
                    <Route path="/auth/reset" element={<ResetPassword />} />
                    <Route path="/dashboard" element={<ProtectedWorkspace />} />
                    <Route path="/admin" element={<AdminPortal view="operations" />} />
                    <Route path="/admin2" element={<AdminPortal view="founder" />} />
                    <Route
                      path="/resume-management"
                      element={<Navigate to="/dashboard?tab=cv" replace />}
                    />
                    <Route
                      path="/resumes"
                      element={<Navigate to="/dashboard?tab=cv" replace />}
                    />
                    <Route
                      path="/applications"
                      element={<Navigate to="/dashboard?tab=tracker" replace />}
                    />
                    <Route
                      path="/jobs"
                      element={<Navigate to="/dashboard?tab=tailor" replace />}
                    />
                    <Route
                      path="/job-preferences"
                      element={<Navigate to="/dashboard?tab=tailor" replace />}
                    />
                    <Route
                      path="/preferences"
                      element={<Navigate to="/dashboard?tab=tailor" replace />}
                    />
                    <Route
                      path="/settings"
                      element={<Navigate to="/dashboard?tab=billing" replace />}
                    />
                    <Route
                      path="/plan-selection"
                      element={<Navigate to="/pricing" replace />}
                    />
                    <Route
                      path="/thank-you"
                      element={<Navigate to="/dashboard?tab=billing" replace />}
                    />
                    <Route
                      path="/blog/*"
                      element={<Navigate to="/help" replace />}
                    />
                    <Route path="*" element={<ProductPage kind="notfound" />} />
                  </Routes>
                </Suspense>
                </div>
                <SiteChrome position="footer" />
              </BrowserRouter>
              <Toaster />
              <Sonner />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
