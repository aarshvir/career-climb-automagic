import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This is the main function that runs when your website calls it.
serve(async (req) => {
  try {
    // Create a client to interact with your Supabase database.
    // It automatically uses the user's login information from the request.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get the currently logged-in user's details.
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("User not found. Please log in.");

    // Fetch the user's saved job preferences from the 'job_preferences' table.
    const { data: preferences, error: prefError } = await supabaseClient
      .from('job_preferences')
      .select('linkedin_job_search_url')
      .eq('user_id', user.id)
      .single();

    // Fetch all of the user's resumes from the 'resumes' table.
    const { data: resumes, error: resumeError } = await supabaseClient
      .from('resumes')
      .select('storage_path')
      .eq('user_id', user.id);

    if (prefError || resumeError) {
      console.error('DB Error:', prefError || resumeError);
      throw new Error("Could not get your saved job preferences or resumes.");
    }
    if (!resumes || resumes.length === 0) {
        throw new Error("No resumes found. Please upload at least one resume.");
    }

    // Get just the URLs from the resume data.
    const resumeLinks = resumes.map(r => r.storage_path);

    // Create a new entry in the 'job_runs' table to track this automation.
    const { data: jobRun, error: runError } = await supabaseClient
      .from('job_runs')
      .insert({
        user_id: user.id,
        apify_search_url: preferences.linkedin_job_search_url,
        resume_links: resumeLinks,
        run_status: 'running' // Set status to 'running' immediately
      })
      .select('id')
      .single();

    if (runError) {
        console.error('Insert Error:', runError);
        throw new Error("Could not start a new job run.");
    }
    
    // Securely call your Make.com webhook with all the necessary data.
    const makeWebhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')!;
    await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: jobRun.id, // The ID of the new row we just created
        userId: user.id, // The ID of the user
        apifyUrl: preferences.linkedin_job_search_url,
        resumes: resumeLinks
      })
    });

    // Send a success message back to your website.
    return new Response(JSON.stringify({ message: "Automation started!", runId: jobRun.id }), {
        headers: { "Content-Type": "application/json" },
        status: 200
    });

  } catch (error) {
    // If anything goes wrong, send back a clear error message.
    return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500
    });
  }
});