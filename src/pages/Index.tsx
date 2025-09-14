import { useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import Pricing from "@/components/sections/Pricing";
import Testimonials from "@/components/sections/Testimonials";
import CompanyLogos from "@/components/sections/CompanyLogos";
import AIFeatures from "@/components/sections/AIFeatures";
import SEOHead from "@/components/SEOHead";
import PromoStrip from "@/components/PromoStrip";
import AuthErrorHandler from "@/components/AuthErrorHandler";

const Index = () => {
  useEffect(() => {
    document.title = "JobVance.io | AI Job Application Automation - Apply Faster";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Tired of endless job applications? JobVance uses AI to automatically apply to jobs for you. Land your next role faster. Get started for free."
      );
    }

    // Add SoftwareApplication structured data
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "JobVance",
      "description": "JobVance automates job applications with AI so job seekers can apply faster and land interviews.",
      "url": "https://jobvance.io",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "reviewCount": "124"
      },
      "offers": {
        "@type": "Offer",
        "price": "29",
        "priceCurrency": "USD"
      }
    });
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return (
    <>
      <SEOHead 
        title="JobVance - AI Job Application Automation | Get More Interviews Fast"
        description="Automate your job search with AI. Apply to 20+ relevant jobs daily with optimized resumes. 85% interview success rate. Start your 7-day free trial today."
        keywords="AI job application automation, automated job search, resume optimization, job hunting automation, career advancement AI, job application bot"
        canonical="https://jobvance.io"
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
