import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { InterestFormProvider } from "@/contexts/InterestFormContext";
import { HelmetProvider } from "react-helmet-async";

// Regular imports instead of lazy loading to fix dynamic import issues
import Index from "./pages/Index";
import About from "./pages/About";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import Blog from "./pages/Blog";
import BlogPost from "./pages/blog/BlogPost";
import Dashboard from "./pages/Dashboard";
import PlanSelection from "./pages/PlanSelection";
import NotFound from "./pages/NotFound";
import HowItWorks from "./pages/HowItWorks";
import PricingPage from "./pages/PricingPage";
import ThankYou from "./pages/ThankYou";
import AuthCallback from "./pages/AuthCallback";
import AutoInterestForm from "./components/AutoInterestForm";
import OnboardingRedirector from "./components/OnboardingRedirector";

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

const basename =
  import.meta.env.BASE_URL === "/"
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/+$/, "");

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InterestFormProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter
              basename={basename}
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
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
                <Route path="/auth/callback" element={<AuthCallback />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              <OnboardingRedirector />
              <AutoInterestForm />
            </BrowserRouter>
          </TooltipProvider>
        </InterestFormProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
