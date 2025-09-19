-- Add new job preference fields to support LinkedIn-style preferences
ALTER TABLE public.preferences 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS seniority_level TEXT,
ADD COLUMN IF NOT EXISTS job_type TEXT;