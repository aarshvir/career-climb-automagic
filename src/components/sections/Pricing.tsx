import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Crown, Zap, Star, Shield } from "lucide-react";
import { useSignInFlow } from "@/hooks/useSignInFlow";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { supabase } from "@/integrations/supabase/client";
import { planManager } from "@/utils/planManager";

const Pricing = () => {
  const { handlePrimaryAction } = useSignInFlow();
  const { user } = useAuth();
  const { refreshProfile } = usePlan();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const isUpgrade = location.search.includes('upgrade=true');

  useEffect(() => {
    if (user && isUpgrade) {
      fetchCurrentPlan();
    }
  }, [user, isUpgrade]);

  const fetchCurrentPlan = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user?.id)
        .single();
      setCurrentPlan(data?.plan?.toLowerCase() || 'free');
    } catch (error) {
      console.error('Error fetching current plan:', error);
    }
  };
  
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "per month",
      description: "Perfect for getting started",
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
      cta: "Choose Free"
    },
    {
      name: "Pro",
      price: "$29",
      period: "per month",
      description: "For serious job seekers",
      features: [
        "20 job applications per day",
        "3 CV variants",
        "2 job preference sets",
        "ATS score optimization",
        "Custom CV generation",
        "Priority support"
      ],
      popular: true,
      cta: "Choose Pro"
    },
    {
      name: "Elite",
      price: "$99",
      period: "per month",
      description: "Maximum job search power",
      features: [
        "100 job applications per day",
        "5 CV variants",
        "3 job preference sets",
        "Advanced ATS optimization",
        "AI-powered cover letters",
        "Interview preparation",
        "Dedicated support"
      ],
      popular: false,
      cta: "Choose Elite"
    }
  ];

  const handlePlanClick = async (planName: string) => {
    console.log('🔄 Plan click started:', { planName, isUpgrade, user: !!user, currentPlan }); // Debug
    console.log('👤 User details:', user); // Debug user object
    
    if (isUpgrade && currentPlan === planName.toLowerCase()) {
      console.log('⏭️ Same plan selected, skipping'); // Debug
      return; // Do nothing for current plan
    }
    
    if (user) {
      // Handle plan upgrade using PlanManager
      console.log('💾 Updating plan using PlanManager...'); // Debug
      try {
        // Use PlanManager for robust plan updates
        await planManager.updatePlan(user.id, planName.toLowerCase());
        
        console.log('✅ PlanManager update successful'); // Debug
        
        // Refresh the plan context to pick up the new plan
        console.log('🔄 Refreshing plan context...'); // Debug
        await refreshProfile();
        
        console.log(`✅ Plan upgrade completed: ${planName.toLowerCase()}`); // Debug
        
        // Navigate back to dashboard with success
        navigate('/dashboard?upgrade=success');
      } catch (error) {
        console.error('❌ Failed to update plan:', error); // Debug
        alert(`Failed to update plan: ${error.message}`); // Show error to user
      }
    } else {
      // Regular onboarding flow for non-authenticated users
      console.log('👤 No user, using onboarding flow'); // Debug
      handlePrimaryAction();
    }
  };

  const isCurrentPlan = (planName: string) => {
    return isUpgrade && currentPlan === planName.toLowerCase();
  };

  return (
    <section id="pricing" className="py-4 lg:py-6">
      <div className="container mx-auto px-4">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative ${
                isCurrentPlan(plan.name)
                  ? 'border-muted bg-muted/20 opacity-75'
                  : plan.popular 
                    ? 'border-primary shadow-glow bg-gradient-card scale-105' 
                    : 'bg-gradient-card shadow-card hover:shadow-premium'
              } transition-all duration-300`}
            >
              {isCurrentPlan(plan.name) && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-muted text-muted-foreground px-4 py-1 rounded-full text-sm font-medium flex items-center">
                    <Check className="w-4 h-4 mr-1" />
                    Current Plan
                  </div>
                </div>
              )}
              {!isCurrentPlan(plan.name) && plan.popular && (
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
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/{plan.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </CardHeader>
              
              <CardContent className="pt-4">
                <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-sm font-medium text-success text-center">
                    {plan.name === 'Free' 
                      ? 'Free 7 day trial; no credit card required'
                      : 'Free 3 day trial; no credit card required'
                    }
                  </p>
                </div>
                
                <Button
                  onClick={() => handlePlanClick(plan.name)}
                  disabled={isCurrentPlan(plan.name)}
                  className={`w-full mb-6 ${plan.popular ? "hero" : "default"}`}
                >
                  {isCurrentPlan(plan.name) ? "Current Plan" : plan.cta}
                </Button>
                
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-success mb-2">✓ Included</h4>
                  <ul className="space-y-2">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <Check className="h-4 w-4 text-success mr-3 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {plan.limitations && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Limitations</h4>
                    <ul className="space-y-2">
                      {plan.limitations.map((limitation, limitationIndex) => (
                        <li key={limitationIndex} className="flex items-start">
                          <span className="text-muted-foreground mr-2 mt-0.5">•</span>
                          <span className="text-sm text-muted-foreground">{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Free plan includes 7-day trial, paid plans include 3-day trial. No credit card required.
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
      </div>
    </section>
  );
};

export default Pricing;