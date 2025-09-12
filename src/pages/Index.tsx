import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import Pricing from "@/components/sections/Pricing";
import SEOHead from "@/components/SEOHead";

const Index = () => {
  return (
    <>
      <SEOHead 
        title="JobVance - AI Job Application Automation | Get More Interviews Fast"
        description="Automate your job search with AI. Apply to 20+ relevant jobs daily with optimized resumes. 85% interview success rate. Start your 7-day free trial today."
        keywords="AI job application automation, automated job search, resume optimization, job hunting automation, career advancement AI, job application bot"
        canonical="https://jobvance.io"
      />
      <div className="min-h-screen bg-background">
        <Header />
        <main role="main">
          <Hero />
          <Features />
          <Pricing />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
