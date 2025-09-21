-- Add missing DELETE policy for plan_selections table
CREATE POLICY "Users can delete their own plan selections" 
ON public.plan_selections 
FOR DELETE 
USING (auth.uid() = user_id);