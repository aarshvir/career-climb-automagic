// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { checkTrackingSchema } from './fixtures/check-tracking-schema.mjs';

let db: PGlite;
let owner: string;
let other: string;
let check: string;
const query = (sql: string, values: unknown[] = []) => db.query<Record<string, unknown>>(sql, values);
async function identity(user: string | null, role = 'authenticated') {
  await db.exec('RESET ROLE');
  await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`SET ROLE ${role}`);
}
async function newCheck(user = owner) {
  await db.exec('RESET ROLE');
  const id = randomUUID();
  await query(`INSERT INTO cv_checks(id,user_id,request_id,job_title,company,job_description,original_text,reviewed_text,method_version,status)
    VALUES($1,$2,$3,'Same role','Same company',repeat('x',80),repeat('y',80),repeat('z',80),'test','approved')`, [id, user, randomUUID()]);
  await identity(owner);
  return id;
}
async function track(id = check) { return (await query('SELECT * FROM track_cv_check($1)', [id])).rows[0]; }
beforeAll(async () => { db = new PGlite(); await db.exec(await checkTrackingSchema()); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE');
  owner = randomUUID(); other = randomUUID();
  await query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other]);
  check = await newCheck();
});

describe('owner-bound check tracking SQL', () => {
  it('creates an exact relationship and returns it unchanged on repeated requests', async () => {
    const first = await track(); const second = await track();
    expect(second).toEqual(first);
    expect(first).toMatchObject({ user_id: owner, cv_check_id: check, pack_id: null, job_title: 'Same role', status: 'saved', notes: '' });
  });
  it('retains notes, dates, title edits, status and updated_at on retry', async () => {
    const first = await track();
    await query("UPDATE tracked_applications SET status='applied',notes='Keep this',applied_at='2026-10-12',follow_up_at='2026-10-20',job_title='Edited role' WHERE id=$1", [first.id]);
    const saved = (await query('SELECT * FROM tracked_applications WHERE id=$1', [first.id])).rows[0];
    expect(await track()).toEqual(saved);
  });
  it('never merges different checks with identical roles or existing manual tracking', async () => {
    await query("INSERT INTO tracked_applications(user_id,job_title,company) VALUES($1,'Same role','Same company')", [owner]);
    const second = await newCheck();
    expect((await track()).id).not.toBe((await track(second)).id);
    expect((await query('SELECT * FROM tracked_applications')).rows).toHaveLength(3);
  });
  it('rejects another owner and unknown checks without revealing private contents', async () => {
    const foreign = await newCheck(other);
    await expect(track(foreign)).rejects.toThrow('unavailable');
    await expect(track(randomUUID())).rejects.toThrow('unavailable');
    expect((await query('SELECT * FROM tracked_applications')).rows).toHaveLength(0);
  });
  it('denies anonymous callers and missing JWT identity even on the private function', async () => {
    await identity(null);
    await expect(track()).rejects.toThrow('Sign in');
    await expect(query('SELECT * FROM jobvance_private.track_cv_check($1)', [check])).rejects.toThrow('Sign in');
    await identity(null, 'anon');
    await expect(track()).rejects.toThrow('permission denied');
  });
  it('denies direct check-link insert, assignment, reassignment and detachment', async () => {
    await expect(query("INSERT INTO tracked_applications(user_id,cv_check_id,job_title,company) VALUES($1,$2,'Role','Co')", [owner, check])).rejects.toThrow('permission denied');
    const first = await track();
    for (const id of [null, randomUUID(), check]) {
      await expect(query('UPDATE tracked_applications SET cv_check_id=$1 WHERE id=$2', [id, first.id])).rejects.toThrow('permission denied');
    }
  });
  it('prevents transfer of owned tracking to another account and hides foreign rows', async () => {
    const first = await track();
    await expect(query('UPDATE tracked_applications SET user_id=$1 WHERE id=$2', [other, first.id])).rejects.toThrow();
    await identity(other);
    expect((await query('SELECT * FROM tracked_applications WHERE id=$1', [first.id])).rows).toHaveLength(0);
    expect((await query("UPDATE tracked_applications SET notes='attack' WHERE id=$1 RETURNING id", [first.id])).rows).toHaveLength(0);
  });
  it('enforces owner FK even for server writes and excludes ambiguous double sources', async () => {
    const foreign = await newCheck(other); const first = await track();
    await db.exec('RESET ROLE');
    await expect(query('UPDATE tracked_applications SET cv_check_id=$1 WHERE id=$2', [foreign, first.id])).rejects.toThrow('foreign key');
    const pack = randomUUID(); await query('INSERT INTO application_packs(id,user_id) VALUES($1,$2)', [pack, owner]);
    await identity(owner);
    await expect(query('UPDATE tracked_applications SET pack_id=$1 WHERE id=$2', [pack, first.id])).rejects.toThrow('check constraint');
  });
  it('deleting a source check preserves independent tracking progress and clears only its link', async () => {
    const first = await track();
    await query("UPDATE tracked_applications SET notes='Keep progress',status='interview' WHERE id=$1", [first.id]);
    await query('DELETE FROM cv_checks WHERE id=$1', [check]);
    const saved = (await query('SELECT * FROM tracked_applications WHERE id=$1', [first.id])).rows[0];
    expect(saved).toMatchObject({ id: first.id, user_id: owner, cv_check_id: null, status: 'interview', notes: 'Keep progress' });
    await expect(track()).rejects.toThrow('unavailable');
  });
  it('explicit tracker deletion permits a fresh saved tracker without reviving deleted notes', async () => {
    const first = await track();
    await query('DELETE FROM tracked_applications WHERE id=$1', [first.id]);
    const next = await track(); expect(next.id).not.toBe(first.id);
    expect(next).toMatchObject({ notes: '', status: 'saved', cv_check_id: check });
  });
  it('preserves ordinary manual and owned pack tracking operations', async () => {
    const pack = randomUUID(); await db.exec('RESET ROLE');
    await query('INSERT INTO application_packs(id,user_id) VALUES($1,$2)', [pack, owner]);
    await identity(owner);
    const entry = (await query("INSERT INTO tracked_applications(user_id,pack_id,job_title,company) VALUES($1,$2,'Role','Company') RETURNING *", [owner, pack])).rows[0];
    expect(entry.cv_check_id).toBeNull();
    await query("UPDATE tracked_applications SET notes='Progress',status='offer' WHERE id=$1", [entry.id]);
    await query('DELETE FROM tracked_applications WHERE id=$1', [entry.id]);
    expect((await query('SELECT * FROM tracked_applications')).rows).toHaveLength(0);
  });
  it('account deletion retains no orphan tracker or check', async () => {
    await track(); await db.exec('RESET ROLE');
    await query('DELETE FROM auth.users WHERE id=$1', [owner]);
    expect((await query('SELECT * FROM tracked_applications WHERE user_id=$1', [owner])).rows).toHaveLength(0);
    expect((await query('SELECT * FROM cv_checks WHERE user_id=$1', [owner])).rows).toHaveLength(0);
  });
});
