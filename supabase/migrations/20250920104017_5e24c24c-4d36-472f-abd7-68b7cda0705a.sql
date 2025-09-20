-- Create storage policies for the jobassist bucket
-- Users can upload their own resumes
CREATE POLICY "Users can upload their own resumes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own resumes
CREATE POLICY "Users can view their own resumes" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own resumes
CREATE POLICY "Users can update their own resumes" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own resumes
CREATE POLICY "Users can delete their own resumes" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);