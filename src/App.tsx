import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { InterestFormProvider } from "@/contexts/InterestFormContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { HelmetProvider } from "react-helmet-async";
import PageLoadingSpinner from "@/components/layout/PageLoadingSpinner";
import Header from "@/components/layout/Header";

const Index = lazy(() => import("./pages/Index"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/blog/BlogPost"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PlanSelection = lazy(() => import("./pages/PlanSelection"));
const NotFound = lazy(() => import("./pages/NotFound"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ThankYou = lazy(() => import("./pages/ThankYou"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AutoInterestForm = lazy(() => import("./components/AutoInterestForm"));
const OnboardingRedirector = lazy(() => import("./components/OnboardingRedirector"));
const ResumeUploadDialog = lazy(() =>
  import("./components/onboarding/ResumeUploadDialog").then((module) => ({
    default: module.ResumeUploadDialog,
  }))
);
const JobPreferencesDialog = lazy(() =>
  import("./components/onboarding/JobPreferencesDialog").then((module) => ({
    default: module.JobPreferencesDialog,
  }))
);

// Create query client with proper React context
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const AppContent = () => {
  const { showResumeDialog, showPreferencesDialog, completeStep } = useOnboarding();

  return (
    <>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Header />
        <Suspense fallback={<PageLoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/plan-selection" element={<PlanSelection />} />
            <Route path="/about" element={<About />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/thank-you" element={<ThankYou />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Suspense fallback={null}>
          <OnboardingRedirector />
        </Suspense>
        <Suspense fallback={null}>
          <AutoInterestForm />
        </Suspense>
        <Suspense fallback={null}>
          <ResumeUploadDialog
            open={showResumeDialog}
            onSuccess={() => completeStep('resume')}
          />
        </Suspense>
        <Suspense fallback={null}>
          <JobPreferencesDialog
            open={showPreferencesDialog}
            onSuccess={() => completeStep('preferences')}
          />
        </Suspense>
      </BrowserRouter>
    </>
  );
};

const App: React.FC = () => {
  return (
    <React.StrictMode>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <InterestFormProvider>
              <OnboardingProvider>
                <TooltipProvider>
                  <AppContent />
                </TooltipProvider>
              </OnboardingProvider>
            </InterestFormProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </React.StrictMode>
  );
};

export default App;
