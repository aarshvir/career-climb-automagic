import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, Settings, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Preferences {
  cities: string;
  titles: string;
}

interface JobPreferencesProps {
  userPlan: string;
}

export const JobPreferences = ({ userPlan }: JobPreferencesProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<Preferences>({ cities: '', titles: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const getPlanLimits = (plan: string) => {
    switch (plan) {
      case 'elite': return { cities: 3, titles: 3 };
      case 'pro': return { cities: 2, titles: 2 };
      default: return { cities: 1, titles: 1 };
    }
  };

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  const fetchPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('preferences')
        .select('cities, titles')
        .eq('user_id', user?.id)
        .single();

      if (data) {
        setPreferences(data);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('preferences')
        .upsert({
          user_id: user.id,
          cities: preferences.cities,
          titles: preferences.titles,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your job preferences have been updated successfully."
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const limits = getPlanLimits(userPlan);
  const citiesArray = preferences.cities ? preferences.cities.split(',').map(c => c.trim()).filter(c => c) : [];
  const titlesArray = preferences.titles ? preferences.titles.split(',').map(t => t.trim()).filter(t => t) : [];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Job Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Job Preferences
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEditing ? (
          // Display Mode
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Locations</Label>
                <Badge variant="outline" className="ml-auto text-xs">
                  {citiesArray.length}/{limits.cities}
                </Badge>
              </div>
              {citiesArray.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {citiesArray.slice(0, limits.cities).map((city, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {city}
                    </Badge>
                  ))}
                  {citiesArray.length > limits.cities && userPlan === 'free' && (
                    <Badge variant="outline" className="text-xs">
                      +{citiesArray.length - limits.cities} more
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No locations set</p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Job Titles</Label>
                <Badge variant="outline" className="ml-auto text-xs">
                  {titlesArray.length}/{limits.titles}
                </Badge>
              </div>
              {titlesArray.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {titlesArray.slice(0, limits.titles).map((title, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {title}
                    </Badge>
                  ))}
                  {titlesArray.length > limits.titles && userPlan === 'free' && (
                    <Badge variant="outline" className="text-xs">
                      +{titlesArray.length - limits.titles} more
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No job titles set</p>
              )}
            </div>

            {(citiesArray.length === 0 || titlesArray.length === 0) && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-center">
                  <span className="font-medium">Set your preferences</span>
                  <br />
                  <span className="text-muted-foreground">
                    Add locations and job titles to get better matches
                  </span>
                </p>
              </div>
            )}
          </div>
        ) : (
          // Edit Mode
          <div className="space-y-4">
            <div>
              <Label htmlFor="cities" className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-primary" />
                Preferred Locations
                <Badge variant="outline" className="ml-auto text-xs">
                  Max {limits.cities}
                </Badge>
              </Label>
              <Input
                id="cities"
                value={preferences.cities}
                onChange={(e) => setPreferences(prev => ({ ...prev, cities: e.target.value }))}
                placeholder="e.g., New York, San Francisco, Remote"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate multiple locations with commas
              </p>
            </div>

            <div>
              <Label htmlFor="titles" className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-primary" />
                Job Titles
                <Badge variant="outline" className="ml-auto text-xs">
                  Max {limits.titles}
                </Badge>
              </Label>
              <Input
                id="titles"
                value={preferences.titles}
                onChange={(e) => setPreferences(prev => ({ ...prev, titles: e.target.value }))}
                placeholder="e.g., Software Engineer, Frontend Developer"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate multiple titles with commas
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};