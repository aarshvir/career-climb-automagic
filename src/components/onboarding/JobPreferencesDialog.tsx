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
      const { error } = await supabase
        .from('preferences')
        .upsert({
          user_id: user.id,
          location: preferences.location,
          job_title: preferences.job_title,
          seniority_level: preferences.seniority_level,
          job_type: preferences.job_type,
          job_posting_type: preferences.job_posting_type,
          job_posting_date: preferences.job_posting_date,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your job preferences have been saved successfully.",
      });

      onSuccess();
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Save failed",
        description: "There was an error saving your preferences. Please try again.",
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