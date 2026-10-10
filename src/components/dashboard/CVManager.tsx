import { useEffect, useState, useRef } from "react";
import { FileText, Upload, Plus, Clock, Trash2, Eye, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlan } from "@/utils/planUtils";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalizedPlan = normalizePlan(userPlan);
  const planLimits = usePlanLimits(normalizedPlan);

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchResumes = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("resumes")
        .select("id, file_path, created_at, file_name, file_size, mime_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        if (shouldFallbackToStorageListing(error)) {
          console.warn("Falling back to storage listing for resumes", error);
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
      console.error("Error fetching resumes:", error);

      if (user?.id) {
        const { data: storageData, error: storageError } = await listResumesFromStorage(user.id);
        if (storageError) {
          console.error("Storage fallback failed:", storageError);
        } else if (storageData) {
          setResumes(storageData);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;

    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOC, or DOCX file.",
        variant: "destructive",
      });
      return;
    }

    if (resumes.length >= planLimits.resumeVariants) {
      toast({
        title: "Resume limit reached",
        description: `Your ${normalizedPlan} plan allows up to ${planLimits.resumeVariants} resume(s). Please upgrade to add more.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const normalizedFile = normalizeResumeFile(file);
      const fileName = buildResumeStoragePath(user.id, normalizedFile);

      console.log('Uploading file:', {
        name: normalizedFile.name,
        size: normalizedFile.size,
        type: normalizedFile.type,
        path: fileName,
      });

      const { uploadFileWithRetry } = await import('@/utils/uploadUtils');
      const uploadResult = await uploadFileWithRetry(normalizedFile, fileName, RESUME_BUCKET);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      const { data: recordData, error: dbError, ignoredError, fallbackApplied } = await saveResumeRecord({
        userId: user.id,
        filePath: fileName,
        originalFileName: file.name,
        fileSize: file.size,
        mimeType: normalizedFile.type || file.type || "application/octet-stream",
      });

      if (dbError) throw dbError;

      if (ignoredError) {
        console.warn("Database metadata ignored:", ignoredError, "fallback:", fallbackApplied);
      }

      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been uploaded and is ready to use.",
      });

      fetchResumes();
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was an error uploading your resume. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleViewResume = async (resume: ResumeRecord) => {
    try {
      const { data, error } = await supabase.storage
        .from(RESUME_BUCKET)
        .createSignedUrl(resume.file_path, 300);

      if (error) throw error;
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing resume:', error);
      toast({
        title: "View failed",
        description: "Unable to open resume. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteResume = async (resume: ResumeRecord) => {
    try {
      const { error: storageError } = await supabase.storage
        .from(RESUME_BUCKET)
        .remove([resume.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('resumes')
        .delete()
        .eq('id', resume.id);

      if (dbError) throw dbError;

      toast({
        title: "Resume deleted",
        description: "Resume has been permanently deleted.",
      });

      fetchResumes();
    } catch (error) {
      console.error('Error deleting resume:', error);
      toast({
        title: "Delete failed",
        description: "Unable to delete resume. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpgradePlan = () => {
    navigate('/pricing?upgrade=true');
  };

  const getFileName = (resume: ResumeRecord) => {
    if (resume.file_name) {
      return resume.file_name.split(".")[0] || resume.file_name;
    }
    return resume.file_path.split("/").pop()?.split(".")[0] || "Resume";
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const canUpload = resumes.length < planLimits.resumeVariants;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drag and Drop Upload Zone */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 transition-all",
          dragActive && canUpload ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          !canUpload && "opacity-50 cursor-not-allowed",
          canUpload && "hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => canUpload && !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="hidden"
          disabled={!canUpload || uploading}
        />
        
        <div className="text-center space-y-4">
          <div className={cn(
            "w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-colors",
            dragActive && canUpload ? "bg-primary/10" : "bg-muted"
          )}>
            <Upload className={cn(
              "w-8 h-8 transition-colors",
              dragActive && canUpload ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          
          <div>
            <p className="text-lg font-semibold text-foreground mb-1">
              {uploading ? "Uploading..." : "Drop your resume here"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse • PDF, DOC, DOCX • Max 10MB
            </p>
          </div>

          {!canUpload && (
            <div className="flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>Resume limit reached ({resumes.length}/{planLimits.resumeVariants})</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline">
              {resumes.length}/{planLimits.resumeVariants} resumes
            </Badge>
            {normalizedPlan === 'free' && (
              <Button
                variant="link"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpgradePlan();
                }}
                className="h-auto p-0"
              >
                Upgrade for more →
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Resume List */}
      {resumes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Your Resumes</h3>
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate" title={getFileName(resume)}>
                    {getFileName(resume)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(resume.created_at)}
                    </span>
                    {resume.file_size && (
                      <span>{formatFileSize(resume.file_size)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleViewResume(resume)}
                  title="View resume"
                  className="h-9 w-9 p-0"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 hover:text-destructive"
                      title="Delete resume"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Resume</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{getFileName(resume)}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteResume(resume)}
                        className="bg-destructive hover:bg-destructive/90"
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

      {/* Empty State */}
      {resumes.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <p className="text-sm text-muted-foreground">
            No resumes uploaded yet. Upload your first resume above to get started.
          </p>
        </div>
      )}
    </div>
  );
};
