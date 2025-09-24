import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { batchId } = await req.json();
    if (!batchId) {
      return new Response(JSON.stringify({ error: "batchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: preferences, error: preferencesError } = await supabase
      .from("preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (preferencesError || !preferences) {
      console.error("Error fetching preferences:", preferencesError);
      return new Response(JSON.stringify({ error: "Failed to fetch user preferences" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
    if (!makeWebhookUrl) {
        console.error("MAKE_WEBHOOK_URL is not set in environment variables.");
        // Update batch status to 'failed'
        await supabase
          .from('daily_job_batches')
          .update({ status: 'failed', error_message: 'Webhook URL not configured' })
          .eq('id', batchId);
        return new Response(JSON.stringify({ error: "Webhook URL not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      batchId: batchId,
      preferences: {
        location: preferences.location,
        job_title: preferences.job_title,
        seniority_level: preferences.seniority_level,
        job_type: preferences.job_type,
        job_posting_type: preferences.job_posting_type,
        job_posting_date: preferences.job_posting_date,
        cities: preferences.cities ? preferences.cities.split(',').map(s => s.trim()) : [],
        titles: preferences.titles ? preferences.titles.split(',').map(s => s.trim()) : [],
      },
    };

    const webhookResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const errorBody = await webhookResponse.text();
      throw new Error(`Webhook failed with status ${webhookResponse.status}: ${errorBody}`);
    }

    // Optionally, update the batch status to 'processing'
    await supabase
        .from('daily_job_batches')
        .update({ status: 'processing' })
        .eq('id', batchId);

    return new Response(JSON.stringify({ success: true, message: "Webhook triggered successfully." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});