// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const request = "00000000-0000-4000-8000-000000000010";

async function asUser(id: string) {
  await db.exec("RESET ROLE; SET ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function insert(userId = owner, requestId = request) {
  return db.query("INSERT INTO public.cv_checks(user_id,request_id,job_title,company,job_description,original_text,reviewed_text,method_version,status) VALUES($1,$2,'Strategy Manager','Example Group',$3,$3,$3,'evidence-v1','approved') RETURNING id", [userId, requestId, "A".repeat(100)]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [owner, other]);
  await db.exec(await readFile("supabase/migrations/20261011000000_free_cv_checks.sql", "utf8"));
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("RESET ROLE; TRUNCATE public.cv_checks;");
  await db.query("INSERT INTO auth.users(id) VALUES($1),($2) ON CONFLICT DO NOTHING", [owner, other]);
  await asUser(owner);
  await insert();
});

describe("free-check immutable owner-private Postgres boundary", () => {
  it("allows own snapshot creation and rejects cross-account inserts and reads", async () => {
    await asUser(owner);
    await insert(owner, "00000000-0000-4000-8000-000000000020");
    await expect(insert(other, "00000000-0000-4000-8000-000000000011")).rejects.toThrow(/row-level security/);
    await asUser(other);
    expect((await db.query("SELECT * FROM public.cv_checks")).rows).toHaveLength(0);
    expect((await db.query("DELETE FROM public.cv_checks WHERE user_id = $1 RETURNING id", [owner])).rows).toHaveLength(0);
  });
  it("makes approval/text/ownership immutable and prevents client timestamp overrides", async () => {
    await asUser(owner);
    await expect(db.query("UPDATE public.cv_checks SET reviewed_text=$1 WHERE user_id=$2", ["B".repeat(100), owner])).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE public.cv_checks SET user_id=$1", [other])).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE public.cv_checks SET status='draft'")).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO public.cv_checks(user_id,request_id,job_title,job_description,original_text,reviewed_text,method_version,created_at) VALUES($1,$2,'Manager',$3,$3,$3,'v1',now())", [owner, "00000000-0000-4000-8000-000000000012", "A".repeat(100)])).rejects.toThrow(/permission denied/);
  });
  it("enforces request uniqueness and server field limits", async () => {
    await asUser(owner);
    await expect(insert()).rejects.toThrow(/unique constraint/);
    await expect(db.query("INSERT INTO public.cv_checks(user_id,request_id,job_title,job_description,original_text,reviewed_text,method_version) VALUES($1,$2,'M',$3,$3,$3,'v1')", [owner, "00000000-0000-4000-8000-000000000013", "A".repeat(100)])).rejects.toThrow(/check constraint/);
    await expect(db.query("INSERT INTO public.cv_checks(user_id,request_id,job_title,job_description,original_text,reviewed_text,method_version) VALUES($1,$2,'Manager',$3,$4,$4,'v1')", [owner, "00000000-0000-4000-8000-000000000014", "A".repeat(100), "B".repeat(60001)])).rejects.toThrow(/check constraint/);
    await expect(db.query("INSERT INTO public.cv_checks(user_id,request_id,job_title,job_description,original_text,reviewed_text,method_version) VALUES($1,$2,'Manager',$3,$4,$4,'v1')", [owner, "00000000-0000-4000-8000-000000000015", "A".repeat(100), "B".repeat(80) + " ".repeat(60000)])).rejects.toThrow(/check constraint/);
  });
  it("revokes anonymous access and cascades account deletion", async () => {
    await db.exec("RESET ROLE; SET ROLE anon;");
    await expect(db.query("SELECT * FROM public.cv_checks")).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE;");
    await db.query("DELETE FROM auth.users WHERE id=$1", [owner]);
    expect((await db.query("SELECT * FROM public.cv_checks")).rows).toHaveLength(0);
  });
});
