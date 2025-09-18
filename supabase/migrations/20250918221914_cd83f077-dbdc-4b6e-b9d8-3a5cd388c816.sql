-- First, let's clean up any duplicate entries and add a unique constraint on user_id
-- This will prevent multiple entries per user and fix the upsert operation

-- Remove duplicate entries, keeping only the latest one per user
-- (excluding abandonment entries with placeholder data)
DELETE FROM interest_forms a USING interest_forms b 
WHERE a.user_id = b.user_id 
  AND a.created_at < b.created_at
  AND NOT (a.name = 'user dropped from dialog' OR a.name = 'Form abandoned');

-- Also remove any abandonment entries if the user has a real entry
DELETE FROM interest_forms 
WHERE name IN ('user dropped from dialog', 'Form abandoned')
  AND user_id IN (
    SELECT user_id 
    FROM interest_forms 
    WHERE name NOT IN ('user dropped from dialog', 'Form abandoned')
  );

-- Add unique constraint on user_id to prevent duplicates
ALTER TABLE interest_forms ADD CONSTRAINT interest_forms_user_id_unique UNIQUE (user_id);