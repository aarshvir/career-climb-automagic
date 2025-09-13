import { useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Pricing from "@/components/sections/Pricing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Star } from "lucide-react";
import PromoStrip from "@/components/PromoStrip";

const PricingPage = () => {
  useEffect(() => {
    document.title = "Pricing Plans for Automated Job Applications | JobVance.io";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Compare JobVance pricing plans for automated job applications. Choose from Starter ($29), Professional ($79), or Elite ($149) plans. 7-day free trial included."
      );
    }

    // Add structured data for pricing
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "JobVance AI Job Application Automation",
      "description": "AI-powered job application automation service with multiple pricing tiers",
      "offers": [
        {
          "@type": "Offer",
          "name": "Starter Plan",
          "price": "29",
          "priceCurrency": "USD",
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock"
        },
        {
          "@type": "Offer", 
          "name": "Professional Plan",
          "price": "79",
          "priceCurrency": "USD", 
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock"
        },
        {
          "@type": "Offer",
          "name": "Elite Plan", 
          "price": "149",
          "priceCurrency": "USD",
          "priceValidUntil": "2025-12-31", 
          "availability": "https://schema.org/InStock"
        }
      ],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "reviewCount": "5000"
      }
    });
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "Software Engineer",
      company: "Tech Startup",
      content: "JobVance got me 3x more interviews than manual applications. Landed my dream job in 2 weeks!",
      rating: 5
    },
    {
      name: "Michael Rodriguez", 
      role: "Marketing Manager",
      company: "Fortune 500",
      content: "The AI personalization is incredible. Each application felt hand-crafted for the role.",
      rating: 5
    },
    {
      name: "Emily Johnson",
      role: "Data Analyst", 
      company: "Healthcare Corp",
      content: "Saved me 25+ hours per week. I could focus on interview prep instead of endless applications.",
      rating: 5
    }
  ];

  return (
    <>
      <div className="min-h-screen bg-background">
        <PromoStrip />
        <Header />
        <main role="main">
          {/* Hero Section */}
          <section className="py-6 lg:py-8">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-3xl mx-auto mb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Pricing Plans for{" "}
                  <span className="bg-gradient-primary bg-clip-text text-transparent">
                    Automated Job Applications
                  </span>
                </h1>
                <p className="text-base text-muted-foreground mb-4 max-w-xl mx-auto">
                  Choose your plan and start applying to jobs automatically with AI.
                </p>
                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>7-day free trial</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>Cancel anytime</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing Cards */}
          <Pricing />

          {/* FAQ Section */}
          <section className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Pricing FAQ
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Common questions about our automated job application pricing plans.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">How does the free trial work?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      Start with a 7-day free trial on any plan. No credit card required. Cancel anytime during the trial period with no charges.
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Can I change plans later?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      Yes! Upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle with prorated adjustments.
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">What if I don't get interviews?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      We offer a 30-day interview guarantee. If you don't get at least 3 interview requests in your first month, we'll refund your subscription.
                    </CardDescription>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Are there any hidden fees?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      No hidden fees. The monthly price includes all features, unlimited applications, resume optimization, and customer support.
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Testimonials */}
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  What Our Users Say
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Join thousands of professionals who've accelerated their job search with JobVance automation.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {testimonials.map((testimonial, index) => (
                  <Card key={index} className="text-center">
                    <CardHeader>
                      <div className="flex justify-center mb-4">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-5 h-5 fill-primary text-primary" />
                        ))}
                      </div>
                      <CardDescription className="text-base italic">
                        "{testimonial.content}"
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="font-semibold">{testimonial.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {testimonial.role} at {testimonial.company}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default PricingPage;