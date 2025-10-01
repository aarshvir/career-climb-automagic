-- Drop existing policies on interest_forms table
DROP POLICY IF EXISTS "Users can create their own interest forms" ON public.interest_forms;
DROP POLICY IF EXISTS "Users can update their own interest forms" ON public.interest_forms;
DROP POLICY IF EXISTS "Users can view their own interest forms" ON public.interest_forms;

-- Create new policies with explicit authentication checks
-- These policies explicitly require authentication and ensure users can only access their own data

CREATE POLICY "Authenticated users can create their own interest forms"
ON public.interest_forms
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view their own interest forms"
ON public.interest_forms
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update their own interest forms"
ON public.interest_forms
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Explicitly deny all access to anonymous users
CREATE POLICY "Deny anonymous access to interest forms"
ON public.interest_forms
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);