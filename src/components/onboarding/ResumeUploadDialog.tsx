import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  RESUME_BUCKET,
  buildResumeStoragePath,
  isValidResumeFile,
  normalizeResumeFile,
} from "@/lib/resume-storage";

interface ResumeUploadDialogProps {
  open: boolean;
  onSuccess: () => void;
}

export const ResumeUploadDialog = ({ open, onSuccess }: ResumeUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (isValidResumeFile(selectedFile)) {
        setFile(normalizeResumeFile(selectedFile));
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
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileName = buildResumeStoragePath(user.id, file);

      const { error: uploadError } = await supabase.storage
        .from(RESUME_BUCKET)
        .upload(fileName, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          file_path: fileName,
        });

      if (dbError) throw dbError;

      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been uploaded and saved.",
      });

      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onSuccess();
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading your resume. Please try again.",
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
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Your Resume
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Please upload your resume to continue. We'll use this to help match you with relevant job opportunities.
          </p>

          <div className="space-y-2">
            <Label htmlFor="resume-upload">Choose File</Label>
            <Input
              id="resume-upload"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              disabled={uploading}
              ref={inputRef}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name}
              </p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Resume"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
