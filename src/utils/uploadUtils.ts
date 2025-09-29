import { supabase } from '@/integrations/supabase/client';
import { cloneFile, validateFileIntegrity, getMobileUploadTimeouts, isMobileDevice } from '@/utils/mobileUtils';
import { getErrorMessage, logError } from '@/lib/errorUtils';

export interface UploadResult {
  success: boolean;
  data?: { path: string };
  error?: string;
}

export const uploadFileWithRetry = async (
  file: File,
  bucketPath: string,
  bucket: string = 'jobassist'
): Promise<UploadResult> => {
  const { uploadTimeout, retryDelay, maxRetries } = getMobileUploadTimeouts();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Upload attempt ${attempt}/${maxRetries} for file: ${file.name}`);
      
      // Clone file for mobile devices to prevent "file changed" errors
      const fileToUpload = isMobileDevice() ? cloneFile(file) : file;
      
      // Validate file integrity on mobile devices
      if (isMobileDevice() && !validateFileIntegrity(file, fileToUpload)) {
        throw new Error('File integrity check failed. Please try uploading again.');
      }

      // Check session before upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Session expired. Please refresh the page and try again.');
      }

      // Create upload promise with timeout
      const uploadPromise = supabase.storage
        .from(bucket)
        .upload(bucketPath, fileToUpload, {
          cacheControl: '3600',
          upsert: true,
        });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout')), uploadTimeout)
      );

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      const { data, error } = result as { data: unknown; error: unknown };

      if (error) {
        throw error;
      }

      console.log(`Upload successful on attempt ${attempt}:`, data);
      return { success: true, data };

    } catch (error) {
      lastError = error;
      logError(`Upload attempt ${attempt}`, error);
      
      const errorMessage = getErrorMessage(error, 'Upload failed');
      
      // Don't retry for certain types of errors
      if (
        errorMessage.includes('Session expired') ||
        errorMessage.includes('Permission denied') ||
        errorMessage.includes('File too large')
      ) {
        return { success: false, error: errorMessage };
      }

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  const errorMessage = getErrorMessage(lastError, 'Upload failed after multiple attempts. Please try again.');
  return { success: false, error: errorMessage };
};