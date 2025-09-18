-- Clean up duplicate entries more carefully
-- Step 1: Create a temporary table with the best entry per user
CREATE TEMP TABLE best_entries AS
SELECT DISTINCT ON (user_id) 
  id, user_id, email, name, phone, career_objective, max_monthly_price, app_expectations, created_at, updated_at
FROM interest_forms 
WHERE name NOT IN ('Form abandoned', 'user dropped from dialog')
ORDER BY user_id, created_at DESC;

-- Step 2: If no real entry exists for a user, keep the latest abandonment entry
INSERT INTO best_entries
SELECT DISTINCT ON (user_id)
  id, user_id, email, name, phone, career_objective, max_monthly_price, app_expectations, created_at, updated_at
FROM interest_forms 
WHERE user_id NOT IN (SELECT user_id FROM best_entries)
  AND name IN ('Form abandoned', 'user dropped from dialog')
ORDER BY user_id, created_at DESC;

-- Step 3: Delete all current entries
DELETE FROM interest_forms;

-- Step 4: Insert back only the best entries
INSERT INTO interest_forms (id, user_id, email, name, phone, career_objective, max_monthly_price, app_expectations, created_at, updated_at)
SELECT id, user_id, email, name, phone, career_objective, max_monthly_price, app_expectations, created_at, updated_at
FROM best_entries;

-- Step 5: Add the unique constraint
ALTER TABLE interest_forms ADD CONSTRAINT interest_forms_user_id_unique UNIQUE (user_id);