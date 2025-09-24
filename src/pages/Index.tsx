import { useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import Pricing from "@/components/sections/Pricing";
import Testimonials from "@/components/sections/Testimonials";
import CompanyLogos from "@/components/sections/CompanyLogos";
import AIFeatures from "@/components/sections/AIFeatures";
import { SeoHead } from "@/components/SEOHead";
import PromoStrip from "@/components/PromoStrip";
import AuthErrorHandler from "@/components/AuthErrorHandler";
import homepageData from "../../public/jsonld/homepage.json";

const Index = () => {
  return (
    <>
      <SeoHead 
        title="JobVance - AI Job Application Automation | Get More Interviews Fast"
        description="Automate your job search with AI. Apply to 20+ relevant jobs daily with optimized resumes. 85% interview success rate. Start your 7-day free trial today."
        canonicalPath="/"
        structuredData={homepageData}
      />
      <AuthErrorHandler />
      <div className="min-h-screen bg-background">
        <PromoStrip />
        <Header />
        <main role="main">
          <Hero />
          <CompanyLogos />
          <Features />
          <AIFeatures />
          <Testimonials />
          <Pricing />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
