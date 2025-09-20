-- Create resumes table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.resumes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

-- Create policies for resumes (if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'Users can view their own resumes') THEN
    CREATE POLICY "Users can view their own resumes" 
    ON public.resumes 
    FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'Users can create their own resumes') THEN
    CREATE POLICY "Users can create their own resumes" 
    ON public.resumes 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'Users can update their own resumes') THEN
    CREATE POLICY "Users can update their own resumes" 
    ON public.resumes 
    FOR UPDATE 
    USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'Users can delete their own resumes') THEN
    CREATE POLICY "Users can delete their own resumes" 
    ON public.resumes 
    FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create trigger for automatic timestamp updates (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_resumes_updated_at') THEN
    CREATE TRIGGER update_resumes_updated_at
    BEFORE UPDATE ON public.resumes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Create index for better performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);

-- Create preferences table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location TEXT,
  job_title TEXT,
  seniority_level TEXT,
  job_type TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  remote_preference TEXT,
  company_size TEXT,
  industry TEXT,
  skills TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id) -- Each user can only have one preferences record
);

-- Enable Row Level Security
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for preferences (if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preferences' AND policyname = 'Users can view their own preferences') THEN
    CREATE POLICY "Users can view their own preferences" 
    ON public.preferences 
    FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preferences' AND policyname = 'Users can create their own preferences') THEN
    CREATE POLICY "Users can create their own preferences" 
    ON public.preferences 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preferences' AND policyname = 'Users can update their own preferences') THEN
    CREATE POLICY "Users can update their own preferences" 
    ON public.preferences 
    FOR UPDATE 
    USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preferences' AND policyname = 'Users can delete their own preferences') THEN
    CREATE POLICY "Users can delete their own preferences" 
    ON public.preferences 
    FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create trigger for automatic timestamp updates (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_preferences_updated_at') THEN
    CREATE TRIGGER update_preferences_updated_at
    BEFORE UPDATE ON public.preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Create index for better performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON public.preferences(user_id);
