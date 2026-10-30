import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import RouteNavigation from '@/components/RouteNavigation';
import MetaPixelPages from '@/components/MetaPixelPages';
import MetaCommerceReporter from '@/components/MetaCommerceReporter';
import AnalyticsPages from '@/components/AnalyticsPages';
import { ContactGate } from '@/components/ContactDetails';
import SiteShareMetadata from '@/components/SiteShareMetadata';
import { accountDestination, workspaceReturnPath } from '@/lib/account-return';
import { lazyRoute, routeLoaders } from '@/lib/route-modules';
const Auth = lazy(() => import("@/pages/Auth")),
  AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword")),
  ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ApplicationsHome = lazy(() => import("@/pages/ApplicationsHome"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const JobLoop = lazy(() => import("@/pages/JobLoop"));
const LoopOnboarding = lazy(() => import("@/pages/LoopOnboarding"));
const AudienceLanding = lazyRoute("audience", routeLoaders.audience);
const CvCheck = lazy(() => import("@/pages/CvCheck"));
const AdminPortal = lazy(() => import("@/pages/admin/AdminPortal"));
const AdminHome = lazy(() => import("@/pages/admin/home/AdminHome"));
const MarketingAdmin = lazy(() => import("@/pages/admin/MarketingAdmin"));
const JobLoopOverview = lazyRoute("jobLoop", routeLoaders.jobLoop);
const CareerGuides = lazyRoute("guides", routeLoaders.guides);
const CareerGuideArticle = lazyRoute("guideArticle", routeLoaders.guideArticle);
const HelpCenter = lazyRoute("help", routeLoaders.help);
const Walkthroughs = lazyRoute("walkthroughs", routeLoaders.walkthroughs);
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 20000, retry: 1 } },
});
function ProtectedWorkspace() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <p className="p-8" role="status">
        Loading your account…
      </p>
    );
  if (workspaceReturnPath(location.search) === '/loop') return <Navigate to="/loop" replace />;
  return user ? (
    <Workspace key={user.id} />
  ) : (
    <Navigate to={`/auth?next=${encodeURIComponent(workspaceReturnPath(location.search))}`} replace />
  );
}
function ProtectedCvCheck() {
  const { user, loading, authError, retryConnection } = useAuth();
  if (authError) return <main className="p-8"><p role="alert">Your sign-in could not be restored.</p><button onClick={retryConnection}>Retry sign-in recovery</button><p><Link to="/auth?next=%2Fcheck">Open sign-in</Link></p></main>;
  if (loading) return <p className="p-8" role="status">Opening your CV Check…</p>;
  return user ? <CvCheck key={user.id} /> : <Navigate to="/auth?mode=signup&next=%2Fcheck" replace />;
}
function ProtectedApplications() {
  const location = useLocation();
  const destination = accountDestination(`/applications${location.search}`);
  const { user, loading, authError, retryConnection } = useAuth();
  if (authError) return <div className="p-8"><p role="alert">Your sign-in could not be restored.</p><button onClick={retryConnection}>Retry sign-in recovery</button><p><Link to={`/auth?next=${encodeURIComponent(destination)}`}>Open sign-in</Link></p></div>;
  if (loading) return <p className="p-8" role="status">Opening your applications…</p>;
  return user ? <ApplicationsHome /> : <Navigate to={`/auth?next=${encodeURIComponent(destination)}`} replace />;
}
function ProtectedJobLoop() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Capture the presence only; the sealed ticket belongs to the page's memory.
  // An expired auth session can sign in in another tab without discarding it.
  const [mailboxReturn] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('gmail_ticket'));
  if (loading) return <p className="p-8" role="status">Opening your Automated Job Loop…</p>;
  return user || mailboxReturn ? <JobLoop /> : <Navigate to={`/auth?next=${encodeURIComponent(`/loop${location.search}`)}`} replace />;
}
function SiteChrome({ position }: { position: 'header' | 'footer' }) {
  const { pathname } = useLocation();
  // Private navigation is rendered only after a verified administration response.
  const path = pathname.replace(/\/+$/, '');
  if (path === '/admin' || path.startsWith('/admin/') || path === '/admin-original' || path === '/admin2' || path === '/marketing-admin') return null;
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
                <SiteShareMetadata />
                <RouteNavigation />
                <MetaPixelPages />
                <MetaCommerceReporter />
                <AnalyticsPages />
                <SiteChrome position="header" />
                <div id="main-content" tabIndex={-1} className="outline-none">
                <Suspense
                  fallback={
                    <div className="jv-loading" role="status"><div className="jv-loading-line" aria-hidden="true" /><p>Opening your next step…</p><div className="jv-loading-line" aria-hidden="true" /><div className="jv-loading-line" aria-hidden="true" /></div>
                  }
                >
                  <ContactGate>
                  <Routes>
                    <Route path="/" element={<ProductPage kind="home" />} />
                    <Route path="/pilot" element={<Navigate to="/job-loop" replace />} />
                    <Route path="/check" element={<ProtectedCvCheck />} />
                    <Route path="/onboarding" element={<LoopOnboarding />} />
                    <Route path="/loop" element={<ProtectedJobLoop />} />
                    <Route path="/job-loop" element={<JobLoopOverview />} />
                    <Route path="/guides" element={<CareerGuides />} />
                    <Route path="/guides/:slug" element={<CareerGuideArticle />} />
                    <Route path="/walkthroughs" element={<Walkthroughs />} />
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
                    <Route path="/help" element={<HelpCenter />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route
                      path="/auth/forgot-password"
                      element={<ForgotPassword />}
                    />
                    <Route path="/auth/reset" element={<ResetPassword />} />
                    <Route path="/dashboard" element={<ProtectedWorkspace />} />
                    <Route path="/admin" element={<AdminHome />} />
                    <Route path="/admin/:section" element={<AdminHome />} />
                    <Route path="/admin/:section/:id" element={<AdminHome />} />
                    <Route path="/admin-original" element={<AdminPortal view="operations" />} />
                    <Route path="/admin2" element={<AdminPortal view="founder" />} />
                    <Route path="/marketing-admin" element={<MarketingAdmin />} />
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
                      element={<ProtectedApplications />}
                    />
                    <Route
                      path="/jobs"
                      element={<Navigate to="/job-loop" replace />}
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
                      element={<Navigate to="/guides" replace />}
                    />
                    <Route path="*" element={<ProductPage kind="notfound" />} />
                  </Routes>
                  </ContactGate>
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
