/** Retired endpoints never scrape, expose account providers, or report simulated work. */
export const retiredResponse = () => new Response(JSON.stringify({ error: 'This endpoint has been retired. Use the current application-preparation workspace.' }), {
  status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
});
