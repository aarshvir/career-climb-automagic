import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle, MessageSquare, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InterestFormDialog from "@/components/InterestFormDialog";
import { SeoHead, faqJsonLd, buildWebPageJsonLd } from "@/components/SEOHead";

const FAQ = () => {
  const { user, signInWithGoogle } = useAuth();
  const [showInterestForm, setShowInterestForm] = useState(false);

  const handleGetStarted = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }
    
    setShowInterestForm(true);
  };
  const faqs = [
    {
      q: "How does AI job application automation work?",
      a: "Our AI analyzes your resume, searches thousands of job boards daily, and automatically applies to positions matching your criteria. Each application includes a personalized cover letter and optimized resume tailored to the specific job requirements."
    },
    {
      q: "How many jobs will JobVance apply to for me daily?",
      a: "Depending on your plan, JobVance applies to 10-50+ relevant jobs daily. The Starter plan covers 10 applications per day, Professional covers 25, and Elite covers 50+ applications daily."
    },
    {
      q: "Can I control which jobs the AI applies to?",
      a: "Absolutely! You set detailed preferences including job titles, salary ranges, locations, company sizes, industries, and even specific companies to target or avoid. The AI only applies to jobs that match your criteria."
    },
    {
      q: "Will employers know my application was automated?",
      a: "No. Each application appears completely natural with personalized cover letters and resumes tailored to the specific role. Our AI creates unique, human-like applications that pass all standard screening processes."
    },
    {
      q: "What's the average interview success rate?",
      a: "JobVance users see an 85% higher interview callback rate compared to manual applications. Most users receive their first interview within 1-2 weeks of starting the service."
    },
    {
      q: "How much time does JobVance save me?",
      a: "Users typically save 20-30 hours per week by automating their job applications. Instead of spending time on repetitive applications, you can focus on interview preparation and networking."
    },
    {
      q: "Is my personal information secure?",
      a: "Yes. We use enterprise-grade encryption and security measures. Your resume and personal data are stored securely and never shared with third parties. You maintain full control over your information."
    },
    {
      q: "Can I pause my job search automation?",
      a: "Yes, you can pause and resume your automation at any time through your dashboard. This is useful when you're in interview processes or want to take a break from job searching."
    },
    {
      q: "What types of jobs does JobVance support?",
      a: "JobVance works across all industries and job levels, from entry-level to executive positions. We support remote, hybrid, and on-site roles in technology, healthcare, finance, marketing, sales, and more."
    },
    {
      q: "How do I track my job applications?",
      a: "Your JobVance dashboard provides real-time tracking of all applications, including which jobs were applied to, application status, interview requests, and detailed analytics on your job search performance."
    },
    {
      q: "What if I don't like the jobs being applied to?",
      a: "You can easily adjust your preferences anytime. The AI learns from your feedback and becomes more accurate over time. You can also exclude specific companies or job types from future applications."
    },
    {
      q: "Does JobVance work for international job searches?",
      a: "Currently, JobVance primarily focuses on job markets in the United States, Canada, and the United Kingdom. We're expanding to additional countries based on user demand."
    },
    {
      q: "Can I use my existing resume?",
      a: "Yes! Upload your current resume and our AI will analyze and optimize it for each application. You can also create multiple resume versions for different types of roles."
    },
    {
      q: "What happens if I get an interview?",
      a: "Congratulations! JobVance will automatically pause applications to that company and similar roles while you go through the interview process. You can manually control this through your dashboard."
    },
    {
      q: "Is there a money-back guarantee?",
      a: "Yes, we offer a 30-day interview guarantee. If you don't receive at least 3 interview requests in your first 30 days, we'll provide a full refund of your subscription fee."
    }
  ];

  const faqStructuredData = faqJsonLd(faqs.map(faq => ({ question: faq.q, answer: faq.a })));
  const webPageStructuredData = buildWebPageJsonLd({
    name: "Frequently Asked Questions",
    description: "Get answers to common questions about JobVance AI job application automation.",
    canonicalUrl: "https://jobvance.io/faq"
  });

  return (
    <>
      <SeoHead
        title="Frequently Asked Questions - AI Job Application Automation | JobVance.io"
        description="Get answers to common questions about JobVance AI job application automation. Learn how our service works, pricing, security, and success rates."
        canonicalPath="/faq"
        structuredData={[webPageStructuredData, faqStructuredData]}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <main role="main">
          {/* Hero Section */}
          <section className="py-20 lg:py-32">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-4xl mx-auto mb-16">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                  Frequently Asked{" "}
                  <span className="bg-gradient-primary bg-clip-text text-transparent">
                    Questions
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Everything you need to know about JobVance AI job application automation. Can't find what you're looking for? Contact our support team.
                </p>
              </div>
            </div>
          </section>

          {/* FAQ Accordion */}
          <section className="py-20">
            <div className="container mx-auto px-4 max-w-4xl">
              <Accordion type="single" collapsible className="space-y-4">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* Additional Help Section */}
          <section className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Still Need Help?
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Our support team is here to help you succeed with automated job applications.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                <Card className="text-center">
                  <CardHeader>
                    <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Email Support</CardTitle>
                    <CardDescription>Get detailed help via email</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Send us your questions and we'll respond within 24 hours with detailed guidance.
                    </p>
                    <Button variant="outline" asChild>
                      <a href="mailto:support@jobvance.io">Email Support</a>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Live Chat</CardTitle>
                    <CardDescription>Instant help when you need it</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Chat with our team during business hours for immediate assistance.
                    </p>
                    <Button variant="outline">Start Live Chat</Button>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                      <HelpCircle className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Help Center</CardTitle>
                    <CardDescription>Comprehensive guides & tutorials</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Browse our knowledge base for step-by-step guides and video tutorials.
                    </p>
                    <Button variant="outline">Visit Help Center</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20">
            <div className="container mx-auto px-4 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Start Your Automated Job Search?
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who've accelerated their careers with AI job application automation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={handleGetStarted}>Start Free Trial</Button>
                <Link to="/how-it-works">
                  <Button variant="outline" size="lg">Learn How It Works</Button>
                </Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
      
      <InterestFormDialog 
        open={showInterestForm} 
        onOpenChange={setShowInterestForm} 
      />
    </>
  );
};

export default FAQ;