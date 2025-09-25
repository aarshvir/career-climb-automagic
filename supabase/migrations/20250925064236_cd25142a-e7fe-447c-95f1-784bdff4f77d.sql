-- Add missing columns to preferences table
ALTER TABLE preferences 
ADD COLUMN IF NOT EXISTS job_posting_type TEXT,
ADD COLUMN IF NOT EXISTS job_posting_date TEXT;