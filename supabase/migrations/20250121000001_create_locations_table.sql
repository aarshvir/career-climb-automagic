-- Create locations table for dropdown selection
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  country TEXT,
  state_province TEXT,
  city TEXT,
  is_remote BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Create policies for locations (public read access)
CREATE POLICY "Locations are publicly readable" 
ON public.locations 
FOR SELECT 
USING (true);

-- Insert sample locations data
INSERT INTO public.locations (name, country, state_province, city, is_remote) VALUES
-- Remote options
('Remote', 'Global', 'Global', 'Remote', true),
('Work From Home', 'Global', 'Global', 'Remote', true),
('Hybrid', 'Global', 'Global', 'Hybrid', false),

-- Major US Cities
('New York, NY', 'United States', 'New York', 'New York', false),
('San Francisco, CA', 'United States', 'California', 'San Francisco', false),
('Los Angeles, CA', 'United States', 'California', 'Los Angeles', false),
('Seattle, WA', 'United States', 'Washington', 'Seattle', false),
('Austin, TX', 'United States', 'Texas', 'Austin', false),
('Boston, MA', 'United States', 'Massachusetts', 'Boston', false),
('Chicago, IL', 'United States', 'Illinois', 'Chicago', false),
('Denver, CO', 'United States', 'Colorado', 'Denver', false),
('Miami, FL', 'United States', 'Florida', 'Miami', false),
('Atlanta, GA', 'United States', 'Georgia', 'Atlanta', false),
('Dallas, TX', 'United States', 'Texas', 'Dallas', false),
('Phoenix, AZ', 'United States', 'Arizona', 'Phoenix', false),
('Philadelphia, PA', 'United States', 'Pennsylvania', 'Philadelphia', false),
('Houston, TX', 'United States', 'Texas', 'Houston', false),
('San Diego, CA', 'United States', 'California', 'San Diego', false),
('Portland, OR', 'United States', 'Oregon', 'Portland', false),
('Nashville, TN', 'United States', 'Tennessee', 'Nashville', false),
('Las Vegas, NV', 'United States', 'Nevada', 'Las Vegas', false),
('Orlando, FL', 'United States', 'Florida', 'Orlando', false),
('San Jose, CA', 'United States', 'California', 'San Jose', false),

-- Major International Cities
('London, UK', 'United Kingdom', 'England', 'London', false),
('Toronto, ON', 'Canada', 'Ontario', 'Toronto', false),
('Vancouver, BC', 'Canada', 'British Columbia', 'Vancouver', false),
('Berlin, Germany', 'Germany', 'Berlin', 'Berlin', false),
('Amsterdam, Netherlands', 'Netherlands', 'North Holland', 'Amsterdam', false),
('Paris, France', 'France', 'Île-de-France', 'Paris', false),
('Dublin, Ireland', 'Ireland', 'Leinster', 'Dublin', false),
('Zurich, Switzerland', 'Switzerland', 'Zurich', 'Zurich', false),
('Stockholm, Sweden', 'Sweden', 'Stockholm', 'Stockholm', false),
('Copenhagen, Denmark', 'Denmark', 'Capital Region', 'Copenhagen', false),
('Sydney, Australia', 'Australia', 'New South Wales', 'Sydney', false),
('Melbourne, Australia', 'Australia', 'Victoria', 'Melbourne', false),
('Singapore', 'Singapore', 'Singapore', 'Singapore', false),
('Tokyo, Japan', 'Japan', 'Tokyo', 'Tokyo', false),
('Hong Kong', 'Hong Kong', 'Hong Kong', 'Hong Kong', false),
('Mumbai, India', 'India', 'Maharashtra', 'Mumbai', false),
('Bangalore, India', 'India', 'Karnataka', 'Bangalore', false),
('Tel Aviv, Israel', 'Israel', 'Tel Aviv', 'Tel Aviv', false),

-- Major US States (for broader searches)
('California', 'United States', 'California', 'Statewide', false),
('Texas', 'United States', 'Texas', 'Statewide', false),
('Florida', 'United States', 'Florida', 'Statewide', false),
('New York', 'United States', 'New York', 'Statewide', false),
('Illinois', 'United States', 'Illinois', 'Statewide', false),
('Pennsylvania', 'United States', 'Pennsylvania', 'Statewide', false),
('Ohio', 'United States', 'Ohio', 'Statewide', false),
('Georgia', 'United States', 'Georgia', 'Statewide', false),
('North Carolina', 'United States', 'North Carolina', 'Statewide', false),
('Michigan', 'United States', 'Michigan', 'Statewide', false)
ON CONFLICT (name) DO NOTHING;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_locations_name ON public.locations(name);
CREATE INDEX IF NOT EXISTS idx_locations_country ON public.locations(country);
CREATE INDEX IF NOT EXISTS idx_locations_is_remote ON public.locations(is_remote);
