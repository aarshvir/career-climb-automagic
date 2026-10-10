-- Create plan_selections table for tracking plan selection during onboarding
-- This table is referenced by the PlanSelection page

CREATE TABLE IF NOT EXISTS public.plan_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

COMMENT ON TABLE public.plan_selections IS 'Tracks user plan selections during onboarding';
COMMENT ON COLUMN public.plan_selections.selected_plan IS 'Selected plan: free, pro, or elite';
COMMENT ON COLUMN public.plan_selections.status IS 'Selection status: pending, completed, etc.';

-- Enable row level security
ALTER TABLE public.plan_selections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own plan selections
CREATE POLICY "Users can read own plan selections"
  ON public.plan_selections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own plan selections
CREATE POLICY "Users can insert own plan selections"
  ON public.plan_selections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own plan selections
CREATE POLICY "Users can update own plan selections"
  ON public.plan_selections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_plan_selections_updated_at
  BEFORE UPDATE ON public.plan_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
