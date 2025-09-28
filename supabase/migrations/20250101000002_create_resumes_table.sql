-- Create resumes table for user CV/resume storage
-- This table stores references to uploaded resume files

CREATE TABLE IF NOT EXISTS public.resumes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.resumes IS 'User uploaded resumes and CVs';
COMMENT ON COLUMN public.resumes.file_path IS 'Path to file in Supabase Storage';
COMMENT ON COLUMN public.resumes.file_name IS 'Original filename';
COMMENT ON COLUMN public.resumes.file_size IS 'File size in bytes';
COMMENT ON COLUMN public.resumes.mime_type IS 'File MIME type';

-- Enable row level security
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own resumes
CREATE POLICY "Users can read own resumes"
  ON public.resumes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own resumes
CREATE POLICY "Users can insert own resumes"
  ON public.resumes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own resumes
CREATE POLICY "Users can update own resumes"
  ON public.resumes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own resumes
CREATE POLICY "Users can delete own resumes"
  ON public.resumes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
