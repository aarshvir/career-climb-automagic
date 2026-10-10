// supabase/functions/retired-response.ts
var retiredResponse = () => new Response(JSON.stringify({
  error: "This endpoint has been retired. Use the current application-preparation workspace."
}), {
  status: 410,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
  }
});

// supabase/functions/check-email-provider/index.ts
Deno.serve(retiredResponse);
