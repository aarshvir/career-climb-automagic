import type { adminClient } from './runtime.ts';
import type { LoopEnv } from './job-loop-providers.ts';

/** Private owner settings are resolved server-side; no secret enters this row. */
export async function configuredLoopEnv(admin: ReturnType<typeof adminClient>, env: LoopEnv): Promise<LoopEnv> {
  let data:Record<string,unknown>|null=null;
  try { const result=await admin.from('jobvance_admin_config').select('monthly_cap_micros,router_enabled,default_model').eq('singleton',true).maybeSingle();if(!result.error&&result.data)data=result.data as Record<string,unknown>; } catch { /* Paid routing fails closed; rules preparation remains available. */ }
  const valid = !!data && Number.isSafeInteger(Number(data.monthly_cap_micros)) && Number(data.monthly_cap_micros)>0 && Number(data.monthly_cap_micros)<=50000000;
  return name => {
    if (name === 'JOB_LOOP_OPENROUTER_ENABLED') return valid && data?.router_enabled === true ? 'true' : 'false';
    if (name === 'JOB_LOOP_DEFAULT_ROUTER_MODEL') return valid ? String(data?.default_model) : undefined;
    if (name === 'JOB_LOOP_MONTHLY_CAP_USD') return valid ? String(Number(data?.monthly_cap_micros)/1000000) : env(name);
    if (!valid && name === 'JOB_LOOP_PAID_APIS_ENABLED') return 'false';
    return env(name);
  };
}
