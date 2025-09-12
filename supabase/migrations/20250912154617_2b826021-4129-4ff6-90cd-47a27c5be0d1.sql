-- Create interest_forms table to store user inquiries
CREATE TABLE public.interest_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  career_objective TEXT NOT NULL,
  max_monthly_price INTEGER NOT NULL,
  app_expectations TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.interest_forms ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own interest forms" 
ON public.interest_forms 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own interest forms" 
ON public.interest_forms 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interest forms" 
ON public.interest_forms 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_interest_forms_updated_at
BEFORE UPDATE ON public.interest_forms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();