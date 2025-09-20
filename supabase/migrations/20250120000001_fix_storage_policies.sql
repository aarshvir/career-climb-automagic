-- Drop existing storage policies for jobassist bucket to avoid conflicts
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own resumes" ON storage.objects;

-- Create new storage policies for the jobassist bucket
-- Users can upload their own resumes
CREATE POLICY "Users can upload their own resumes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = split_part(name, '/', 1)
);

-- Users can view their own resumes
CREATE POLICY "Users can view their own resumes" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = split_part(name, '/', 1)
);

-- Users can update their own resumes
CREATE POLICY "Users can update their own resumes" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = split_part(name, '/', 1)
);

-- Users can delete their own resumes
CREATE POLICY "Users can delete their own resumes" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'jobassist' 
  AND auth.uid()::text = split_part(name, '/', 1)
);
