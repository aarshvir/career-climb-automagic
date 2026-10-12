import { describe, expect, it } from 'vitest';
import { consumeScheduledTicket } from '../functions/_shared/job-loop-scheduler-ticket';

const ticket = '9cf02d44-f7e0-4242-b7e3-4bd9754f8d6a';
const environment = (name: string) => ({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key' }[name]);
const request = (value?: string) => new Request('https://fixture.supabase.co/functions/v1/job-loop-worker', { method: 'POST', headers: value ? { 'x-job-loop-schedule-ticket': value } : {} });

describe('database-issued unattended dispatch credentials', () => {
  it('rejects absent or malformed credentials without contacting a service', async () => {
    const blocked = (() => { throw new Error('unexpected request'); }) as typeof fetch;
    expect(await consumeScheduledTicket(request(), environment, blocked)).toBe(false);
    expect(await consumeScheduledTicket(request('caller-controlled'), environment, blocked)).toBe(false);
  });
  it('checks the fixed first-party RPC with server authorization and fails closed on replay', async () => {
    let calls = 0;
    const database = (async (url, init) => {
      expect(String(url)).toBe('https://fixture.supabase.co/rest/v1/rpc/job_loop_consume_dispatch_ticket');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-service-key');
      expect(JSON.parse(String(init?.body))).toEqual({ p_ticket: ticket });
      expect(init?.redirect).toBe('error');
      return Response.json(calls++ === 0);
    }) as typeof fetch;
    expect(await consumeScheduledTicket(request(ticket), environment, database)).toBe(true);
    expect(await consumeScheduledTicket(request(ticket), environment, database)).toBe(false);
  });
  it('rejects missing configuration, database errors and non-boolean responses', async () => {
    expect(await consumeScheduledTicket(request(ticket), () => undefined)).toBe(false);
    for (const response of [new Response('unavailable', { status: 503 }), Response.json({ valid: true }), new Response('invalid json')]) {
      expect(await consumeScheduledTicket(request(ticket), environment, (async () => response) as typeof fetch)).toBe(false);
    }
    expect(await consumeScheduledTicket(request(ticket), environment, (async () => { throw new Error('timeout'); }) as typeof fetch)).toBe(false);
  });
});
