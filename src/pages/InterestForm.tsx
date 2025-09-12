import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ArrowLeft, User, Phone, Target, DollarSign, MessageSquare } from "lucide-react";
import { usePageExitTracking } from "@/hooks/usePageExitTracking";

const InterestForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    careerObjective: "",
    maxMonthlyPrice: "",
    appExpectations: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCompletedForm, setHasCompletedForm] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Track page exits for incomplete forms
  usePageExitTracking(hasCompletedForm);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('interest_forms')
        .insert([
          {
            user_id: user.id,
            name: formData.name,
            phone: formData.phone,
            career_objective: formData.careerObjective,
            max_monthly_price: parseInt(formData.maxMonthlyPrice) || 0,
            app_expectations: formData.appExpectations
          }
        ]);

      if (error) throw error;

      // Mark form as completed
      setHasCompletedForm(true);
      
      // Redirect to thank you page
      navigate('/thank-you');
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        title: "Submission failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      <SEOHead 
        title="Interest Form - JobVance"
        description="Tell us about your job search preferences and career objectives."
        keywords="job search, career objectives, interest form"
        canonical="https://jobvance.io/interest-form"
      />
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4">Tell Us About Your Job Search</h1>
              <p className="text-lg text-muted-foreground">
                Help us understand your career goals and preferences so we can provide the best service.
              </p>
            </div>

            <Card className="bg-gradient-card shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Your Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      required
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      required
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="careerObjective" className="flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Career Objective
                    </Label>
                    <Textarea
                      id="careerObjective"
                      value={formData.careerObjective}
                      onChange={(e) => handleInputChange('careerObjective', e.target.value)}
                      required
                      placeholder="Describe your career goals and objectives"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Maximum Monthly Price
                    </Label>
                    <Select onValueChange={(value) => handleInputChange('maxMonthlyPrice', value)} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your budget range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="29">$29 - Starter Plan</SelectItem>
                        <SelectItem value="99">$99 - Professional Plan</SelectItem>
                        <SelectItem value="200">$200 - Enterprise Plan</SelectItem>
                        <SelectItem value="custom">Custom Budget</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appExpectations" className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      App Expectations
                    </Label>
                    <Textarea
                      id="appExpectations"
                      value={formData.appExpectations}
                      onChange={(e) => handleInputChange('appExpectations', e.target.value)}
                      required
                      placeholder="What do you expect from our job application automation service?"
                      rows={3}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/')}
                      className="flex items-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Home
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Interest Form"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
        
        <Footer />
      </div>
    </>
  );
};

export default InterestForm;