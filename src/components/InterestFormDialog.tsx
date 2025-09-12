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

interface InterestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InterestFormDialog = ({ open, onOpenChange }: InterestFormDialogProps) => {
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
  
  // Track page exits for incomplete forms
  usePageExitTracking(hasCompletedForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to submit the form.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('interest_forms')
        .insert({
          user_id: user.id,
          name: formData.name,
          phone: formData.phone,
          career_objective: formData.careerObjective,
          max_monthly_price: parseInt(formData.maxMonthlyPrice),
          app_expectations: formData.appExpectations
        });

      if (error) {
        throw error;
      }

      // Mark form as completed
      setHasCompletedForm(true);

      // Reset form and close dialog
      setFormData({
        name: "",
        phone: "",
        careerObjective: "",
        maxMonthlyPrice: "",
        appExpectations: ""
      });
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

  // Reset completion status when dialog opens
  useEffect(() => {
    if (open) {
      setHasCompletedForm(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="Your phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="career">Career Objective *</Label>
            <Textarea
              id="career"
              value={formData.careerObjective}
              onChange={(e) => setFormData({ ...formData, careerObjective: e.target.value })}
              required
              placeholder="Tell us about your career goals and the type of roles you're seeking"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Maximum Monthly Price *</Label>
            <Select
              value={formData.maxMonthlyPrice}
              onValueChange={(value) => setFormData({ ...formData, maxMonthlyPrice: value })}
              required
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
            <Label htmlFor="expectations">App Expectations *</Label>
            <Textarea
              id="expectations"
              value={formData.appExpectations}
              onChange={(e) => setFormData({ ...formData, appExpectations: e.target.value })}
              required
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