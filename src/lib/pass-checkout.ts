import { supabase } from '@/integrations/supabase/client';
import { checkoutSchema } from '@/lib/workspace-api';
import type { PassPlanKey } from '@/lib/pass-plans';
import type { z } from 'zod';

export type PassCheckout = { status: 'ready'; checkout: z.infer<typeof checkoutSchema> } | { status: 'unavailable' };

/**
 * Asks the authenticated backend for a hosted checkout for one pass. The browser sends only the plan
 * key; the product and price are fixed on the server. Payments that are switched off are reported as
 * unavailable rather than as an error.
 */
export async function startPassCheckout(plan: PassPlanKey): Promise<PassCheckout> {
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { requestId: crypto.randomUUID(), plan } });
  if (error) {
    const context = (error as { context?: unknown }).context;
    let code = '', message = '';
    if (context instanceof Response) {
      const payload: unknown = await context.clone().json().catch(() => null);
      if (payload && typeof payload === 'object') {
        const fields = payload as Record<string, unknown>;
        code = typeof fields.code === 'string' ? fields.code : '';
        message = typeof fields.error === 'string' ? fields.error.slice(0, 400) : '';
      }
      if (context.status === 503 && code === 'BILLING_UNAVAILABLE') return { status: 'unavailable' };
      if (context.status >= 500) message = '';
    }
    throw new Error(message || 'Checkout could not be opened right now. Nothing was charged. Please try again later.');
  }
  const parsed = checkoutSchema.safeParse(data);
  if (!parsed.success) throw new Error('Checkout could not be opened right now. Nothing was charged. Please try again later.');
  return { status: 'ready', checkout: parsed.data };
}
