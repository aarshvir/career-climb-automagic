import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Trash2, Star, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { useToast } from '@/hooks/use-toast';

interface ResumeVariant {
  id: string;
  name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  is_primary: boolean;
  created_at: string;
}

interface ResumeVariantManagerProps {
  userPlan: string | null;
}

export function ResumeVariantManager({ userPlan }: ResumeVariantManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const planLimits = usePlanLimits(userPlan);
  const [resumeVariants, setResumeVariants] = useState<ResumeVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchResumeVariants();
    }
  }, [user]);

  const fetchResumeVariants = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('resume_variants')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setResumeVariants(data || []);
    } catch (error) {
      console.error('Error fetching resume variants:', error);
      toast({
        title: "Error",
        description: "Failed to fetch resume variants",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (resumeVariants.length >= planLimits.resumeVariants) {
      toast({
        title: "Upload Limit Reached",
        description: `Your ${userPlan} plan allows ${planLimits.resumeVariants} resume variant${planLimits.resumeVariants > 1 ? 's' : ''}. Please upgrade to upload more.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('jobassist')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save to database
      const { error: dbError } = await supabase
        .from('resume_variants')
        .insert([
          {
            user_id: user.id,
            name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            file_path: fileName,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
            is_primary: resumeVariants.length === 0, // First upload is primary
          }
        ]);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Resume variant uploaded successfully",
      });

      fetchResumeVariants();
    } catch (error) {
      console.error('Error uploading resume:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload resume variant",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = async (id: string) => {
    try {
      // Remove primary from all resumes
      await supabase
        .from('resume_variants')
        .update({ is_primary: false })
        .eq('user_id', user?.id);

      // Set new primary
      const { error } = await supabase
        .from('resume_variants')
        .update({ is_primary: true })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Primary resume updated",
      });

      fetchResumeVariants();
    } catch (error) {
      console.error('Error setting primary resume:', error);
      toast({
        title: "Error",
        description: "Failed to update primary resume",
        variant: "destructive",
      });
    }
  };

  const deleteVariant = async (id: string, filePath: string) => {
    try {
      // Delete from storage
      await supabase.storage
        .from('jobassist')
        .remove([filePath]);

      // Delete from database
      const { error } = await supabase
        .from('resume_variants')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Resume variant deleted",
      });

      fetchResumeVariants();
    } catch (error) {
      console.error('Error deleting resume variant:', error);
      toast({
        title: "Error",
        description: "Failed to delete resume variant",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resume Variants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Resume Variants
          <Badge variant="outline">
            {resumeVariants.length}/{planLimits.resumeVariants}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumeVariants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No resume variants uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {resumeVariants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {variant.name}
                      {variant.is_primary && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {(variant.file_size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!variant.is_primary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPrimary(variant.id)}
                    >
                      Set Primary
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteVariant(variant.id, variant.file_path)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resumeVariants.length < planLimits.resumeVariants && (
          <div>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              id="resume-upload"
              disabled={uploading}
            />
            <label htmlFor="resume-upload">
              <Button
                className="w-full"
                variant="outline"
                disabled={uploading}
                asChild
              >
                <span>
                  {uploading ? (
                    "Uploading..."
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Resume Variant
                    </>
                  )}
                </span>
              </Button>
            </label>
          </div>
        )}

        {resumeVariants.length >= planLimits.resumeVariants && (
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">
              Resume limit reached ({planLimits.resumeVariants})
            </p>
            <Button size="sm" variant="outline">
              Upgrade Plan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}