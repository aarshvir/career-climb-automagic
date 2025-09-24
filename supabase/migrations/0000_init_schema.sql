-- This script sets up your entire database. It is safe to run multiple times.

-- Drop old tables if they exist to start fresh.
DROP TABLE IF EXISTS public.jobs;
DROP TABLE IF EXISTS public.job_runs;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.preferences;
DROP TABLE IF EXISTS public.daily_job_batches;

-- Create a table to store the locations for the dropdown menu.
CREATE TABLE public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    geo_id TEXT NOT NULL,
    country TEXT
);
COMMENT ON TABLE public.locations IS 'Stores all supported locations for the user dropdown.';

-- Create the table to store user preferences
CREATE TABLE public.preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location TEXT,
  job_title TEXT,
  seniority_level TEXT,
  job_type TEXT,
  job_posting_type TEXT DEFAULT 'All jobs',
  job_posting_date TEXT DEFAULT 'Last week',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
COMMENT ON TABLE public.preferences IS 'Stores user job search preferences.';

-- Create the table to track each automation run for each user.
CREATE TABLE public.job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    apify_search_url TEXT,
    resume_links JSONB,
    run_status TEXT DEFAULT 'pending' NOT NULL
);
COMMENT ON TABLE public.job_runs IS 'Tracks the status of each high-level automation run.';

-- Create the table to store every individual job scraped for a user.
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_run_id UUID REFERENCES public.job_runs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    title TEXT,
    company_name TEXT,
    location TEXT,
    description TEXT,
    linkedin_url TEXT UNIQUE,
    posted_at_text TEXT,
    match_score INT,
    recommended_resume_url TEXT,
    generated_resume_json JSONB,
    status TEXT DEFAULT 'pending' NOT NULL
);
COMMENT ON TABLE public.jobs IS 'Stores individual jobs scraped and processed for a user.';

