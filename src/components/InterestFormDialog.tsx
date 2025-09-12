import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePageExitTracking } from "@/hooks/usePageExitTracking";
import { useAuth } from "@/contexts/AuthContext";

interface InterestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InterestFormDialog = ({ open, onOpenChange }: InterestFormDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    email: user?.email || '',
    phone: '',
    careerObjective: '',
    maxMonthlyPrice: '',
    appExpectations: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [formCompleted, setFormCompleted] = useState(false);

  // Use page exit tracking  
  usePageExitTracking(formCompleted);

  // Update email when user changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      email: user?.email || ''
    }));
  }, [user?.email]);

  // Track form abandonment
  const handleOpenChange = async (newOpen: boolean) => {
    if (!newOpen && hasInteracted && user) {
      // User is closing the dialog and has interacted with the form
      try {
        await supabase.from('interest_forms').insert({
          user_id: user.id,
          email: user.email || '',
          name: 'Dropped off',
          phone: '+99999999999',
          career_objective: formData.careerObjective || '',
          max_monthly_price: parseInt(formData.maxMonthlyPrice) || 0,
          app_expectations: formData.appExpectations || ''
        });
      } catch (error) {
        console.error('Error saving abandoned form:', error);
      }
    }
    onOpenChange(newOpen);
  };

  const handleInputChange = (field: string, value: string) => {
    setHasInteracted(true);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Only require name and phone
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast({
        title: "Required fields missing",
        description: "Please fill in your name and phone number.",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to submit the form.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('interest_forms').insert({
        user_id: user.id,
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        career_objective: formData.careerObjective || '',
        max_monthly_price: parseInt(formData.maxMonthlyPrice) || 0,
        app_expectations: formData.appExpectations || ''
      });

      if (error) {
        throw error;
      }

      // Mark form as completed
      setFormCompleted(true);

      toast({
        title: "Form submitted successfully!",
        description: "Thank you for your interest. We'll be in touch soon.",
      });

      // Reset form and close dialog
      setFormData({
        name: "",
        email: user?.email || '',
        phone: "",
        careerObjective: "",
        maxMonthlyPrice: "",
        appExpectations: ""
      });
      setHasInteracted(false);
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Thanks for your interest!
          </DialogTitle>
          <p className="text-muted-foreground text-center">
            Our team will get back to you. Please fill the form below.
          </p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="Your phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="career">
              Career Objective <span className="text-sm text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="career"
              value={formData.careerObjective}
              onChange={(e) => handleInputChange('careerObjective', e.target.value)}
              placeholder="Tell us about your career goals and the type of roles you're seeking"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">
              Maximum Monthly Budget <span className="text-sm text-muted-foreground">(optional)</span>
            </Label>
            <Select
              value={formData.maxMonthlyPrice}
              onValueChange={(value) => handleInputChange('maxMonthlyPrice', value)}
            >
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
            <Label htmlFor="expectations">
              App Expectations <span className="text-sm text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="expectations"
              value={formData.appExpectations}
              onChange={(e) => handleInputChange('appExpectations', e.target.value)}
              placeholder="What do you expect from JobVance? Any specific features or requirements?"
              rows={3}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Form"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InterestFormDialog;