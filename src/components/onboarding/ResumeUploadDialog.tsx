import { useState } from "react";
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
  const { user } = useAuth();
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
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
      console.error('Upload failed: Missing file or user', { file: !!file, user: !!user });
      return;
    }

    setUploading(true);
    try {
      console.log('Starting upload process...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        userId: user.id
      });

      const normalizedFile = normalizeResumeFile(file);
      const fileName = buildResumeStoragePath(user.id, normalizedFile);
      
      console.log('Normalized file details:', {
        originalType: file.type,
        normalizedType: normalizedFile.type,
        fileName: fileName,
        bucketName: RESUME_BUCKET
      });

      // Test bucket access first
      const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
      console.log('Available buckets:', buckets, 'Error:', bucketListError);

      // Check if user can access the bucket
      const { data: bucketFiles, error: bucketAccessError } = await supabase.storage
        .from(RESUME_BUCKET)
        .list();
      console.log('Bucket access test:', { bucketFiles, bucketAccessError });

      // Attempt upload
      console.log('Attempting file upload...');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(RESUME_BUCKET)
        .upload(fileName, normalizedFile, {
          cacheControl: '3600',
          upsert: true
        });

      console.log('Upload result:', { uploadData, uploadError });

      if (uploadError) {
        console.error('Upload error details:', {
          message: uploadError.message,
          error: uploadError
        });
        throw uploadError;
      }

      console.log('File uploaded successfully, saving to database...');

      // Save to database
      const { data: dbData, error: dbError } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          file_path: fileName,
        })
        .select();

      console.log('Database insert result:', { dbData, dbError });

      if (dbError) {
        console.error('Database error details:', dbError);
        throw dbError;
      }

      console.log('Resume upload completed successfully');
      
      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been uploaded and saved.",
      });

      onSuccess();
    } catch (error: any) {
      console.error('Upload failed with error:', {
        error,
        message: error?.message,
        statusCode: error?.statusCode,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      
      let errorMessage = "There was an error uploading your resume. Please try again.";
      
      if (error?.message?.includes('new row violates row-level security policy')) {
        errorMessage = "Permission denied. Please ensure you're logged in and try again.";
      } else if (error?.message?.includes('bucket')) {
        errorMessage = "Storage configuration error. Please contact support.";
      } else if (error?.statusCode === 413) {
        errorMessage = "File too large. Please upload a smaller file.";
      }
      
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