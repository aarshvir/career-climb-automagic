-- Add email field to interest_forms table
ALTER TABLE public.interest_forms 
ADD COLUMN email text NOT NULL DEFAULT '';