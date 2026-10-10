-- Create interest_forms table for user interest/onboarding data
-- This table stores user interest form submissions

CREATE TABLE IF NOT EXISTS public.interest_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  career_objective TEXT,
  max_monthly_price INTEGER,
  app_expectations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

COMMENT ON TABLE public.interest_forms IS 'User interest forms and onboarding data';
COMMENT ON COLUMN public.interest_forms.name IS 'User full name';
COMMENT ON COLUMN public.interest_forms.phone IS 'User phone number';
COMMENT ON COLUMN public.interest_forms.career_objective IS 'User career objective';
COMMENT ON COLUMN public.interest_forms.max_monthly_price IS 'Maximum monthly price user is willing to pay';
COMMENT ON COLUMN public.interest_forms.app_expectations IS 'User expectations from the app';

-- Enable row level security
ALTER TABLE public.interest_forms ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own interest forms
CREATE POLICY "Users can read own interest forms"
  ON public.interest_forms
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own interest forms
CREATE POLICY "Users can insert own interest forms"
  ON public.interest_forms
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own interest forms
CREATE POLICY "Users can update own interest forms"
  ON public.interest_forms
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_interest_forms_updated_at
  BEFORE UPDATE ON public.interest_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
