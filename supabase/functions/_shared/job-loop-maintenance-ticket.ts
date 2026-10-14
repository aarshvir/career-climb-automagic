type Environment = (name: string) => string | undefined;
const ticketPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only the dedicated, single-use maintenance purpose is accepted. Candidate
 * JWTs, preparation tickets and worker secrets do not authorize collection. */
export async function consumeMaintenanceTicket(request: Request, env: Environment, fetcher: typeof fetch = fetch): Promise<boolean> {
  const ticket = request.headers.get('x-job-loop-maintenance-ticket') ?? '';
  if (!ticketPattern.test(ticket)) return false;
  const origin = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!origin || !serviceKey) return false;
  try {
    const endpoint = new URL('/rest/v1/rpc/job_loop_gc_consume_ticket', origin);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return false;
    const response = await fetcher(endpoint.href, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ p_ticket: ticket }),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.length <= 20 && JSON.parse(body) === true;
  } catch { return false; }
}
