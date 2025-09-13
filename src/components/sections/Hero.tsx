import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Bot } from "lucide-react";
import InterestFormDialog from "@/components/InterestFormDialog";
import { useState } from "react";
import { useSignInFlow } from "@/hooks/useSignInFlow";

const Hero = () => {
  const { handleSignInOrAction, user } = useSignInFlow();
  const [showInterestForm, setShowInterestForm] = useState(false);

  const handleGetStarted = () => {
    handleSignInOrAction(() => setShowInterestForm(true));
  };

  const handleWatchDemo = () => {
    handleSignInOrAction(() => setShowInterestForm(true));
  };
  return (
    <section id="home" className="relative py-20 lg:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5"></div>
      
      <div className="container mx-auto px-4 relative">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-8 animate-slide-up">
            <Bot className="mr-2 h-4 w-4" />
            AI-Powered Job Application Automation
          </div>

          {/* Main heading - SEO optimized H1 */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-slide-up">
            Stop Applying. Start Interviewing.{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Let Our AI Automate Your Job Search
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up font-medium">
            Upload your resume, set your preferences, and let our AI apply to 20+ relevant jobs daily. 
            Focus on interviews while we handle the applications. <Link to="/how-it-works" className="underline text-primary hover:text-primary-glow transition-colors">Learn about how JobVance works</Link> or check our <Link to="/pricing" className="underline text-primary hover:text-primary-glow transition-colors">pricing plans</Link>.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up">
            <Button variant="hero" size="xl" className="group" onClick={handleGetStarted}>
              {user ? 'Go to Dashboard' : 'Start Your Job Hunt'}
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button variant="outline" size="xl" onClick={handleWatchDemo}>
              Watch Demo
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-border/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">10,000+</div>
              <div className="text-sm text-muted-foreground">Jobs Applied Daily</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">85%</div>
              <div className="text-sm text-muted-foreground">Interview Success Rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">5,000+</div>
              <div className="text-sm text-muted-foreground">Happy Job Seekers</div>
            </div>
            </div>
          </div>
        </div>

        <InterestFormDialog 
          open={showInterestForm} 
          onOpenChange={setShowInterestForm} 
        />
      </section>
    );
};

export default Hero;