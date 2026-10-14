import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Native, disposable PostgreSQL only. This script never reads project secrets,
// contacts Supabase, changes services/PATH/firewall, or uses real candidates.
const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const source = {
  url: 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip',
  bytes: 381531864,
  sha256: '80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f',
  provenance: [
    'https://www.postgresql.org/download/windows/',
    'https://www.enterprisedb.com/download-postgresql-binaries',
    'https://github.com/EnterpriseDB/edb-installers/issues/731',
    'https://www.postgresql.org/about/licence/',
  ],
};
const args = process.argv.slice(2);
assert(args.every(arg => arg === '--prepare-only' || arg.startsWith('--fixture-root=')), 'Unknown argument.');
assert.equal(process.platform, 'win32', 'This pinned archive is for Windows x64.');
assert.equal(process.arch, 'x64', 'This pinned archive is for Windows x64.');
const temporary = path.join(repo, '.tmp');
await mkdir(temporary, { recursive: true });
const supplied = args.find(arg => arg.startsWith('--fixture-root='))?.slice('--fixture-root='.length);
const root = path.resolve(supplied ?? path.join(temporary, `isolated-pg-${randomUUID()}`));
assert.equal(path.dirname(root).toLowerCase(), temporary.toLowerCase(), 'Fixture must be directly beneath this repository .tmp directory.');
assert.match(path.basename(root), /^isolated-pg-[a-f0-9-]{36}$/, 'Use a unique fixture directory.');
if (!supplied) await mkdir(root, { recursive: false });
assert.equal((await realpath(root)).toLowerCase(), root.toLowerCase(), 'Fixture root must not be redirected.');
const disk = await statfs(root);
assert(Number(disk.bavail) * Number(disk.bsize) > 4 * 1024 ** 3, 'At least 4 GiB of free space is required.');
const localEnv = { ...process.env, TEMP: root, TMP: root };
for (const key of Object.keys(localEnv)) if (/^SUPABASE_|^JOB_LOOP_|^OPENROUTER_|^ANTHROPIC_|^OPENAI_|^DATABASE_URL$|^PG/.test(key)) delete localEnv[key];
Object.assign(localEnv, { PGPASSFILE: path.join(root, 'pgpass'), PGSYSCONFDIR: root, PGAPPNAME: 'jobvance-isolated-gc', PSQL_HISTORY: path.join(root, 'psql-history') });
const archive = path.join(root, 'postgresql.zip');
const evidence = { ...source, root, startedAt: new Date().toISOString(), checks: [], limitations: [
  'PostgreSQL SQL and concurrent sessions are native; storage.objects and cron/net transport are explicit local fixture substitutes.',
  'This is not Supabase Storage, S3 byte deletion, hosted pg_net/cron, or production validation.',
  'The vendor repository publishes the ZIP digest; no detached publisher signature was located.',
] };

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function command(executable, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: root, env: localEnv, shell: false, windowsHide: true, ...options });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    // pg_ctl's detached Windows child can retain inherited pipe handles even
    // after pg_ctl exits. Its own exit, not those inherited handles, is decisive.
    child.once('exit', code => {
      child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy();
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(executable)} exited ${code}: ${stderr.slice(-5000)}${stdout.slice(-1000)}`));
    });
  });
}

async function prepare() {
  let existing = false;
  try { existing = (await stat(archive)).isFile(); } catch { /* Fresh download. */ }
  if (!existing) {
    const response = await fetch(source.url, { redirect: 'error', signal: AbortSignal.timeout(600000) });
    assert.equal(response.status, 200, 'Vendor archive request failed.');
    assert.equal(Number(response.headers.get('content-length')), source.bytes, 'Unexpected archive size.');
    let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > source.bytes) return done(new Error('Archive exceeds its pinned size.'));
      done(null, chunk);
    } }), createWriteStream(archive, { flags: 'wx' }));
    assert.equal(bytes, source.bytes, 'Incomplete archive.');
  }
  assert.equal((await stat(archive)).size, source.bytes, 'Pinned archive size changed.');
  assert.equal(await digest(archive), source.sha256, 'Vendor digest mismatch: no binary may execute.');
  evidence.archiveVerifiedAt = new Date().toISOString();
  console.log(JSON.stringify({ stage: 'verified-vendor-archive', root, bytes: source.bytes, sha256: source.sha256 }));

  // Validate every archive entry before writing any extracted file. No linked
  // entries, traversals, case-colliding paths, absolute names or zip bombs.
  const extraction = path.join(root, 'extract.ps1');
  await writeFile(extraction, String.raw`
param([string]$Archive,[string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskBase=[IO.Path]::GetFullPath($Destination).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
$taskZip=[IO.Compression.ZipFile]::OpenRead($Archive)
try {
  if($taskZip.Entries.Count -gt 100000){throw 'Too many archive entries'}
  $taskNames=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$taskTotal=0
  foreach($taskEntry in $taskZip.Entries){
    $taskName=$taskEntry.FullName
    if($taskName.Length -gt 1024 -or $taskName -match '^[\/]|[:\\]' -or $taskName -match '(^|/)\.\.?(/|$)'){throw 'Unsafe archive entry'}
    $taskTarget=[IO.Path]::GetFullPath([IO.Path]::Combine($Destination,$taskName.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    if(-not $taskTarget.StartsWith($taskBase,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive escaped fixture'}
    if(-not $taskNames.Add($taskTarget)){throw 'Duplicate archive destination'}
    $taskUnixType=($taskEntry.ExternalAttributes -shr 16) -band 0xF000
    if($taskUnixType -eq 0xA000){throw 'Archive links are forbidden'}
    $taskTotal+=$taskEntry.Length
    if($taskTotal -gt 4GB){throw 'Archive expands beyond fixture bound'}
  }
  [long]$taskCount=0
  foreach($taskEntry in $taskZip.Entries){
    if($taskEntry.FullName -notmatch '^pgsql/(bin|lib|share|doc)/'){continue}
    $taskTarget=[IO.Path]::GetFullPath([IO.Path]::Combine($Destination,$taskEntry.FullName.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    if($taskEntry.FullName.EndsWith('/')){[void][IO.Directory]::CreateDirectory($taskTarget);continue}
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskTarget))
    [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry,$taskTarget,$true)
    $taskCount++
  }
  @{entries=$taskZip.Entries.Count;extracted=$taskCount;expandedBytes=$taskTotal}|ConvertTo-Json -Compress
} finally {$taskZip.Dispose()}
`, 'utf8');
  const extracted = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', extraction, '-Archive', archive, '-Destination', root]);
  evidence.extraction = JSON.parse(extracted.stdout.trim());
  await writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ stage: 'extracted', root, ...evidence.extraction }));
}

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const array = values => `ARRAY[${values.map(quote).join(',')}]`;

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

class Session {
  constructor(executable, port, name) {
    this.name = name;
    this.stderr = '';
    this.buffer = '';
    this.ended = false;
    this.pending = null;
    this.process = spawn(executable, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'fixture_admin', '-d', 'postgres'], {
      cwd: root, env: { ...localEnv, PGAPPNAME: `jobvance-gc-${name}` }, shell: false, windowsHide: true,
    });
    this.process.stdout.on('data', chunk => {
      this.buffer += chunk;
      for (;;) {
        const at = this.buffer.indexOf('\n');
        if (at < 0) break;
        const line = this.buffer.slice(0, at).replace(/\r$/, '');
        this.buffer = this.buffer.slice(at + 1);
        if (!this.pending) continue;
        if (line === this.pending.marker) {
          const pending = this.pending;
          this.pending = null;
          pending.resolve(pending.lines);
        } else if (line) this.pending.lines.push(line);
      }
    });
    this.process.stderr.on('data', chunk => { this.stderr += chunk; });
    this.closed = new Promise(resolve => {
      this.process.once('error', error => { this.pending?.reject(error); this.pending = null; });
      this.process.once('close', code => {
        this.ended = true;
        if (this.pending) this.pending.reject(new Error(`${this.name} psql exited ${code}: ${this.stderr.slice(-5000)}`));
        this.pending = null;
        resolve(code);
      });
    });
  }
  query(sql) {
    assert(!this.pending && !this.ended, `${this.name} session cannot accept overlapping commands.`);
    const marker = `__JV_${randomUUID()}`;
    return new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject, lines: [] };
      this.process.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
  }
  async json(sql) {
    const lines = await this.query(sql);
    assert(lines.length, `${this.name} returned no JSON.`);
    return JSON.parse(lines.at(-1));
  }
  async end() {
    if (!this.ended) {
      this.process.stdin.write('ROLLBACK;\n\\q\n');
      const timeout = setTimeout(() => { if (!this.ended) this.process.kill(); }, 4000);
      await this.closed;
      clearTimeout(timeout);
    }
  }
}

async function runNative() {
  const bin = path.join(root, 'pgsql', 'bin');
  const data = path.join(root, `data-${randomUUID()}`);
  const logfile = path.join(root, `${path.basename(data)}.log`);
  const port = await unusedPort();
  const password = randomBytes(32).toString('hex');
  const pwfile = path.join(root, 'init-password');
  await writeFile(pwfile, `${password}\n`, { mode: 0o600 });
  await writeFile(localEnv.PGPASSFILE, `127.0.0.1:${port}:*:fixture_admin:${password}\n`, { mode: 0o600 });
  const pgctl = path.join(bin, 'pg_ctl.exe');
  const psql = path.join(bin, 'psql.exe');
  const sessions = [];
  let startAttempted = false;
  const session = name => { const result = new Session(psql, port, name); sessions.push(result); return result; };
  evidence.port = port;
  evidence.dataDirectory = data;
  evidence.harnessSha256 = await digest(fileURLToPath(import.meta.url));
  evidence.nativeBinaries = {};
  try {
    for (const name of ['initdb', 'pg_ctl', 'postgres', 'psql']) evidence.nativeBinaries[name] = await digest(path.join(bin, `${name}.exe`));
    evidence.version = (await command(path.join(bin, 'postgres.exe'), ['--version'])).stdout.trim();
    await command(path.join(bin, 'initdb.exe'), ['--pgdata', data, '--username', 'fixture_admin', '--encoding', 'UTF8', '--locale', 'C', '--auth-host', 'scram-sha-256', '--auth-local', 'scram-sha-256', '--pwfile', pwfile]);
    startAttempted = true;
    await command(pgctl, ['start', '-D', data, '-l', logfile, '-w', '-t', '15', '-o', `-h 127.0.0.1 -p ${port} -c max_connections=10 -c shared_buffers=32MB`]);
    const observer = session('observer');
    await observer.query("SET statement_timeout='8s'; SET lock_timeout='6s';");
    await observer.query(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text, UNIQUE(bucket_id,name));
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON storage.objects TO anon,authenticated;
    `);
    const migrations = [
      '20261011010000_job_loop_cloud.sql', '20261011020000_job_loop_revoke_all.sql',
      '20261011030000_job_loop_recurring.sql', '20261013190000_job_loop_provider_lease.sql',
      '20261014101107_job_loop_durable_erasure.sql', '20261014131351_job_loop_request_generation.sql',
      '20261014161126_job_loop_terminal_artifact_gc.sql',
    ];
    evidence.migrations = [];
    for (const name of migrations) {
      const filename = path.join(repo, 'supabase', 'migrations', name);
      const sql = await readFile(filename, 'utf8');
      assert(sql.trim().endsWith('COMMIT;'), `Migration ${name} is unfinished.`);
      await observer.query(sql);
      evidence.migrations.push({ name, sha256: await digest(filename) });
    }
    const backendPids = new Set([await observer.json('SELECT to_json(pg_backend_pid());')]);
    const hash = 'a'.repeat(64);
    const career = { profile: { name: 'Native concurrency fixture' }, claims: [], opportunities: [], inbox: [] };
    async function actor(name) {
      const value = session(name);
      await value.query("SET statement_timeout='8s'; SET lock_timeout='6s';");
      value.pid = await value.json('SELECT to_json(pg_backend_pid());');
      assert(!backendPids.has(value.pid), 'Concurrency requires distinct PostgreSQL backends.');
      backendPids.add(value.pid);
      return value;
    }
    async function blocked(waiter, holder) {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
        if (pids.includes(holder.pid)) return pids;
        await pause(20);
      }
      throw new Error(`Expected PostgreSQL backend ${waiter.pid} to block on ${holder.pid}.`);
    }
    async function setup(paths = 1, terminal = true) {
      const user = randomUUID();
      await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(user)});`);
      const initial = await observer.json(`SELECT job_loop_open_record(${quote(user)});`);
      await observer.query(`SELECT job_loop_write_record(${quote(user)},${initial.version},${quote(JSON.stringify(career))}::jsonb,true);`);
      const current = await observer.json(`SELECT job_loop_read_record(${quote(user)},${initial.lifecycle_generation});`);
      const run = await observer.json(`SELECT job_loop_start_run_bound(${quote(user)},${initial.lifecycle_generation},${quote(randomUUID())},${quote(hash)},${quote(hash)},${current.version},'rules','grounded-rules-v1','{}'::jsonb);`);
      const lease = randomUUID();
      await observer.query(`SELECT job_loop_claim_run(${quote(run.id)},${quote(lease)});`);
      const artifacts = [];
      for (let i = 0; i < paths; i++) {
        const packet = randomUUID();
        const artifactPath = await observer.json(`SELECT to_json(job_loop_authorize_artifact(${quote(user)},${quote(run.id)},${quote(lease)},${quote(packet)},${quote(hash)},'txt'));`);
        await observer.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',${quote(artifactPath)});`);
        artifacts.push({ packet, path: artifactPath });
      }
      if (terminal) await observer.query(`UPDATE job_loop_runs SET status='cancelled',finished_at=now()-interval '25 hours',lease_token=NULL,lease_until=NULL WHERE id=${quote(run.id)};`);
      await observer.query(`UPDATE job_loop_gc_config SET enabled=true,allowed_owner_ids=${array([user])}::uuid[],last_owner_id=NULL WHERE singleton;`);
      return { user, run: run.id, lease, generation: initial.lifecycle_generation, inputVersion: current.input_version, artifacts };
    }
    function packetInsert(fixture, artifact) {
      const data = { artifacts: { txt: { path: artifact.path, sha256: hash, byteSize: 1 } } };
      return `INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status) VALUES(${quote(artifact.packet)},${quote(fixture.user)},${quote(fixture.run)},${quote(randomUUID())},${fixture.inputVersion},${quote(hash)},${quote(JSON.stringify(data))}::jsonb,'held');`;
    }
    async function check(name, test) {
      const started = new Date().toISOString();
      const details = await test();
      evidence.checks.push({ name, passed: true, startedAt: started, ...details });
      console.log(JSON.stringify({ stage: 'native-check-passed', name }));
    }

    await check('claim serializes against packet publication and rejects the newly closed path', async () => {
      const fixture = await setup(), claim = await actor('claim-first'), publish = await actor('publish-after-claim');
      const token = randomUUID();
      await claim.query('BEGIN;');
      const rows = await claim.json(`SELECT job_loop_gc_claim(${quote(token)},200);`);
      assert.equal(rows.length, 1);
      const result = publish.query(packetInsert(fixture, fixture.artifacts[0])).then(() => ({ accepted: true }), error => ({ error: error.message }));
      const blockers = await blocked(publish, claim);
      await claim.query('COMMIT;');
      const outcome = await result;
      assert.match(outcome.error ?? '', /LOOP_ARTIFACT_UNAUTHORIZED/);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_packets WHERE user_id=${quote(fixture.user)};`), 0);
      await claim.end(); await publish.end();
      return { distinctBackendPids: [claim.pid, publish.pid], observedBlockingPids: blockers, rejectedCode: 'LOOP_ARTIFACT_UNAUTHORIZED' };
    });

    await check('publication holds the owner lock so collection skips it and later preserves its held packet reference', async () => {
      const fixture = await setup(), publish = await actor('publish-first'), collect = await actor('collect-after-publish');
      await publish.query('BEGIN;');
      await publish.query(packetInsert(fixture, fixture.artifacts[0]));
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      await publish.query('COMMIT;');
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_artifact_tombstones WHERE user_id=${quote(fixture.user)};`), 0);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM storage.objects WHERE name=${quote(fixture.artifacts[0].path)};`), 1);
      await publish.end(); await collect.end();
      return { distinctBackendPids: [publish.pid, collect.pid], heldPacketReferencePreserved: true };
    });

    await check('the real worker commit RPC holds the owner lock and its saved artifact remains excluded from collection', async () => {
      const fixture = await setup(1, false), commit = await actor('real-worker-commit'), collect = await actor('collect-during-worker-commit');
      const artifact = fixture.artifacts[0];
      const packet = { id: artifact.packet, runId: fixture.run, opportunityId: randomUUID(), inputHash: hash,
        artifacts: { txt: { path: artifact.path, sha256: hash, byteSize: 1 } }, status: 'held' };
      await commit.query('BEGIN;');
      const committed = await commit.json(`SELECT job_loop_commit_phase(${quote(fixture.run)},${quote(fixture.lease)},1,'completed','{}'::jsonb,${quote(JSON.stringify([packet]))}::jsonb,'[]'::jsonb);`);
      assert.equal(committed.status, 'completed');
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      await commit.query('COMMIT;');
      await observer.query(`UPDATE job_loop_runs SET finished_at=now()-interval '25 hours' WHERE id=${quote(fixture.run)};`);
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_artifact_tombstones WHERE user_id=${quote(fixture.user)};`), 0);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_packets WHERE id=${quote(artifact.packet)} AND status='held';`), 1);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM storage.objects WHERE name=${quote(artifact.path)};`), 1);
      await commit.end(); await collect.end();
      return { distinctBackendPids: [commit.pid, collect.pid], publicationRpc: 'job_loop_commit_phase', heldPacketReferencePreserved: true };
    });

    await check('an in-progress erasure owner lock makes collection skip without creating a tombstone', async () => {
      const fixture = await setup(), erase = await actor('erase-first'), collect = await actor('collect-after-erase');
      await erase.query('BEGIN;');
      const erasure = await erase.json(`SELECT job_loop_begin_erase(${quote(fixture.user)},${fixture.generation});`);
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      await erase.query('COMMIT;');
      assert.deepEqual(await collect.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},200);`), []);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_artifact_tombstones WHERE user_id=${quote(fixture.user)};`), 0);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM storage.objects WHERE name=${quote(fixture.artifacts[0].path)};`), 1);
      await erase.end(); await collect.end();
      return { distinctBackendPids: [erase.pid, collect.pid], erasureGeneration: erasure.generation, noStorageDeletion: true };
    });

    await check('competing collectors use distinct backends and never claim the same path', async () => {
      const fixture = await setup(2), first = await actor('collector-one'), second = await actor('collector-two');
      await first.query('BEGIN;');
      const left = await first.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},1);`);
      assert.equal(left.length, 1);
      const waiting = second.json(`SELECT job_loop_gc_claim(${quote(randomUUID())},1);`);
      const blockers = await blocked(second, first);
      await first.query('COMMIT;');
      const right = await waiting;
      assert.equal(right.length, 1);
      assert.notEqual(left[0].path, right[0].path);
      await first.end(); await second.end();
      return { distinctBackendPids: [first.pid, second.pid], observedBlockingPids: blockers, nonOverlappingClaims: true };
    });

    await check('a claimed path stays closed after erasure and fresh same-owner enrollment', async () => {
      const fixture = await setup(), collect = await actor('claim-before-new-lifetime'), erase = await actor('erase-after-claim');
      const token = randomUUID();
      assert.equal((await collect.json(`SELECT job_loop_gc_claim(${quote(token)},200);`)).length, 1);
      const erasure = await erase.json(`SELECT job_loop_begin_erase(${quote(fixture.user)},${fixture.generation});`);
      // Local metadata substitute only: no actual Storage/S3 bytes are involved.
      await erase.query(`DELETE FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name=${quote(fixture.artifacts[0].path)};
        SELECT job_loop_finish_erase(${quote(fixture.user)},${erasure.generation});`);
      const fresh = await erase.json(`SELECT job_loop_open_record(${quote(fixture.user)});`);
      assert(fresh.lifecycle_generation > erasure.generation);
      await erase.query(`SELECT job_loop_write_record(${quote(fixture.user)},${fresh.version},${quote(JSON.stringify(career))}::jsonb,true);`);
      const current = await erase.json(`SELECT job_loop_read_record(${quote(fixture.user)},${fresh.lifecycle_generation});`);
      const run = await erase.json(`SELECT job_loop_start_run_bound(${quote(fixture.user)},${fresh.lifecycle_generation},${quote(randomUUID())},${quote(hash)},${quote(hash)},${current.version},'rules','grounded-rules-v1','{}'::jsonb);`);
      const lease = randomUUID();
      await erase.query(`SELECT job_loop_claim_run(${quote(run.id)},${quote(lease)});`);
      const denied = await erase.query(`SELECT job_loop_authorize_artifact(${quote(fixture.user)},${quote(run.id)},${quote(lease)},${quote(fixture.artifacts[0].packet)},${quote(hash)},'txt');`).then(() => false, error => /LOOP_ARTIFACT_UNAUTHORIZED/.test(error.message));
      assert(denied, 'Old closed path must not be authorized under a fresh lifecycle.');
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_artifact_tombstones WHERE path=${quote(fixture.artifacts[0].path)};`), 1);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM storage.objects WHERE name=${quote(fixture.artifacts[0].path)};`), 0);
      await collect.end(); await erase.end();
      return { distinctBackendPids: [collect.pid, erase.pid], originalGeneration: fixture.generation, freshGeneration: fresh.lifecycle_generation, rejectedCode: 'LOOP_ARTIFACT_UNAUTHORIZED' };
    });
    evidence.passed = true;
    evidence.backendPids = [...backendPids];
  } catch (error) {
    evidence.passed = false;
    evidence.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    for (const active of sessions) await active.end();
    if (startAttempted) {
      try {
        await command(pgctl, ['stop', '-D', data, '-m', 'fast', '-w', '-t', '15']);
        evidence.clusterStopped = true;
      } catch (error) { evidence.clusterStopped = false; evidence.stopFailure = error instanceof Error ? error.message : String(error); }
    }
    evidence.finishedAt = new Date().toISOString();
    await writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ stage: 'native-fixture-finished', root, passed: evidence.passed, checks: evidence.checks.length, clusterStopped: evidence.clusterStopped }));
  }
}

await prepare();
if (args.includes('--prepare-only')) {
  console.log(JSON.stringify({ stage: 'prepared-without-binary-execution', root }));
} else {
  await runNative();
}
