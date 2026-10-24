import { readFile } from 'node:fs/promises';
import { checkLoopSchema } from './check-loop-schema.mjs';

export const paidCapacityMigration = '20261024113134_job_loop_paid_capacity_100.sql';
export async function paidCapacitySchema() {
  let sql = await checkLoopSchema();
  sql += '\nCREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz);';
  for (const name of [
    '20261015223000_job_loop_selected_preparation.sql', '20261017013000_job_loop_cv_variants.sql',
    '20261017080000_job_loop_cv_variant_facts.sql', '20261017122000_job_loop_dodo_entitlements.sql',
    '20261017130000_job_loop_variant_execution.sql', '20261017131000_job_loop_recurring_product.sql',
    '20261018073501_job_loop_subscription_lifecycle.sql', '20261018091955_job_loop_refund_renewal_safety.sql',
    '20261018095409_job_loop_localized_price_quotes.sql', '20261018101948_job_loop_provider_accounting.sql',
    '20261018105918_job_loop_whole_currency_prices.sql', '20261018111136_job_loop_versioned_price_products.sql',
    paidCapacityMigration,
  ]) sql += '\n' + await readFile(new URL('../../migrations/' + name, import.meta.url), 'utf8');
  return sql;
}
