-- Fix missing profile for existing user with completed plan selection
INSERT INTO profiles (id, email, plan) 
SELECT 
  ps.user_id, 
  COALESCE(
    (SELECT email FROM auth.users WHERE id = ps.user_id),
    'aarshvir@gmail.com'
  ), 
  ps.selected_plan
FROM plan_selections ps
WHERE ps.status = 'completed' 
  AND ps.user_id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO UPDATE SET
  plan = EXCLUDED.plan,
  email = EXCLUDED.email;