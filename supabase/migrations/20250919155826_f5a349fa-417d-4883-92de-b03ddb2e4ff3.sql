-- Create plan_selections table to track user plan choices
CREATE TABLE public.plan_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_plan TEXT NOT NULL CHECK (selected_plan IN ('free', 'pro', 'elite')),
  selection_completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id) -- Each user can only have one plan selection record
);

-- Enable Row Level Security
ALTER TABLE public.plan_selections ENABLE ROW LEVEL SECURITY;

-- Create policies for plan_selections
CREATE POLICY "Users can view their own plan selections" 
ON public.plan_selections 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own plan selection" 
ON public.plan_selections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan selection" 
ON public.plan_selections 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_plan_selections_updated_at
BEFORE UPDATE ON public.plan_selections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_plan_selections_user_id ON public.plan_selections(user_id);
CREATE INDEX idx_plan_selections_status ON public.plan_selections(status);