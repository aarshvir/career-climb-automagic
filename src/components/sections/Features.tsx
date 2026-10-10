import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Bot, 
  Clock, 
  Target, 
  FileText, 
  MapPin, 
  TrendingUp,
  Shield,
  Zap,
  BarChart3
} from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: Bot,
      title: "AI-Powered Matching",
      description: "Our AI analyzes job descriptions and tailors your resume for each application, maximizing your match score."
    },
    {
      icon: Clock,
      title: "Daily Automation",
      description: "Set your schedule and let our system apply to 20+ relevant jobs every day while you focus on other tasks."
    },
    {
      icon: Target,
      title: "Smart Targeting",
      description: "Choose your preferred locations, job titles, and seniority levels for highly targeted applications."
    },
    {
      icon: FileText,
      title: "Resume Optimization",
      description: "Multiple resume variants with AI-powered tweaks and keyword optimization for each job application."
    },
    {
      icon: MapPin,
      title: "Global Reach",
      description: "Apply to jobs across US, Europe, UAE, and Asia with location-specific customizations."
    },
    {
      icon: BarChart3,
      title: "Performance Analytics",
      description: "Track your application success rate, response rates, and identify the best-performing strategies."
    }
  ];

  return (
    <section id="features" className="py-20 lg:py-32 bg-secondary/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-4">
            <Zap className="mr-2 h-4 w-4" />
            Powerful Features
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            AI-Powered Job Search Features to{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Accelerate Your Career
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our comprehensive platform handles every aspect of your job search, 
            from application to analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card key={index} className="bg-gradient-card shadow-card hover:shadow-premium transition-all duration-300 border-0">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* How it works */}
        <div className="text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-8">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold text-xl">
                1
              </div>
              <h4 className="font-semibold mb-2">Upload Resume</h4>
              <p className="text-sm text-muted-foreground">Upload your resume and set your job preferences</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold text-xl">
                2
              </div>
              <h4 className="font-semibold mb-2">AI Analysis</h4>
              <p className="text-sm text-muted-foreground">Our AI finds and analyzes relevant job postings</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold text-xl">
                3
              </div>
              <h4 className="font-semibold mb-2">Resume Optimization</h4>
              <p className="text-sm text-muted-foreground">AI tailors your resume for each job application</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold text-xl">
                4
              </div>
              <h4 className="font-semibold mb-2">Apply & Track</h4>
              <p className="text-sm text-muted-foreground">Get organized job lists and track your progress</p>
            </div>
          </div>
          
          <Button variant="hero" size="lg">
            Start Free Trial
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Features;