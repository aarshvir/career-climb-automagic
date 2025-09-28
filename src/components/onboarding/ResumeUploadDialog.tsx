import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  normalizeResumeFile,
  buildResumeStoragePath,
  saveResumeRecord,
  RESUME_BUCKET,
  isValidResumeFile,
} from "@/lib/resume-storage";

interface ResumeUploadDialogProps {
  open: boolean;
  onSuccess: () => void;
}

export const ResumeUploadDialog = ({ open, onSuccess }: ResumeUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (isValidResumeFile(selectedFile)) {
        setFile(selectedFile);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, or DOCX file.",
          variant: "destructive",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !user) {
      console.error("Upload failed: Missing file or user", { file: !!file, user: !!user });
      return;
    }

    setUploading(true);
    try {
      console.log("Starting upload process...", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        userId: user.id,
        userEmail: user.email,
        session: !!supabase.auth.getSession(),
      });

      // Check current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log("Current session:", { sessionData, sessionError });

      if (!sessionData.session) {
        throw new Error("No active session found");
      }

      const normalizedFile = normalizeResumeFile(file);
      const fileName = buildResumeStoragePath(user.id, normalizedFile);

      console.log("Normalized file details:", {
        originalType: file.type,
        normalizedType: normalizedFile.type,
        fileName: fileName,
        bucketName: RESUME_BUCKET,
      });

      // Test bucket access first
      const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
      console.log("Available buckets:", buckets, "Error:", bucketListError);

      // Check if user can access the bucket
      const { data: bucketFiles, error: bucketAccessError } = await supabase.storage.from(RESUME_BUCKET).list();
      console.log("Bucket access test:", { bucketFiles, bucketAccessError });

      // Attempt upload with mobile-friendly retry logic
      console.log("Attempting file upload...");
      const { uploadFileWithRetry } = await import('@/utils/uploadUtils');
      const uploadResult = await uploadFileWithRetry(normalizedFile, fileName, RESUME_BUCKET);

      console.log("Upload result:", uploadResult);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Save record to database with graceful fallback for legacy schemas
      const { data: recordData, error: dbError, ignoredError, fallbackApplied } = await saveResumeRecord({
        userId: user.id,
        filePath: uploadResult.data!.path,
        originalFileName: file.name,
        fileSize: file.size,
        mimeType: normalizedFile.type || file.type || "application/octet-stream",
      });

      console.log("Database insert result:", { recordData, dbError, ignoredError, fallbackApplied });

      if (dbError) throw dbError;

      if (ignoredError) {
        console.warn(
          "Database metadata was ignored due to missing columns:",
          ignoredError,
          "fallback applied:",
          fallbackApplied,
        );
      }

      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been uploaded and is ready to use.",
      });

      onSuccess();
    } catch (error) {
      console.error("Error uploading resume:", error);
      const errorMessage = error instanceof Error ? error.message : "There was an error uploading your resume. Please try again.";
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Your Resume</DialogTitle>
          <DialogDescription>
            Upload a PDF, DOC, or DOCX file to get started with your personalized job search.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
              id="resume-upload"
              disabled={uploading}
            />
            <label
              htmlFor="resume-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to select your resume
              </span>
            </label>
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload Resume"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};