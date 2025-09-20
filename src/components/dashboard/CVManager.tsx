import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  RESUME_BUCKET,
  buildResumeStoragePath,
  isValidResumeFile,
  listResumesFromStorage,
  normalizeResumeFile,
  saveResumeRecord,
  shouldFallbackToStorageListing,
} from "@/lib/resume-storage";
import type { ResumeRecord } from "@/lib/resume-storage";

interface CVManagerProps {
  userPlan: string;
}

export const CVManager = ({ userPlan }: CVManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const getPlanLimits = (plan: string) => {
    switch (plan) {
      case 'elite': return 5;
      case 'pro': return 3;
      default: return 1;
    }
  };

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('id, file_path, created_at, file_name, file_size, mime_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (shouldFallbackToStorageListing(error)) {
          console.warn('Falling back to storage listing for resumes', error);
          const { data: storageData, error: storageError } = await listResumesFromStorage(user.id);
          if (storageError) {
            throw storageError;
          }
          setResumes(storageData ?? []);
          return;
        }

        throw error;
      }

      setResumes((data as ResumeRecord[]) || []);
    } catch (error) {
      console.error('Error fetching resumes:', error);

      if (user?.id) {
        const { data: storageData, error: storageError } = await listResumesFromStorage(user.id);
        if (storageError) {
          console.error('Storage fallback failed:', storageError);
        } else if (storageData) {
          setResumes(storageData);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOC, or DOCX file.",
        variant: "destructive",
      });
      return;
    }

    const maxResumes = getPlanLimits(userPlan);
    if (resumes.length >= maxResumes) {
      toast({
        title: "Resume limit reached",
        description: `Your ${userPlan} plan allows up to ${maxResumes} resume(s). Please upgrade to add more.`,
        variant: "destructive"
      });
      return;
    }

    try {
      // Upload to Supabase Storage
      const normalizedFile = normalizeResumeFile(file);
      const fileName = buildResumeStoragePath(user.id, normalizedFile);

      const { error: uploadError } = await supabase.storage
        .from(RESUME_BUCKET)
        .upload(fileName, normalizedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Save record to database with graceful fallback for legacy schemas
      const { error: dbError, ignoredError } = await saveResumeRecord({
        userId: user.id,
        filePath: fileName,
        originalFileName: file.name,
        fileSize: file.size,
        mimeType: normalizedFile.type || file.type || 'application/octet-stream',
      });

      if (ignoredError) {
        console.warn('Resume metadata not persisted due to legacy schema', ignoredError);
      }

      if (dbError) throw dbError;

      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been uploaded and is ready to use."
      });

      fetchResumes();
    } catch (error) {
      console.error('Error uploading resume:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading your resume. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getFileName = (resume: ResumeRecord) => {
    if (resume.file_name) {
      return resume.file_name.split('.')[0] || resume.file_name;
    }

    return resume.file_path.split('/').pop()?.split('.')[0] || 'Resume';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            CVs & Resumes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxResumes = getPlanLimits(userPlan);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          CVs & Resumes
          <Badge variant="outline" className="ml-auto">
            {resumes.length}/{maxResumes}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumes.length === 0 ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No resumes uploaded</p>
              <p className="text-sm text-muted-foreground">Upload your first resume to get started</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {resumes.slice(0, 3).map((resume) => (
              <div key={resume.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{getFileName(resume)}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(resume.created_at)}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {resumes.length > 3 && (
              <Button variant="ghost" size="sm" className="w-full">
                View all ({resumes.length})
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={resumes.length >= maxResumes}
            />
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              disabled={resumes.length >= maxResumes}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            disabled={resumes.length >= maxResumes}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create
          </Button>
        </div>

        {resumes.length >= maxResumes && userPlan === 'free' && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-center">
              <span className="font-medium">Resume limit reached.</span>
              <br />
              <Button variant="link" size="sm" className="p-0 h-auto">
                Upgrade to add more
              </Button>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};