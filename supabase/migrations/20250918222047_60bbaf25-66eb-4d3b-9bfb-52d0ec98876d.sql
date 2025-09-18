-- Clean up duplicate entries more aggressively
-- Keep only the most recent non-abandonment entry per user

-- First, create a temporary table to identify which records to keep
CREATE TEMP TABLE records_to_keep AS
SELECT DISTINCT ON (user_id) id
FROM interest_forms
WHERE name NOT IN ('user dropped from dialog', 'Form abandoned', 'Form not completed')
ORDER BY user_id, created_at DESC;

-- If a user has no real entries, keep their latest abandonment entry
INSERT INTO records_to_keep
SELECT DISTINCT ON (user_id) id
FROM interest_forms f1
WHERE user_id NOT IN (SELECT user_id FROM records_to_keep WHERE user_id IS NOT NULL)
ORDER BY user_id, created_at DESC;

-- Delete all records except those we want to keep
DELETE FROM interest_forms 
WHERE id NOT IN (SELECT id FROM records_to_keep);

-- Now add the unique constraint
ALTER TABLE interest_forms ADD CONSTRAINT interest_forms_user_id_unique UNIQUE (user_id);