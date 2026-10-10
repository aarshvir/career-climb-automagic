import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePageExitTracking } from "@/hooks/usePageExitTracking";
import { useForm } from "react-hook-form";
import { sanitizeInput, isValidEmail } from "@/lib/security";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useCallback } from "react";
import { DIALOG_ABANDONMENT_PLACEHOLDER, hasCompletedForm } from "@/lib/interestForm";
import { useOnboarding } from "@/contexts/OnboardingContext";

const formSchema = z.object({
  name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  career_objective: z.string().optional().default(""),
  max_monthly_price: z.string().optional().default("10"),
  app_expectations: z.string().optional().default(""),
});

type FormData = z.infer<typeof formSchema>;

interface InterestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InterestFormDialog = ({ open, onOpenChange }: InterestFormDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const { completeStep } = useOnboarding();
  
  usePageExitTracking(hasCompleted);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      career_objective: "",
      max_monthly_price: "",
      app_expectations: "",
    },
  });

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && hasInteracted && !hasCompleted && user) {
      console.log('📊 Tracking potential form abandonment');
      // Only track abandonment if user doesn't already have a real entry
      supabase
        .from('interest_forms')
        .select('id, name, phone, career_objective, max_monthly_price, app_expectations')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Error checking for existing entry:', error);
            return;
          }

          if (!data || !hasCompletedForm(data)) {
            // User doesn't have a real entry yet, update or create abandonment record
            console.log('📊 Creating/updating abandonment record');
            supabase.from('interest_forms').upsert({
              user_id: user.id,
              email: user.email || '',
              ...DIALOG_ABANDONMENT_PLACEHOLDER
            }, {
              onConflict: 'user_id'
            }).then(({ error }) => {
              if (error) {
                console.error('❌ Error tracking abandonment:', error);
              }
            });
          } else {
            console.log('📊 User has real entry, not tracking abandonment');
          }
        });
    }
    onOpenChange(newOpen);
  }, [hasInteracted, hasCompleted, user, onOpenChange]);

  const onSubmit = useCallback(async (data: FormData) => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "You must be signed in to submit this form.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    if (!isValidEmail(user.email)) {
      toast({
        title: "Error",
        description: "Invalid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('📝 Submitting form for user:', user.id);
      
      // Check if user already has an entry
      const { data: existingEntry, error: checkError } = await supabase
        .from('interest_forms')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('❌ Error checking existing entry:', checkError);
        throw checkError;
      }

      // Sanitize all user inputs
      const formData = {
        user_id: user.id,
        email: user.email,
        name: sanitizeInput(data.name || ''),
        phone: sanitizeInput(data.phone || ''),
        career_objective: sanitizeInput(data.career_objective || ''),
        max_monthly_price: data.max_monthly_price ? parseInt(data.max_monthly_price) : 10,
        app_expectations: sanitizeInput(data.app_expectations || '')
      };

      let error;
      
      if (existingEntry) {
        console.log('📝 Updating existing entry');
        // Update existing entry
        const result = await supabase
          .from('interest_forms')
          .update(formData)
          .eq('user_id', user.id);
        error = result.error;
      } else {
        console.log('📝 Creating new entry');
        // Insert new entry
        const result = await supabase
          .from('interest_forms')
          .insert(formData);
        error = result.error;
      }

      if (error) {
        console.error('❌ Database operation error:', error);
        throw error;
      }

      console.log('✅ Form submitted successfully');
      setHasCompleted(true);
      toast({
        title: "Thank you!",
        description: "Next, upload your CV so we can tailor your matches.",
      });

      onOpenChange(false);
      completeStep('interest');
    } catch (error) {
      console.error('❌ Error submitting form:', error);
      toast({
        title: "Error",
        description: "There was an error submitting your information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [user, toast, onOpenChange, completeStep]);

  const handleInputInteraction = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  }, [hasInteracted]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tell us about yourself</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      onFocus={handleInputInteraction}
                      placeholder="Enter your full name" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      onFocus={handleInputInteraction}
                      placeholder="Enter your phone number" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="career_objective"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Career Objective</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      onFocus={handleInputInteraction}
                      placeholder="What type of job/role are you looking for?" 
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="max_monthly_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What's your maximum monthly budget?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger onFocus={handleInputInteraction}>
                        <SelectValue placeholder="Select your budget range" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="10">$9.99/month (Starter)</SelectItem>
                      <SelectItem value="50">$49/month (Professional)</SelectItem>
                      <SelectItem value="100">$99/month (Elite)</SelectItem>
                      <SelectItem value="200">$200+/month (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="app_expectations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What do you expect from this app?</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      onFocus={handleInputInteraction}
                      placeholder="Tell us what you hope to achieve with JobVance..." 
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InterestFormDialog;