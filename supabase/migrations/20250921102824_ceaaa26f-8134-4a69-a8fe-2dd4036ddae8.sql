-- Add missing columns to resumes table
ALTER TABLE public.resumes 
ADD COLUMN file_name TEXT,
ADD COLUMN file_size INTEGER,
ADD COLUMN mime_type TEXT;

-- Update the updated_at trigger for resumes table
CREATE TRIGGER update_resumes_updated_at
BEFORE UPDATE ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();