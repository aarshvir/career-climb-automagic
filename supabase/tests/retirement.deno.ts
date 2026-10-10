// This checks retirement source/bundles locally. It invokes no deployed endpoint.
const handlers: ((request: Request) => Response)[] = [];
const originalServe = Deno.serve;
Deno.serve = ((handler: (request: Request) => Response) => { handlers.push(handler); return undefined; }) as unknown as typeof Deno.serve;
if (Deno.env.get('JOBVANCE_TEST_UI_BUNDLES') === 'true') {
  await import('../../docs/supabase-ui/trigger-make-run.js');
  await import('../../docs/supabase-ui/check-email-provider.js');
  await import('../../docs/supabase-ui/lemon-squeezy-webhook.js');
} else {
  await import('../functions/trigger-make-run/index.ts');
  await import('../functions/check-email-provider/index.ts');
  await import('../functions/lemon-squeezy-webhook/index.ts');
}
Deno.serve = originalServe;
for (const [index, name] of ['trigger-make-run','check-email-provider','lemon-squeezy-webhook'].entries()) {
  Deno.test(`${name} returns 410 and performs no account, payment or automation work`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('A retired endpoint must never make network requests.'); };
    try {
      const response = handlers[index](new Request('https://fixture.invalid', { method: 'POST', body: '{}' }));
      if (response.status !== 410) throw new Error('Expected retirement status.');
      const body = await response.json();
      if (typeof body.error !== 'string' || !body.error.includes('retired')) throw new Error('Expected an honest retirement response.');
    } finally { globalThis.fetch = originalFetch; }
  });
}