-- Insert all the location data into the 'locations' table.
INSERT INTO public.locations (name, geo_id, country) VALUES
-- India
('India', '102713980', 'India'),
('Mumbai', '105200339', 'India'), ('Delhi', '102933703', 'India'), ('Bangalore', '105365738', 'India'), ('Hyderabad', '105551221', 'India'), ('Chennai', '104464673', 'India'),
('Pune', '104396023', 'India'), ('Kolkata', '102022442', 'India'), ('Ahmedabad', '103593019', 'India'), ('Jaipur', '103986389', 'India'), ('Lucknow', '102123797', 'India'),
('Kanpur', '103043818', 'India'), ('Nagpur', '100984594', 'India'), ('Indore', '106288328', 'India'), ('Thane', '104489373', 'India'), ('Bhopal', '103828328', 'India'),
('Visakhapatnam', '102923984', 'India'), ('Pimpri-Chinchwad', '103991280', 'India'), ('Patna', '103561350', 'India'), ('Vadodara', '109095133', 'India'), ('Ghaziabad', '102934442', 'India'),
('Ludhiana', '106951239', 'India'), ('Agra', '100872242', 'India'), ('Nashik', '100412036', 'India'), ('Faridabad', '105860364', 'India'), ('Meerut', '106934526', 'India'),
('Rajkot', '102434250', 'India'), ('Kalyan-Dombivali', '104618037', 'India'), ('Vasai-Virar', '114333552', 'India'), ('Varanasi', '105373336', 'India'), ('Srinagar', '101634502', 'India'),
('Aurangabad', '102946231', 'India'), ('Dhanbad', '103821733', 'India'), ('Amritsar', '103753767', 'India'), ('Navi Mumbai', '102374092', 'India'), ('Allahabad', '100588383', 'India'),
('Ranchi', '103290435', 'India'), ('Howrah', '104204550', 'India'), ('Coimbatore', '103071373', 'India'), ('Jabalpur', '104325721', 'India'), ('Gwalior', '103901967', 'India'),
('Vijayawada', '100287381', 'India'), ('Jodhpur', '105973711', 'India'), ('Madurai', '101344211', 'India'), ('Raipur', '102830825', 'India'), ('Kota', '103522295', 'India'),
('Guwahati', '104252636', 'India'), ('Chandigarh', '102938061', 'India'), ('Solapur', '101918731', 'India'),
-- USA
('United States', '103644278', 'USA'), ('New York', '103644278', 'USA'), ('Los Angeles', '102442162', 'USA'), ('Chicago', '100424174', 'USA'), ('Houston', '103721039', 'USA'), ('Phoenix', '100342343', 'USA'),
-- China
('China', '102890883', 'China'), ('Shanghai', '104868212', 'China'), ('Beijing', '105953018', 'China'), ('Shenzhen', '101149652', 'China'), ('Guangzhou', '104445351', 'China'), ('Chengdu', '105752331', 'China'),
-- Japan
('Japan', '101355214', 'Japan'), ('Tokyo', '105072130', 'Japan'), ('Yokohama', '104845112', 'Japan'), ('Osaka', '106193238', 'Japan'), ('Nagoya', '100890226', 'Japan'), ('Sapporo', '106403046', 'Japan'),
-- Germany
('Germany', '101282230', 'Germany'), ('Berlin', '106943384', 'Germany'), ('Hamburg', '105828383', 'Germany'), ('Munich', '100494424', 'Germany'), ('Cologne', '102374461', 'Germany'), ('Frankfurt', '106230919', 'Germany'),
-- UK
('United Kingdom', '102257491', 'UK'), ('London', '102257491', 'UK'), ('Birmingham', '107246921', 'UK'), ('Manchester', '102824317', 'UK'), ('Glasgow', '104990343', 'UK'), ('Liverpool', '102015383', 'UK'),
-- France
('France', '105015875', 'France'), ('Paris', '105072431', 'France'), ('Marseille', '105183864', 'France'), ('Lyon', '103348149', 'France'), ('Toulouse', '104327424', 'France'), ('Nice', '106178082', 'France'),
-- Canada
('Canada', '101174742', 'Canada'), ('Toronto', '106227261', 'Canada'), ('Montreal', '105156411', 'Canada'), ('Vancouver', '103323039', 'Canada'), ('Calgary', '103632341', 'Canada'), ('Edmonton', '102377013', 'Canada'),
-- Australia
('Australia', '101452733', 'Australia'), ('Sydney', '103027961', 'Australia'), ('Melbourne', '103362143', 'Australia'), ('Brisbane', '106037042', 'Australia'), ('Perth', '102874073', 'Australia'), ('Adelaide', '106369151', 'Australia'),
-- Brazil
('Brazil', '106057191', 'Brazil'), ('São Paulo', '102821427', 'Brazil'), ('Rio de Janeiro', '102595085', 'Brazil'), ('Brasília', '103913346', 'Brazil'), ('Salvador', '105101034', 'Brazil'), ('Fortaleza', '100277717', 'Brazil'),
-- Russia
('Russia', '101728296', 'Russia'), ('Moscow', '101165590', 'Russia'), ('Saint Petersburg', '103598776', 'Russia'), ('Novosibirsk', '104330159', 'Russia'), ('Yekaterinburg', '103953535', 'Russia'),
-- Indonesia
('Indonesia', '102277331', 'Indonesia'), ('Jakarta', '102183818', 'Indonesia'), ('Surabaya', '101166690', 'Indonesia'), ('Bandung', '104235889', 'Indonesia'),
-- Pakistan
('Pakistan', '101382498', 'Pakistan'), ('Karachi', '105068812', 'Pakistan'), ('Lahore', '106024220', 'Pakistan'), ('Faisalabad', '103756810', 'Pakistan'),
-- Nigeria
('Nigeria', '105221518', 'Nigeria'), ('Lagos', '102435422', 'Nigeria'), ('Kano', '101430030', 'Nigeria'), ('Ibadan', '105953332', 'Nigeria'),
-- Bangladesh
('Bangladesh', '106692257', 'Bangladesh'), ('Dhaka', '102172730', 'Bangladesh'), ('Chittagong', '102273611', 'Bangladesh'),
-- Mexico
('Mexico', '102148103', 'Mexico'), ('Mexico City', '103643759', 'Mexico'), ('Guadalajara', '103417056', 'Mexico'), ('Monterrey', '102237889', 'Mexico'),
-- Philippines
('Philippines', '103121230', 'Philippines'), ('Manila', '105118552', 'Philippines'), ('Quezon City', '101569324', 'Philippines'),
-- Egypt
('Egypt', '105174837', 'Egypt'), ('Cairo', '105949168', 'Egypt'), ('Alexandria', '106520330', 'Egypt'),
-- Vietnam
('Vietnam', '100656012', 'Vietnam'), ('Ho Chi Minh City', '104192237', 'Vietnam'), ('Hanoi', '101213233', 'Vietnam'),
-- Turkey
('Turkey', '102196716', 'Turkey'), ('Istanbul', '106093843', 'Turkey'), ('Ankara', '105001393', 'Turkey'),
-- Iran
('Iran', '105741364', 'Iran'), ('Tehran', '103856913', 'Iran'),
-- Thailand
('Thailand', '100083329', 'Thailand'), ('Bangkok', '103982365', 'Thailand'),
-- South Africa
('South Africa', '104035038', 'South Africa'), ('Johannesburg', '105072049', 'South Africa'), ('Cape Town', '101901416', 'South Africa'), ('Durban', '103328221', 'South Africa'),
-- South Korea
('South Korea', '105134114', 'South Korea'), ('Seoul', '105120330', 'South Korea'),
-- Colombia
('Colombia', '102874073', 'Colombia'), ('Bogotá', '102874073', 'Colombia'),
-- Spain
('Spain', '105663829', 'Spain'), ('Madrid', '105248098', 'Spain'), ('Barcelona', '105932034', 'Spain'),
-- Argentina
('Argentina', '100165415', 'Argentina'), ('Buenos Aires', '106054432', 'Argentina'),
-- Saudi Arabia
('Saudi Arabia', '100459312', 'Saudi Arabia'), ('Riyadh', '105493075', 'Saudi Arabia'), ('Jeddah', '103342371', 'Saudi Arabia'),
-- Poland
('Poland', '105667694', 'Poland'), ('Warsaw', '105202581', 'Poland'),
-- Netherlands
('Netherlands', '102890710', 'Netherlands'), ('Amsterdam', '106973686', 'Netherlands')
ON CONFLICT (name) DO NOTHING;

-- Set up security rules for all tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Locations are publicly viewable" ON public.locations FOR SELECT USING (true);

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own preferences" ON public.preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own job runs" ON public.job_runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own jobs" ON public.jobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
