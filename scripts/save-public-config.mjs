// Only public frontend configuration is allowed in the portable host build.
import { loadEnv } from 'vite';
import { writeFile } from 'node:fs/promises';
const env = loadEnv('production', process.cwd(), 'VITE_');
const endpoint = 'https://gvftdfriujrkpptdueyb.supabase.co';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== endpoint || !key) throw new Error('Expected Jobvance public project settings.');
if (key.startsWith('sb_publishable_')) {
  // Publishable keys are explicitly intended for browser use.
} else {
  const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
  if (claims.role !== 'anon' || claims.ref !== 'gvftdfriujrkpptdueyb') throw new Error('Refusing to save a privileged or unrelated key.');
}
await writeFile('.env.production', '# Public browser configuration. Never add server credentials here.\nVITE_SUPABASE_URL='+endpoint+'\nVITE_SUPABASE_PUBLISHABLE_KEY='+key+'\n');
console.log('Saved verified public-only production configuration.');
