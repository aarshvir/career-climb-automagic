import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Crown, Zap, Star, Shield, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import InterestFormDialog from "@/components/InterestFormDialog";
import { useState } from "react";
import { usePromoTimer } from "@/hooks/usePromoTimer";

const Pricing = () => {
  const { user, signInWithGoogle } = useAuth();
  const [showInterestForm, setShowInterestForm] = useState(false);
  const { isPromoActive, formattedTime } = usePromoTimer();
  
  const plans = [
    {
      name: "Starter",
      originalPrice: "$19.99",
      price: isPromoActive ? "$1.99" : "$19.99",
      period: "per month",
      description: "Perfect for students and entry-level professionals",
      features: [
        "1 resume variant",
        "10 job applications per day",
        "Basic location targeting",
        "3 job title preferences",
        "Email support",
        "Basic analytics"
      ],
      popular: false,
      cta: "Get Started"
    },
    {
      name: "Professional",
      originalPrice: "$49",
      price: isPromoActive ? "$19.99" : "$49",
      period: "per month",
      description: "Ideal for experienced professionals",
      features: [
        "3 resume variants",
        "20 job applications per day",
        "Advanced location targeting",
        "5 job title preferences",
        "Priority support",
        "Advanced analytics",
        "Interview preparation tips",
        "Application tracking dashboard"
      ],
      popular: true,
      cta: "Get Started"
    },
    {
      name: "Elite",
      originalPrice: "$99",
      price: "$99",
      period: "per month",
      description: "For executives and senior professionals",
      features: [
        "5 resume variants",
        "50 job applications per day",
        "Global location targeting",
        "Unlimited job title preferences",
        "24/7 priority support",
        "Executive analytics suite",
        "Personal job coach",
        "Custom application templates",
        "LinkedIn optimization",
        "Salary negotiation guidance"
      ],
      popular: false,
      cta: "Get Started"
    }
  ];

  const handlePlanClick = async () => {
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

  return (
    <section id="pricing" className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-4">
            <Crown className="mr-2 h-4 w-4" />
            Simple Pricing
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Job Application Automation{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Pricing Plans
            </span>
          </h2>
          
          {isPromoActive && user && (
            <div className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive mb-4">
              <Clock className="mr-2 h-4 w-4" />
              Limited Time Offer Expires in: {formattedTime}
            </div>
          )}
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start with our free trial and upgrade when you're ready to accelerate your job search.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative ${
                plan.popular 
                  ? 'border-primary shadow-glow bg-gradient-card scale-105' 
                  : 'bg-gradient-card shadow-card hover:shadow-premium'
              } transition-all duration-300`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium flex items-center">
                    <Star className="w-4 h-4 mr-1" />
                    Most Popular
                  </div>
                </div>
              )}
              
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                <div className="mt-4">
                  {isPromoActive && plan.originalPrice && plan.price !== plan.originalPrice && (
                    <div className="text-lg text-muted-foreground line-through mb-1">
                      {plan.originalPrice}
                    </div>
                  )}
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/{plan.period}</span>
                  {isPromoActive && plan.originalPrice && plan.price !== plan.originalPrice && (
                    <div className="text-sm text-primary font-medium mt-2">
                      Use code <span className="font-bold">FORYOU</span> at checkout
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </CardHeader>
              
              <CardContent className="pt-4">
                <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-sm font-medium text-success text-center">
                    Free 7 day trial; no credit card required
                  </p>
                </div>
                
                <Button
                  onClick={handlePlanClick}
                  className={`w-full mb-6 ${plan.popular ? "hero" : "default"}`}
                >
                  {plan.cta}
                </Button>
                
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center">
                      <Check className="h-4 w-4 text-success mr-3 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            All plans include a 7-day free trial. No credit card required.
          </p>
          <div className="flex items-center justify-center space-x-8 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              SSL Secured
            </div>
            <div className="flex items-center">
              <Zap className="h-4 w-4 mr-2" />
              Instant Setup
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-2" />
              Money Back Guarantee
            </div>
          </div>
        </div>

        <InterestFormDialog 
          open={showInterestForm} 
          onOpenChange={setShowInterestForm} 
        />
      </div>
    </section>
  );
};

export default Pricing;