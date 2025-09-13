import { useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Upload, Bot, Target, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import PromoStrip from "@/components/PromoStrip";

const HowItWorks = () => {
  useEffect(() => {
    document.title = "How JobVance Automates Your Job Search with AI | JobVance.io";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Learn how JobVance's AI automation works: upload your resume, set preferences, and let our AI apply to 20+ jobs daily. See the 4-step process."
      );
    }

    // Add structured data for HowTo
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": "How to Automate Your Job Search with AI",
      "description": "Step-by-step guide to automating job applications using JobVance AI",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Upload Your Resume",
          "text": "Upload your existing resume and let our AI analyze your skills and experience"
        },
        {
          "@type": "HowToStep",
          "name": "Set Job Preferences",
          "text": "Define your ideal job criteria including role, location, salary, and company size"
        },
        {
          "@type": "HowToStep",
          "name": "AI Applies Daily",
          "text": "Our AI searches and applies to 20+ relevant jobs every day with optimized applications"
        },
        {
          "@type": "HowToStep", 
          "name": "Track & Interview",
          "text": "Monitor applications in your dashboard and focus on preparing for interviews"
        }
      ]
    });
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const steps = [
    {
      icon: Upload,
      title: "Upload Your Resume",
      description: "Upload your existing resume and let our AI analyze your skills, experience, and career goals to create the perfect job search profile.",
      details: "Our advanced AI parsing technology extracts key information from your resume including skills, experience levels, education, and achievements."
    },
    {
      icon: Target,
      title: "Set Job Preferences", 
      description: "Define your ideal job criteria including role types, locations, salary ranges, company sizes, and industries you're interested in.",
      details: "Customize your search with detailed filters for remote work, company culture, benefits, and growth opportunities."
    },
    {
      icon: Bot,
      title: "AI Applies Daily",
      description: "Our AI searches thousands of job boards daily and applies to 20+ relevant positions with personalized cover letters and optimized resumes.",
      details: "Each application is tailored to the specific job requirements, increasing your chances of getting noticed by recruiters."
    },
    {
      icon: CheckCircle,
      title: "Track & Interview",
      description: "Monitor all your applications in real-time through your dashboard and focus your time on interview preparation instead of applications.",
      details: "Get detailed analytics on application success rates, interview callbacks, and job market trends in your field."
    }
  ];

  return (
    <>
      <div className="min-h-screen bg-background">
        <PromoStrip />
        <Header />
        <main role="main">
          {/* Hero Section */}
          <section className="py-20 lg:py-32">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-4xl mx-auto mb-16">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                  How JobVance Automates Your{" "}
                  <span className="bg-gradient-primary bg-clip-text text-transparent">
                    Job Search with AI
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Stop spending hours on job applications. Our AI handles the tedious work while you focus on what matters - preparing for interviews and landing your dream job.
                </p>
                <Link to="/pricing">
                  <Button size="lg" className="group">
                    Start Automating Today
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* How It Works Steps */}
          <section className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  4 Simple Steps to Job Search Success
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Our proven process has helped thousands of professionals land their dream jobs faster than traditional job searching methods.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {steps.map((step, index) => (
                  <Card key={index} className="text-center h-full">
                    <CardHeader>
                      <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                        <step.icon className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-sm font-medium text-primary mb-2">Step {index + 1}</div>
                      <CardTitle className="text-xl">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="mb-4">{step.description}</CardDescription>
                      <p className="text-sm text-muted-foreground">{step.details}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Benefits Section */}
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">
                    Why Choose AI Job Application Automation?
                  </h2>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-2">Save 20+ Hours Per Week</h3>
                        <p className="text-muted-foreground">Stop spending endless hours copying and pasting applications. Our AI does it all automatically while you focus on interview prep.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-2">85% Higher Interview Rate</h3>
                        <p className="text-muted-foreground">Our AI personalizes each application to match job requirements, dramatically increasing your chances of getting interviews.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-2">Never Miss Opportunities</h3>
                        <p className="text-muted-foreground">Apply to new positions within hours of posting, giving you a competitive edge over manual job seekers.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <img
                    src="/placeholder.svg"
                    alt="JobVance.io AI dashboard showing automated job applications and success metrics"
                    className="rounded-lg shadow-2xl w-full"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20 bg-primary text-primary-foreground">
            <div className="container mx-auto px-4 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Automate Your Job Search?
              </h2>
              <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90">
                Join thousands of professionals who've transformed their job search with AI automation. Start your free trial today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/pricing">
                  <Button variant="secondary" size="lg" className="group">
                    View Pricing Plans
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-primary">
                    Schedule a Demo
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default HowItWorks;