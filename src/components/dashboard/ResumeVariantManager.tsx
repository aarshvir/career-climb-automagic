import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Upload, FileText, Trash2, Star, Plus, Download, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { useToast } from '@/hooks/use-toast';
import { normalizePlan } from '@/utils/planUtils';

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
  const normalizedPlan = normalizePlan(userPlan);
  const planLimits = usePlanLimits(normalizedPlan);
  const [resumeVariants, setResumeVariants] = useState<ResumeVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchResumeVariants = useCallback(async () => {
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
  }, [toast, user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setResumeVariants([]);
      return;
    }

    setLoading(true);
    fetchResumeVariants();
  }, [fetchResumeVariants, user]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (resumeVariants.length >= planLimits.resumeVariants) {
      toast({
        title: "Upload Limit Reached",
        description: `Your ${normalizedPlan} plan allows ${planLimits.resumeVariants} resume variant${planLimits.resumeVariants > 1 ? 's' : ''}. Please upgrade to upload more.`,
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
      const { data: insertedVariant, error: dbError } = await supabase
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
        ])
        .select()
        .single();

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Resume variant uploaded successfully",
      });

      if (insertedVariant) {
        setResumeVariants((prev) => [insertedVariant, ...prev]);
      }
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

      setResumeVariants((prev) =>
        prev.map((variant) => ({
          ...variant,
          is_primary: variant.id === id,
        }))
      );
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

      setResumeVariants((prev) => prev.filter((variant) => variant.id !== id));
    } catch (error) {
      console.error('Error deleting resume variant:', error);
      toast({
        title: "Error",
        description: "Failed to delete resume variant",
        variant: "destructive",
      });
    }
  };

  const downloadVariant = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('jobassist')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading resume:', error);
      toast({
        title: "Error",
        description: "Failed to download resume",
        variant: "destructive",
      });
    }
  };

  const viewVariant = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('jobassist')
        .createSignedUrl(filePath, 60); // 1 minute expiry

      if (error) throw error;

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error viewing resume:', error);
      toast({
        title: "Error",
        description: "Failed to view resume",
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => viewVariant(variant.file_path)}
                    title="View resume"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadVariant(variant.file_path, variant.file_name)}
                    title="Download resume"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!variant.is_primary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPrimary(variant.id)}
                    >
                      Set Primary
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Resume</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{variant.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteVariant(variant.id, variant.file_path)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        {resumeVariants.length < planLimits.resumeVariants && (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              id="resume-upload"
              disabled={uploading}
            />
            <label htmlFor="resume-upload" className="cursor-pointer">
              <div className="space-y-3">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {uploading ? "Uploading..." : "Upload Resume"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, DOC, DOCX up to 10MB
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={uploading}
                  className="pointer-events-none"
                >
                  {uploading ? (
                    "Uploading..."
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Choose File
                    </>
                  )}
                </Button>
              </div>
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