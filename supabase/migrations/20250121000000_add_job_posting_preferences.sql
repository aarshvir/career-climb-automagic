-- Add new job posting preferences to support LinkedIn-style filtering
ALTER TABLE public.preferences 
ADD COLUMN IF NOT EXISTS job_posting_type TEXT DEFAULT 'All jobs',
ADD COLUMN IF NOT EXISTS job_posting_date TEXT DEFAULT 'Last week';

-- Add check constraints for valid values
ALTER TABLE public.preferences 
ADD CONSTRAINT check_job_posting_type 
CHECK (job_posting_type IN ('Easy apply', 'All jobs'));

ALTER TABLE public.preferences 
ADD CONSTRAINT check_job_posting_date 
CHECK (job_posting_date IN ('Last 24 hours', 'Last 3 days', 'Last week', 'Last month', 'Any time'));

-- Update existing records with default values
UPDATE public.preferences 
SET 
  job_posting_type = 'All jobs',
  job_posting_date = 'Last week'
WHERE job_posting_type IS NULL OR job_posting_date IS NULL;
