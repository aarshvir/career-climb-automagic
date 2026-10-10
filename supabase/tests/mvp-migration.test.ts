// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
let migration: string;
const text = 'A truthful CV with Python SQL analytics delivery, documented projects and existing qualifications. '.repeat(3);
const description = 'A role requiring Python SQL analytics delivery and documented projects. Please review the candidate experience.';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
    CREATE POLICY old_overbroad_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),email text,plan text DEFAULT 'free',subscription_status text,stripe_customer_id text);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY old_profile_own ON public.profiles FOR ALL TO authenticated USING(auth.uid() = id) WITH CHECK(auth.uid() = id);
    GRANT ALL ON public.profiles TO authenticated;
    GRANT UPDATE(plan),INSERT(plan) ON public.profiles TO authenticated;
    CREATE FUNCTION public.test_signup_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles(id,email) VALUES(NEW.id,NEW.email); RETURN NEW; END $$;
    CREATE TRIGGER test_signup_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.test_signup_profile();`);
  migration = await readFile(new URL('../migrations/20261010000000_grounded_application_mvp.sql', import.meta.url), 'utf8');
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });

async function account() {
  const user = randomUUID(); const resume = randomUUID(); const path = `${user}/${resume}.txt`;
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user, 'fixture@example.invalid']);
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('cv-documents',$1)", [path]);
  await db.query('INSERT INTO cv_documents(id,user_id,storage_path,original_filename,mime_type,byte_size,text_content) VALUES($1,$2,$3,$4,$5,$6,$7)', [resume, user, path, 'cv.txt', 'text/plain', text.length, text]);
  return { user, resume, path };
}
async function asUser<T>(user: string, action: (transaction: { query: PGlite['query']; exec: PGlite['exec'] }) => Promise<T>) {
  return db.transaction(async transaction => {
    await transaction.exec('SET LOCAL ROLE authenticated');
    await transaction.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    return action(transaction);
  });
}
async function balance(user: string) {
  return (await db.query<{ value: { creditsRemaining: number; expiresAt: string | null } }>('SELECT jobvance_get_entitlement($1) AS value', [user])).rows[0].value;
}
async function pack(user: string, resume: string, request = randomUUID(), digest = 'a'.repeat(64), company = 'Example') {
  return (await db.query<{ value: { id: string } }>('SELECT jobvance_create_pack($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS value', [user, resume, request, digest, 'Data engineer', company, null, description, text, text, ['python'], ['rust']])).rows[0].value;
}
async function payment(user: string, request: string, intent: string, action = 'paid', event = `evt_${randomUUID().replaceAll('-', '')}`, created = Math.floor(Date.now() / 1000), refund = 2900) {
  return (await db.query<{ value: { duplicate: boolean } }>('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value', [event, action === 'paid' ? 'checkout.session.completed' : 'charge.refunded', created, action, user, request, intent, action === 'paid' ? `cs_test_${intent}` : null, action === 'paid' ? 0 : refund])).rows[0].value;
}

describe('isolated real Postgres migration and ownership', () => {
  it('creates a private size- and MIME-limited bucket', async () => {
    const bucket = (await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>("SELECT * FROM storage.buckets WHERE id='cv-documents'")).rows[0];
    expect(bucket.public).toBe(false); expect(Number(bucket.file_size_limit)).toBe(5242880); expect(bucket.allowed_mime_types).toContain('text/plain');
  });
  it('preserves signup profiles but blocks old browser-owned premium writes and RPCs', async () => {
    const owner = await account();
    expect((await asUser(owner.user, tx => tx.query('SELECT plan FROM profiles WHERE id=$1', [owner.user]))).rows[0]).toEqual({ plan: 'free' });
    await expect(asUser(owner.user, tx => tx.query("UPDATE profiles SET plan='elite' WHERE id=$1", [owner.user]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(owner.user, tx => tx.query("UPDATE profiles SET subscription_status='active' WHERE id=$1", [owner.user]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(owner.user, tx => tx.query('SELECT jobvance_get_entitlement($1)', [owner.user]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(owner.user, tx => tx.query('SELECT * FROM billing_credit_grants'))).rejects.toThrow(/permission denied/i);
    await asUser(owner.user, tx => tx.query('UPDATE profiles SET email=$1 WHERE id=$2', ['changed@example.invalid', owner.user]));
  });
  it('fences broad legacy storage policies and rejects cross-account document ownership', async () => {
    const owner = await account(); const stranger = await account();
    expect((await asUser(stranger.user, tx => tx.query('SELECT * FROM cv_documents WHERE id=$1', [owner.resume]))).rows).toHaveLength(0);
    expect((await asUser(stranger.user, tx => tx.query("SELECT * FROM storage.objects WHERE bucket_id='cv-documents' AND name=$1", [owner.path]))).rows).toHaveLength(0);
    await expect(asUser(stranger.user, tx => tx.query("INSERT INTO storage.objects(bucket_id,name) VALUES('cv-documents',$1)", [`${owner.user}/forged.txt`]))).rejects.toThrow(/row-level security/i);
    await expect(asUser(stranger.user, tx => tx.query('INSERT INTO cv_documents(user_id,storage_path,original_filename,mime_type,byte_size,text_content) VALUES($1,$2,$3,$4,$5,$6)', [stranger.user, owner.path, 'forged.txt', 'text/plain', text.length, text]))).rejects.toThrow();
    await expect(asUser(owner.user, tx => tx.query("UPDATE storage.objects SET name=$1 WHERE name=$2", [`${owner.user}/replace.txt`, owner.path]))).resolves.toMatchObject({ affectedRows: 0 });
    await expect(pack(stranger.user, owner.resume)).rejects.toThrow('CV_NOT_FOUND');
    expect((await balance(stranger.user)).creditsRemaining).toBe(1);
  });
  it('requires a stored object before accepting document metadata', async () => {
    const owner = await account();
    await expect(asUser(owner.user, tx => tx.query('INSERT INTO cv_documents(user_id,storage_path,original_filename,mime_type,byte_size,text_content) VALUES($1,$2,$3,$4,$5,$6)', [owner.user, `${owner.user}/not-uploaded.txt`, 'missing.txt', 'text/plain', text.length, text]))).rejects.toThrow(/row-level security/i);
  });
  it('allows the actual owner upload and reviewed-text persistence journey', async () => {
    const owner = await account(); const uploaded = `${owner.user}/${randomUUID()}.txt`;
    await asUser(owner.user, tx => tx.query("INSERT INTO storage.objects(bucket_id,name) VALUES('cv-documents',$1)", [uploaded]));
    const saved = await asUser(owner.user, tx => tx.query<{ id: string }>('INSERT INTO cv_documents(user_id,storage_path,original_filename,mime_type,byte_size,text_content) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [owner.user, uploaded, 'reviewed.txt', 'text/plain', text.length, text]));
    expect(saved.rows).toHaveLength(1);
    await asUser(owner.user, tx => tx.query('UPDATE cv_documents SET text_content=$1 WHERE id=$2', [text + ' Reviewed.', saved.rows[0].id]));
  });
  it('rejects anonymous CV access even when a legacy storage policy grants it', async () => {
    const owner = await account();
    const visible = await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE anon');
      return tx.query("SELECT * FROM storage.objects WHERE bucket_id='cv-documents' AND name=$1", [owner.path]);
    });
    expect(visible.rows).toHaveLength(0);
  });
  it('allows only text/status pack edits and owns referenced tracked packs', async () => {
    const owner = await account(); const stranger = await account(); const created = await pack(owner.user, owner.resume);
    await asUser(owner.user, tx => tx.query("UPDATE application_packs SET tailored_text=$1,status='approved' WHERE id=$2", [text, created.id]));
    await expect(asUser(owner.user, tx => tx.query('UPDATE application_packs SET request_id=$1 WHERE id=$2', [randomUUID(), created.id]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(stranger.user, tx => tx.query('INSERT INTO tracked_applications(user_id,pack_id,job_title,company) VALUES($1,$2,$3,$4)', [stranger.user, created.id, 'Engineer', 'Example']))).rejects.toThrow(/row-level security/i);
    await asUser(owner.user, tx => tx.query('INSERT INTO tracked_applications(user_id,pack_id,job_title,company) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,pack_id) DO UPDATE SET status=$5', [owner.user, created.id, 'Engineer', 'Example', 'saved']));
  });
  it('fails an accidental second apply transaction without dropping existing data', async () => {
    const before = (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM cv_documents')).rows[0].count;
    await expect(db.exec(migration)).rejects.toThrow(/already exists/i);
    await db.exec('ROLLBACK');
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM cv_documents')).rows[0].count).toBe(before);
  });
});

describe('atomic allowance and durable idempotency', () => {
  it('creates the free grant only once and returns the same pack for duplicate requests', async () => {
    const owner = await account(); const request = randomUUID();
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    const results = await Promise.all([pack(owner.user, owner.resume, request), pack(owner.user, owner.resume, request)]);
    expect(results[0].id).toBe(results[1].id); expect((await balance(owner.user)).creditsRemaining).toBe(0);
    await expect(pack(owner.user, owner.resume)).rejects.toThrow('NO_CREDITS');
    await expect(pack(owner.user, owner.resume, request, 'b'.repeat(64))).rejects.toThrow('REQUEST_CONFLICT');
  });
  it('does not overdraw when two different requests are queued for one remaining credit', async () => {
    const owner = await account();
    const results = await Promise.allSettled([pack(owner.user, owner.resume), pack(owner.user, owner.resume)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await balance(owner.user)).creditsRemaining).toBe(0);
  });
  it('rolls back consumed credit if pack persistence fails', async () => {
    const owner = await account();
    await expect(pack(owner.user, owner.resume, randomUUID(), 'a'.repeat(64), 'x'.repeat(201))).rejects.toThrow();
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
  });
  it('preserves a saved pack and idempotency after its original CV is deleted', async () => {
    const owner = await account(); const request = randomUUID(); const created = await pack(owner.user, owner.resume, request);
    await asUser(owner.user, tx => tx.query('DELETE FROM cv_documents WHERE id=$1', [owner.resume]));
    expect((await db.query<{ resume_id: string | null }>('SELECT resume_id FROM application_packs WHERE id=$1', [created.id])).rows[0].resume_id).toBeNull();
    expect((await pack(owner.user, owner.resume, request)).id).toBe(created.id);
    expect((await balance(owner.user)).creditsRemaining).toBe(0);
  });
  it('limits new checkout attempts while allowing the same request to retry', async () => {
    const owner = await account(); const first = randomUUID();
    await db.query('SELECT jobvance_begin_checkout($1,$2)', [owner.user, first]);
    for (let count = 0; count < 9; count++) await db.query('SELECT jobvance_begin_checkout($1,$2)', [owner.user, randomUUID()]);
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2)', [owner.user, randomUUID()])).rejects.toThrow('CHECKOUT_LIMIT');
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2)', [owner.user, first])).resolves.toMatchObject({ rows: expect.any(Array) });
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
  });
});

describe('payment grant ledger', () => {
  it('deduplicates both event IDs and separate completion events for the same intent', async () => {
    const owner = await account(); const request = randomUUID(); const intent = `pi_${randomUUID().replaceAll('-', '')}`;
    const event = `evt_${randomUUID().replaceAll('-', '')}`;
    expect((await payment(owner.user, request, intent, 'paid', event)).duplicate).toBe(false);
    expect((await payment(owner.user, request, intent, 'paid', event)).duplicate).toBe(true);
    await payment(owner.user, request, intent);
    expect((await balance(owner.user)).creditsRemaining).toBe(11);
  });
  it('refunds revoke only unused credits from the corresponding order', async () => {
    const owner = await account(); const first = randomUUID(); const second = randomUUID();
    const intent1 = `pi_${first.replaceAll('-', '')}`; const intent2 = `pi_${second.replaceAll('-', '')}`;
    await payment(owner.user, first, intent1, 'paid', undefined, Math.floor(Date.now() / 1000) - 120); await payment(owner.user, second, intent2);
    await pack(owner.user, owner.resume);
    await payment(owner.user, first, intent1, 'refund');
    expect((await balance(owner.user)).creditsRemaining).toBe(11);
    expect((await db.query<{ status: string }>('SELECT status FROM billing_orders WHERE payment_intent=$1', [intent2])).rows[0].status).toBe('paid');
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM application_packs WHERE user_id=$1', [owner.user])).rows[0].count).toBe(1);
  });
  it('a refund before completion creates a tombstone that delayed completion cannot undo', async () => {
    const owner = await account(); const request = randomUUID(); const intent = `pi_${request.replaceAll('-', '')}`;
    await payment(owner.user, request, intent, 'refund'); await payment(owner.user, request, intent, 'paid');
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    expect((await db.query<{ status: string }>('SELECT status FROM billing_orders WHERE payment_intent=$1', [intent])).rows[0].status).toBe('refunded');
  });
  it('partial refunds revoke unused capacity and expiry never extends on replay', async () => {
    const owner = await account(); const request = randomUUID(); const intent = `pi_${request.replaceAll('-', '')}`;
    const time = Math.floor(Date.now() / 1000) - 31 * 86400;
    await payment(owner.user, request, intent, 'paid', undefined, time);
    await payment(owner.user, request, intent);
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    await payment(owner.user, request, intent, 'refund', undefined, undefined, 500);
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
  });
  it('rejects reassigning a known payment to another account and rolls back the event', async () => {
    const owner = await account(); const stranger = await account(); const request = randomUUID(); const intent = `pi_${request.replaceAll('-', '')}`;
    await payment(owner.user, request, intent);
    const event = `evt_${randomUUID().replaceAll('-', '')}`;
    await expect(payment(stranger.user, randomUUID(), intent, 'paid', event)).rejects.toThrow('REQUEST_CONFLICT');
    expect((await balance(stranger.user)).creditsRemaining).toBe(1);
    expect((await db.query('SELECT * FROM billing_payment_events WHERE event_id=$1', [event])).rows).toHaveLength(0);
  });
});

describe('Paddle durable order binding and refund tombstones', () => {
  const newId = (prefix: string) => prefix + randomUUID().replaceAll('-', '').slice(0, 26);
  async function order(user: string, request: string, transaction: string, mode = 'test') {
    await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, request, 'paddle', mode]);
    await db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7)', [user, request, transaction, null, null, 'paddle', mode]);
  }
  async function event(user: string, request: string, transaction: string, action = 'paid', id = newId('paddle_evt_'), mode = 'test', amount = 500, adjustment = newId('paddle_adj_')) {
    return db.query<{ result: { duplicate: boolean } }>('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS result',
      [id, action === 'paid' ? 'transaction.completed' : 'adjustment.updated', Math.floor(Date.now() / 1000), action, user, request, `paddle_${transaction}`, action === 'paid' ? transaction : null, action === 'paid' ? 0 : amount, 'paddle', mode, action === 'refund' ? adjustment : null]);
  }
  it('durably claims transaction creation once and refuses provider or mode reassignment', async () => {
    const owner = await account(); const request = randomUUID();
    const first = (await db.query<{ result: { creationClaimAcquired: boolean } }>('SELECT jobvance_begin_checkout($1,$2,$3,$4) AS result', [owner.user, request, 'paddle', 'test'])).rows[0].result;
    const retry = (await db.query<{ result: { creationClaimAcquired: boolean } }>('SELECT jobvance_begin_checkout($1,$2,$3,$4) AS result', [owner.user, request, 'paddle', 'test'])).rows[0].result;
    expect(first.creationClaimAcquired).toBe(true); expect(retry.creationClaimAcquired).toBe(false);
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [owner.user, request, 'stripe', 'test'])).rejects.toThrow('REQUEST_CONFLICT');
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [owner.user, request, 'paddle', 'live'])).rejects.toThrow('REQUEST_CONFLICT');
  });
  it('requires a transaction already bound by the authenticated server checkout', async () => {
    const owner = await account(); const request = randomUUID(); const transaction = newId('txn_');
    await expect(event(owner.user, request, transaction)).rejects.toThrow('REQUEST_CONFLICT');
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    await order(owner.user, request, transaction);
    await event(owner.user, request, transaction);
    expect((await balance(owner.user)).creditsRemaining).toBe(11);
  });
  it('namespaces event IDs and rejects the wrong provider payment ID pattern', async () => {
    const owner = await account(); const request = randomUUID(); const transaction = newId('txn_');
    await order(owner.user, request, transaction);
    await expect(event(owner.user, request, transaction, 'paid', newId('evt_'))).rejects.toThrow('INVALID_PAYMENT');
    await expect(db.query('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [newId('evt_'), 'checkout.session.completed', Math.floor(Date.now() / 1000), 'paid', owner.user, request, `paddle_${transaction}`, null, 0, 'stripe', 'test'])).rejects.toThrow('INVALID_PAYMENT');
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
  });
  it('keeps a refund-before-completion tombstone and deduplicates approved adjustments', async () => {
    const owner = await account(); const request = randomUUID(); const transaction = newId('txn_'); const adjustment = newId('paddle_adj_');
    await order(owner.user, request, transaction);
    await event(owner.user, request, transaction, 'refund', undefined, 'test', 500, adjustment);
    await event(owner.user, request, transaction, 'refund', undefined, 'test', 500, adjustment);
    await event(owner.user, request, transaction, 'paid');
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
    expect((await db.query<{ refund_amount: number }>('SELECT refund_amount FROM billing_payments WHERE payment_intent=$1', [`paddle_${transaction}`])).rows[0].refund_amount).toBe(500);
    await event(owner.user, request, transaction, 'refund', undefined, 'test', 300);
    expect((await db.query<{ refund_amount: number }>('SELECT refund_amount FROM billing_payments WHERE payment_intent=$1', [`paddle_${transaction}`])).rows[0].refund_amount).toBe(800);
    expect((await balance(owner.user)).creditsRemaining).toBe(1);
  });
  it('does not make sandbox paid grants spendable in live mode', async () => {
    const owner = await account(); const request = randomUUID(); const transaction = newId('txn_');
    await order(owner.user, request, transaction); await event(owner.user, request, transaction);
    expect((await balance(owner.user)).creditsRemaining).toBe(11);
    const live = (await db.query<{ result: { creditsRemaining: number } }>('SELECT jobvance_get_entitlement($1,$2) AS result', [owner.user, 'live'])).rows[0].result;
    expect(live.creditsRemaining).toBe(1);
    await expect(event(owner.user, request, transaction, 'paid', undefined, 'live')).rejects.toThrow('REQUEST_CONFLICT');
  });
});
