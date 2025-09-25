-- Create daily_usage table to track daily fetch limits by plan
CREATE TABLE daily_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to ensure one row per user per date
  UNIQUE(user_id, fetch_date)
);

-- Create index for fast lookups
CREATE INDEX idx_daily_usage_user_date ON daily_usage(user_id, fetch_date);

-- Enable RLS
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own daily usage" ON daily_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily usage" ON daily_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily usage" ON daily_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_daily_usage_updated_at 
  BEFORE UPDATE ON daily_usage 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
