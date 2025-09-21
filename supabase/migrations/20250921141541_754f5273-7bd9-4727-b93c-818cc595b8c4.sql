-- Create resume variants table
CREATE TABLE public.resume_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resume_variants ENABLE ROW LEVEL SECURITY;

-- Create policies for resume variants
CREATE POLICY "Users can view their own resume variants" 
ON public.resume_variants 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own resume variants" 
ON public.resume_variants 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resume variants" 
ON public.resume_variants 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resume variants" 
ON public.resume_variants 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create daily job batches table
CREATE TABLE public.daily_job_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_jobs_scraped INTEGER DEFAULT 0,
  make_com_webhook_url TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, batch_date)
);

-- Enable RLS
ALTER TABLE public.daily_job_batches ENABLE ROW LEVEL SECURITY;

-- Create policies for daily job batches
CREATE POLICY "Users can view their own job batches" 
ON public.daily_job_batches 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own job batches" 
ON public.daily_job_batches 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job batches" 
ON public.daily_job_batches 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create job applications table
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  batch_id UUID REFERENCES public.daily_job_batches(id) ON DELETE CASCADE,
  
  -- Basic job info
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_description TEXT,
  salary_range TEXT,
  location TEXT,
  job_url TEXT,
  application_deadline DATE,
  
  -- AI-enhanced scores
  resume_match_score INTEGER DEFAULT 0, -- 0-100
  ats_score INTEGER DEFAULT 0, -- 0-100
  compatibility_score INTEGER DEFAULT 0, -- 0-100
  
  -- Generated document URLs
  optimized_resume_url TEXT,
  cover_letter_url TEXT,
  email_draft_url TEXT,
  
  -- Status tracking
  application_status TEXT DEFAULT 'not_applied', -- not_applied, applied, interview, rejected, offer
  scraped_date DATE NOT NULL DEFAULT CURRENT_DATE,
  make_com_processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Create policies for job applications
CREATE POLICY "Users can view their own job applications" 
ON public.job_applications 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own job applications" 
ON public.job_applications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job applications" 
ON public.job_applications 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own job applications" 
ON public.job_applications 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create generated documents table
CREATE TABLE public.generated_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- optimized_resume, cover_letter, email_draft
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generation_status TEXT DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for generated documents
CREATE POLICY "Users can view their own generated documents" 
ON public.generated_documents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own generated documents" 
ON public.generated_documents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own generated documents" 
ON public.generated_documents 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create triggers for updated_at columns
CREATE TRIGGER update_resume_variants_updated_at
BEFORE UPDATE ON public.resume_variants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_job_batches_updated_at
BEFORE UPDATE ON public.daily_job_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_generated_documents_updated_at
BEFORE UPDATE ON public.generated_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_resume_variants_user_id ON public.resume_variants(user_id);
CREATE INDEX idx_daily_job_batches_user_date ON public.daily_job_batches(user_id, batch_date);
CREATE INDEX idx_job_applications_user_score ON public.job_applications(user_id, resume_match_score DESC);
CREATE INDEX idx_job_applications_batch ON public.job_applications(batch_id);
CREATE INDEX idx_generated_documents_job_app ON public.generated_documents(job_application_id);