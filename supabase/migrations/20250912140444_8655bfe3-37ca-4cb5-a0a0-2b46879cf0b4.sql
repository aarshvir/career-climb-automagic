-- Add explicit security policies for subscriptions table
-- Currently only SELECT is allowed, but we need explicit policies for INSERT, UPDATE, DELETE
-- to follow security best practices and principle of least privilege

-- Policy to explicitly deny INSERT operations for authenticated users
-- Only webhooks (using service role) should be able to insert subscription records
CREATE POLICY "Deny user subscription inserts" 
ON public.subscriptions 
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- Policy to explicitly deny UPDATE operations for authenticated users  
-- Only webhooks (using service role) should be able to update subscription records
CREATE POLICY "Deny user subscription updates" 
ON public.subscriptions 
FOR UPDATE 
TO authenticated
USING (false);

-- Policy to explicitly deny DELETE operations for authenticated users
-- Only webhooks (using service role) should be able to delete subscription records  
CREATE POLICY "Deny user subscription deletes" 
ON public.subscriptions 
FOR DELETE 
TO authenticated
USING (false);