import { readFile } from 'node:fs/promises';
import { checkTrackingSchema } from './check-tracking-schema.mjs';

export const checkLoopMigration = '20261015101948_job_loop_saved_check_link.sql';
export const checkLoopDependencies = [
  '20261011010000_job_loop_cloud.sql', '20261011020000_job_loop_revoke_all.sql',
  '20261011030000_job_loop_recurring.sql', '20261013190000_job_loop_provider_lease.sql',
  '20261014101107_job_loop_durable_erasure.sql', '20261014131351_job_loop_request_generation.sql',
  '20261014161126_job_loop_terminal_artifact_gc.sql',
];
// Actual check/tracker/Loop/lifecycle/GC SQL. Storage tables and auth identity
// are local substitutes, not hosted Storage or authentication acceptance.
export async function checkLoopSchema() {
  let sql = await checkTrackingSchema();
  sql += `
    CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON storage.objects TO anon,authenticated;
  `;
  for (const file of [...checkLoopDependencies, checkLoopMigration]) {
    sql += '\n' + await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8');
  }
  return sql;
}
