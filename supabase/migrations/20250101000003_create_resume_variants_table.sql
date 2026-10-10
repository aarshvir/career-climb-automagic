-- Create resume_variants table for multiple resume variants
-- This table allows users to have multiple resume versions

CREATE TABLE IF NOT EXISTS public.resume_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.resume_variants IS 'Multiple resume variants for users';
COMMENT ON COLUMN public.resume_variants.name IS 'User-defined name for the resume variant';
COMMENT ON COLUMN public.resume_variants.file_name IS 'Original filename';
COMMENT ON COLUMN public.resume_variants.file_path IS 'Path to file in Supabase Storage';
COMMENT ON COLUMN public.resume_variants.file_size IS 'File size in bytes';
COMMENT ON COLUMN public.resume_variants.mime_type IS 'File MIME type';
COMMENT ON COLUMN public.resume_variants.is_primary IS 'Whether this is the primary resume';

-- Enable row level security
ALTER TABLE public.resume_variants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own resume variants
CREATE POLICY "Users can read own resume variants"
  ON public.resume_variants
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own resume variants
CREATE POLICY "Users can insert own resume variants"
  ON public.resume_variants
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own resume variants
CREATE POLICY "Users can update own resume variants"
  ON public.resume_variants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own resume variants
CREATE POLICY "Users can delete own resume variants"
  ON public.resume_variants
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_resume_variants_updated_at
  BEFORE UPDATE ON public.resume_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
