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

    const { runId, jobPreferences, cvUrl } = await req.json();
    if (!runId || !jobPreferences || !cvUrl) {
      return new Response(JSON.stringify({ error: "runId, jobPreferences, and cvUrl are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
    if (!makeWebhookUrl) {
        console.error("MAKE_WEBHOOK_URL is not set in environment variables.");
        await supabase
          .from('job_runs')
          .update({ run_status: 'failed', error_message: 'Webhook URL not configured' })
          .eq('id', runId);
        return new Response(JSON.stringify({ error: "Webhook URL not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      runId: runId,
      jobPreferences,
      cvUrl,
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

    await supabase
        .from('job_runs')
        .update({ run_status: 'processing' })
        .eq('id', runId);

    return new Response(JSON.stringify({ success: true, message: "Webhook triggered successfully." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});