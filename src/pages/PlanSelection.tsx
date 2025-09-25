import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Crown, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/contexts/PlanContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/SEOHead";

const PlanSelection = () => {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshProfile } = usePlan();

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      description: "Perfect for getting started",
      icon: Star,
      features: [
        "2 job applications per day",
        "1 CV variant",
        "1 job preference set",
        "Basic job matching",
        "Email support"
      ],
      limitations: [
        "Limited job visibility (5 visible, 15 teaser)",
        "No ATS optimization",
        "No custom CV generation"
      ],
      popular: false,
      gradient: "from-slate-500 to-slate-600"
    },
    {
      id: "pro",
      name: "Pro",
      price: "$29",
      description: "For serious job seekers",
      icon: Zap,
      features: [
        "20 job applications per day",
        "3 CV variants",
        "2 job preference sets",
        "ATS score optimization",
        "Custom CV generation",
        "Priority support"
      ],
      limitations: [],
      popular: true,
      gradient: "from-primary to-accent"
    },
    {
      id: "elite",
      name: "Elite",
      price: "$99",
      description: "Maximum job search power",
      icon: Crown,
      features: [
        "100 job applications per day",
        "5 CV variants",
        "3 job preference sets",
        "Advanced ATS optimization",
        "AI-powered cover letters",
        "Interview preparation",
        "Dedicated support"
      ],
      limitations: [],
      popular: false,
      gradient: "from-accent to-primary"
    }
  ];

  const handlePlanSelect = async (planId: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to select a plan.",
        variant: "destructive"
      });
      return;
    }
  
    setLoading(true);
    setSelectedPlan(planId);
  
    try {
      // Insert into plan_selections table
      const { error: planSelectionError } = await supabase
        .from('plan_selections')
        .upsert({
          user_id: user.id,
          selected_plan: planId,
          status: 'completed'
        }, {
          onConflict: 'user_id'
        });
  
      if (planSelectionError) {
        console.error("Plan selection upsert failed:", planSelectionError);
        toast({
          title: "Error",
          description: "Failed to update plan_selections. " + planSelectionError.message,
          variant: "destructive"
        });
        return;
      }
  
      // Upsert the profiles table to ensure record exists
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          plan: planId
        }, {
          onConflict: 'id'
        });
  
      if (profileError) {
        console.error("Profile upsert failed:", profileError);
        toast({
          title: "Error",
          description: "Failed to update profile. " + profileError.message,
          variant: "destructive"
        });
        return;
      }
  
      // Refresh the plan context to pick up the new plan
      await refreshProfile();
  
      toast({
        title: "Plan selected successfully!",
        description: `Welcome to ${plans.find(p => p.id === planId)?.name} plan.`
      });
  
      // Force a hard reload to guarantee fresh context
      window.location.href = "/dashboard";
      // If the plan is still not updated after reload, check Supabase RLS and DB for issues.
    } catch (error) {
      console.error('Error selecting plan:', error);
      toast({
        title: "Error",
        description: "Failed to select plan. " + (error instanceof Error ? error.message : ""),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <>
      <SEOHead 
        title="Choose Your Plan - JobVance"
        description="Select the perfect plan for your job search needs. From free to elite, find the right features to accelerate your career."
      />
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-12 px-4">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Select the perfect plan to accelerate your job search and land your dream role
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <Card 
                  key={plan.id} 
                  className={`relative transition-all duration-300 hover:shadow-premium ${
                    plan.popular ? 'ring-2 ring-primary scale-105' : ''
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-primary">
                      Most Popular
                    </Badge>
                  )}
                  
                  <CardHeader className="text-center">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="text-4xl font-bold">
                      {plan.price}
                      <span className="text-base font-normal text-muted-foreground">/month</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2 text-success">✓ Included</h4>
                      <ul className="space-y-2">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-success" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {plan.limitations.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-muted-foreground">Limitations</h4>
                        <ul className="space-y-2">
                          {plan.limitations.map((limitation, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <span className="w-4 h-4 text-muted-foreground">•</span>
                              <span className="text-sm text-muted-foreground">{limitation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter>
                    <Button
                      className={`w-full ${plan.popular ? 'bg-gradient-primary hover:opacity-90' : ''}`}
                      variant={plan.popular ? "default" : "outline"}
                      onClick={() => handlePlanSelect(plan.id)}
                      disabled={loading && selectedPlan === plan.id}
                    >
                      {loading && selectedPlan === plan.id ? "Selecting..." : `Choose ${plan.name}`}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <p className="text-sm text-muted-foreground">
              All plans include a 7-day free trial • Cancel anytime • No hidden fees
            </p>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default PlanSelection;