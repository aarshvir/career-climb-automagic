import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationDropdown } from "@/components/ui/LocationDropdown";
import { Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface JobPreferencesDialogProps {
  open: boolean;
  onSuccess: () => void;
}

const SENIORITY_LEVELS = [
  "Internship",
  "Entry level",
  "Associate",
  "Mid-Senior level",
  "Director",
  "Executive"
];

const JOB_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Temporary",
  "Volunteer",
  "Internship"
];

const JOB_POSTING_TYPES = [
  "Easy apply",
  "All jobs"
];

const JOB_POSTING_DATES = [
  "Last 24 hours",
  "Last 3 days",
  "Last week",
  "Last month",
  "Any time"
];

export const JobPreferencesDialog = ({ open, onSuccess }: JobPreferencesDialogProps) => {
  const [preferences, setPreferences] = useState({
    location: "",
    job_title: "",
    seniority_level: "",
    job_type: "",
    job_posting_type: "All jobs",
    job_posting_date: "Last week"
  });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!user) return;

    // Validate required fields
    if (!preferences.location || !preferences.job_title || !preferences.seniority_level || !preferences.job_type || !preferences.job_posting_type || !preferences.job_posting_date) {
      toast({
        title: "All fields required",
        description: "Please fill in all job preference fields.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      console.log('🚀 Starting save operation...');
      console.log('💾 Saving preferences:', preferences);
      console.log('👤 User ID:', user.id);
      console.log('🔍 User object:', user);
      
      // First, try to check if preferences table exists and what columns it has
      console.log('🔍 Checking table structure...');
      
      const preferencesData = {
          user_id: user.id,
          location: preferences.location,
          job_title: preferences.job_title,
          seniority_level: preferences.seniority_level,
          job_type: preferences.job_type,
        job_posting_type: preferences.job_posting_type,
        job_posting_date: preferences.job_posting_date,
      };
      
      console.log('📤 Data to be saved:', preferencesData);
      
      // Try multiple save strategies
      let saveResult;
      
      // Strategy 1: Try upsert with onConflict
      try {
        console.log('🎯 Strategy 1: Upsert with onConflict');
        saveResult = await supabase
          .from('preferences')
          .upsert(preferencesData, {
            onConflict: 'user_id'
          });
        console.log('✅ Strategy 1 result:', saveResult);
      } catch (error1) {
        console.log('❌ Strategy 1 failed:', error1);
        
        // Strategy 2: Try simple insert
        try {
          console.log('🎯 Strategy 2: Simple insert');
          saveResult = await supabase
            .from('preferences')
            .insert(preferencesData);
          console.log('✅ Strategy 2 result:', saveResult);
        } catch (error2) {
          console.log('❌ Strategy 2 failed:', error2);
          
          // Strategy 3: Try update if exists, insert if not
          console.log('🎯 Strategy 3: Update or insert');
          const { data: existingData, error: selectError } = await supabase
            .from('preferences')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
            
          console.log('🔍 Existing data check:', { existingData, selectError });
          
          if (existingData) {
            console.log('🔄 Updating existing preferences');
            saveResult = await supabase
              .from('preferences')
              .update(preferencesData)
              .eq('user_id', user.id);
          } else {
            console.log('➕ Inserting new preferences');
            saveResult = await supabase
              .from('preferences')
              .insert(preferencesData);
          }
          console.log('✅ Strategy 3 result:', saveResult);
        }
      }
      
      const { data, error } = saveResult;
      console.log('📊 Final save result:', { data, error });
      
      if (error) {
        console.error('❌ Supabase error details:', JSON.stringify(error, null, 2));
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error hint:', error.hint);
        console.error('❌ Error details:', error.details);
        throw error;
      }

      toast({
        title: "Preferences saved",
        description: "Your job preferences have been saved successfully.",
      });

      onSuccess();
    } catch (error: any) {
      console.error('💥 Save operation failed:', error);
      
      let errorMessage = "There was an error saving your preferences. Please try again.";
      
      if (error?.message) {
        errorMessage = `Save failed: ${error.message}`;
      }
      
      if (error?.code === 'PGRST116') {
        errorMessage = "Database table not found. Please contact support.";
      }
      
      if (error?.code === '42P01') {
        errorMessage = "Database table missing. Please contact support.";
      }
      
      if (error?.message?.includes('permission')) {
        errorMessage = "Permission denied. Please try signing out and back in.";
      }
      
      if (error?.message?.includes('RLS')) {
        errorMessage = "Database security issue. Please contact support.";
      }
      
      console.error('🔴 Final error message shown to user:', errorMessage);
      
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Preferences
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tell us about your job preferences to help us find the best matches for you.
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="location">Preferred Location</Label>
            <LocationDropdown
              value={preferences.location}
              onValueChange={(value) => setPreferences({ ...preferences, location: value })}
              placeholder="Select your preferred location"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-title">Job Title</Label>
            <Input
              id="job-title"
              placeholder="e.g., Software Engineer, Product Manager"
              value={preferences.job_title}
              onChange={(e) => setPreferences({ ...preferences, job_title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seniority">Seniority Level</Label>
            <Select
              value={preferences.seniority_level}
              onValueChange={(value) => setPreferences({ ...preferences, seniority_level: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select seniority level" />
              </SelectTrigger>
              <SelectContent>
                {SENIORITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-type">Job Type</Label>
            <Select
              value={preferences.job_type}
              onValueChange={(value) => setPreferences({ ...preferences, job_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select job type" />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-posting-type">Job Posting Type</Label>
            <Select
              value={preferences.job_posting_type}
              onValueChange={(value) => setPreferences({ ...preferences, job_posting_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select posting type" />
              </SelectTrigger>
              <SelectContent>
                {JOB_POSTING_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-posting-date">Job Posting Date</Label>
            <Select
              value={preferences.job_posting_date}
              onValueChange={(value) => setPreferences({ ...preferences, job_posting_date: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select posting date" />
              </SelectTrigger>
              <SelectContent>
                {JOB_POSTING_DATES.map((date) => (
                  <SelectItem key={date} value={date}>
                    {date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};