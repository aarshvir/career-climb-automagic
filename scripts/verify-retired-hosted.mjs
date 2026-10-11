// Known first-party deprecated routes only; public anon configuration, no user session.
const project = 'gvftdfriujrkpptdueyb';
const response = await fetch('https://raw.githubusercontent.com/aarshvir/career-climb-automagic/main/.env.production', { redirect: 'error' });
if (!response.ok) throw new Error('Published configuration unavailable.');
const config = await response.text();
const key = /^VITE_SUPABASE_PUBLISHABLE_KEY=["']?([^"'\r\n]+)["']?$/m.exec(config)?.[1]?.trim();
const claims = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url').toString());
if (claims.role !== 'anon' || claims.ref !== project) throw new Error('Public key scope rejected.');
const results = [];
for (const name of ['trigger-make-run', 'check-email-provider', 'lemon-squeezy-webhook']) {
  const retired = await fetch(`https://${project}.supabase.co/functions/v1/${name}`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (retired.status !== 410) throw new Error(`Retirement not confirmed: ${name} (${retired.status}).`);
  results.push({ name, status: retired.status });
}
console.log(JSON.stringify({ status: 'passed', retired: results }, null, 2));
