import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // This client uses the user's login token to securely access the database.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("User not found. Please log in.");

    // 1. Get user's profile and preferences
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('subscription_plan')
      .eq('id', user.id)
      .single();

    const { data: preferences, error: prefError } = await supabaseClient
      .from('job_preferences')
      .select('job_title_keywords, location, experience_levels, job_types')
      .eq('user_id', user.id)
      .single();

    if (profileError || prefError) throw new Error("Could not find user profile or preferences.");

    // 2. Fetch the Geo ID from our new 'locations' table
    const cleanedLocation = preferences.location.trim().toLowerCase();
    const { data: locationData, error: locationError } = await supabaseClient
        .from('locations')
        .select('geo_id')
        .ilike('name', cleanedLocation) // Case-insensitive search
        .single();
    
    if (locationError || !locationData) {
        throw new Error(`Location "${preferences.location}" is not supported yet.`);
    }
    const geoId = locationData.geo_id;

    // 3. Build the LinkedIn URL automatically
    const keywords = encodeURIComponent(preferences.job_title_keywords.join(' '));
    const linkedInUrl = `https://www.linkedin.com/jobs/search/?keywords=${keywords}&geoId=${geoId}&f_TPR=r86400&sortBy=R`;

    // 4. Determine job count based on plan
    const jobCount = profile.subscription_plan === 'premium' ? 100 : 50;
      
    // 5. Get user's resumes
    const { data: resumes, error: resumeError } = await supabaseClient
      .from('resumes')
      .select('storage_path')
      .eq('user_id', user.id);

    if (resumeError || !resumes || resumes.length === 0) throw new Error("No resumes found.");

    const resumeLinks = resumes.map(r => {
        const { data } = supabaseClient.storage.from('resumes').getPublicUrl(r.storage_path);
        return data.publicUrl;
    });

    // 6. Create the job run
    const { data: jobRun, error: runError } = await supabaseClient
      .from('job_runs')
      .insert({
        user_id: user.id,
        apify_search_url: linkedInUrl,
        resume_links: resumeLinks,
        run_status: 'running'
      })
      .select('id')
      .single();

    if (runError) throw new Error("Could not start a new job run.");
    
    // 7. Trigger Make.com with all the dynamic user data
    const makeWebhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')!;
    await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: jobRun.id,
        userId: user.id,
        apifyUrl: linkedInUrl,
        jobCount: jobCount,
        resumes: resumeLinks
      })
    });

    return new Response(JSON.stringify({ message: "Automation started!", runId: jobRun.id }), {
        headers: { "Content-Type": "application/json" }, status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" }, status: 500
    });
  }
});