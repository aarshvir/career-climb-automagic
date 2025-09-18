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
import { useNavigate } from "react-router-dom";
import { usePageExitTracking } from "@/hooks/usePageExitTracking";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useCallback } from "react";

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
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  
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
      // Only track abandonment if user doesn't already have a form entry
      console.log('🚪 Dialog closing, checking for abandonment tracking...');
      supabase
        .from('interest_forms')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Error checking existing entry:', error);
            return;
          }
          
          if (!data) {
            console.log('📝 Tracking form abandonment');
            // User doesn't have an entry yet, track abandonment using upsert
            supabase.from('interest_forms').upsert({
              user_id: user.id,
              email: user.email || '',
              name: 'user dropped from dialog',
              phone: '+99999999999',
              career_objective: '',
              max_monthly_price: 0,
              app_expectations: ''
            }, {
              onConflict: 'user_id'
            }).then(({ error }) => {
              if (error) {
                console.error('❌ Error tracking abandonment:', error);
              } else {
                console.log('✅ Abandonment tracked');
              }
            });
          } else {
            console.log('✅ User already has entry, skipping abandonment tracking');
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

    setIsSubmitting(true);

    try {
      console.log('📝 Submitting form data:', data);
      
      // Now we can use upsert properly with the unique constraint
      const { error } = await supabase.from('interest_forms').upsert({
        user_id: user.id,
        email: user.email,
        name: data.name || '',
        phone: data.phone || '',
        career_objective: data.career_objective || '',
        max_monthly_price: data.max_monthly_price ? parseInt(data.max_monthly_price) : 10,
        app_expectations: data.app_expectations || ''
      }, {
        onConflict: 'user_id'
      });

      if (error) {
        console.error('❌ Upsert error:', error);
        throw error;
      }

      console.log('✅ Form submitted successfully');
      setHasCompleted(true);
      
      toast({
        title: "Thank you!",
        description: "Now let's choose the perfect plan for your job search.",
      });

      onOpenChange(false);
      navigate('/plan-selection');
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
  }, [user, toast, navigate, onOpenChange]);

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