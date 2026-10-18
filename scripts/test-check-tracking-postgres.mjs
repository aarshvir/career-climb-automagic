import assert from 'node:assert/strict';
import { checkTrackingSchema, checkTrackingMigration } from '../supabase/tests/fixtures/check-tracking-schema.mjs';
import { checkLoopSchema, checkLoopMigration } from '../supabase/tests/fixtures/check-loop-schema.mjs';
import { checkLoopNativeCases } from './fixtures/check-loop-native-cases.mjs';
import { selectedPreparationNativeCases } from './fixtures/selected-preparation-native-cases.mjs';
import { cvVariantsNativeCases } from './fixtures/cv-variants-native-cases.mjs';
import { cvVariantFactsNativeCases } from './fixtures/cv-variant-facts-native-cases.mjs';
import { recurringProductNativeCases } from './fixtures/recurring-product-native-cases.mjs';
import { loopSubscriptionsNativeCases } from './fixtures/loop-subscriptions-native-cases.mjs';
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
assert(args.every(arg => arg === '--loop-subscriptions' || arg === '--recurring-product' || arg === '--prepare-only' || arg === '--check-loop' || arg === '--selected-preparation' || arg === '--cv-variants' || arg === '--cv-variant-facts' || arg.startsWith('--fixture-root=')), 'Unknown argument.');
const selectedPreparation = args.includes('--selected-preparation');
const checkLoop = args.includes('--check-loop');
const cvVariants = args.includes('--cv-variants');
const loopSubscriptions=args.includes('--loop-subscriptions');
const recurringProduct=args.includes('--recurring-product')||loopSubscriptions;
const cvVariantFacts = args.includes('--cv-variant-facts')||recurringProduct;
assert([selectedPreparation, checkLoop, cvVariants, cvVariantFacts].filter(Boolean).length <= 1, 'Choose one native suite.');
const suite = loopSubscriptions?'loop-subscriptions':recurringProduct?'recurring-product':cvVariantFacts ? 'cv-variant-facts' : cvVariants ? 'cv-variants' : selectedPreparation ? 'selected-preparation' : checkLoop ? 'check-loop' : 'check-tracking';
const selectedMigration = '20261015223000_job_loop_selected_preparation.sql';
const cvVariantsMigration = '20261017013000_job_loop_cv_variants.sql';
const cvVariantFactsMigration = '20261017080000_job_loop_cv_variant_facts.sql';
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
Object.assign(localEnv, { PGPASSFILE: path.join(root, 'pgpass'), PGSYSCONFDIR: root, PGAPPNAME: `jobvance-isolated-${suite}`, PSQL_HISTORY: path.join(root, 'psql-history') });
const archive = path.join(root, 'postgresql.zip');
const evidence = { ...source, root, suite, startedAt: new Date().toISOString(), checks: [], limitations: [
  'Native PostgreSQL sessions execute actual migrations; auth.users/auth.uid, unrelated pack columns and Storage tables use isolated fixtures. No worker, provider, document rendering or export runs here.',
  'No hosted Supabase, PostgREST, real authentication or production candidate data is exercised.',
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
      cwd: root, env: { ...localEnv, PGAPPNAME: `jobvance-${suite}-${name}` }, shell: false, windowsHide: true,
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
  const pgctl = path.join(bin, 'pg_ctl.exe'), psql = path.join(bin, 'psql.exe');
  const sessions = [];
  let startAttempted = false;
  const session = name => { const result = new Session(psql, port, name); sessions.push(result); return result; };
  evidence.port = port; evidence.dataDirectory = data;
  evidence.harnessSha256 = await digest(fileURLToPath(import.meta.url));
  const migration = loopSubscriptions ? '20261018073501_job_loop_subscription_lifecycle.sql' : cvVariantFacts ? cvVariantFactsMigration : cvVariants ? cvVariantsMigration : selectedPreparation ? selectedMigration : checkLoop ? checkLoopMigration : checkTrackingMigration;
  evidence.migration = { name: migration, sha256: await digest(path.join(repo, 'supabase/migrations', migration)) };
  if (cvVariants) evidence.casesSha256 = await digest(path.join(repo, 'scripts/fixtures/cv-variants-native-cases.mjs'));
  if (cvVariantFacts) evidence.casesSha256 = await digest(path.join(repo, 'scripts/fixtures/cv-variant-facts-native-cases.mjs'));
  if (selectedPreparation) evidence.casesSha256 = await digest(path.join(repo, 'scripts/fixtures/selected-preparation-native-cases.mjs'));
  if (checkLoop) evidence.casesSha256 = await digest(path.join(repo, 'scripts/fixtures/check-loop-native-cases.mjs'));
  try {
    evidence.version = (await command(path.join(bin, 'postgres.exe'), ['--version'])).stdout.trim();
    await command(path.join(bin, 'initdb.exe'), ['--pgdata', data, '--username', 'fixture_admin', '--encoding', 'UTF8', '--locale', 'C', '--auth-host', 'scram-sha-256', '--auth-local', 'scram-sha-256', '--pwfile', pwfile]);
    startAttempted = true;
    await command(pgctl, ['start', '-D', data, '-l', logfile, '-w', '-t', '15', '-o', `-h 127.0.0.1 -p ${port} -c max_connections=10 -c shared_buffers=32MB`]);
    const observer = session('observer');
    await observer.query("SET statement_timeout='8s'; SET lock_timeout='6s';");
    let schema = await (checkLoop || selectedPreparation || cvVariants || cvVariantFacts ? checkLoopSchema() : checkTrackingSchema());
    if (selectedPreparation || cvVariants || cvVariantFacts) schema += '\n' + await readFile(path.join(repo, 'supabase/migrations', selectedMigration), 'utf8');
    if (cvVariants || cvVariantFacts) schema += '\n' + await readFile(path.join(repo, 'supabase/migrations', cvVariantsMigration), 'utf8');
    if (cvVariantFacts) schema += '\n' + await readFile(path.join(repo, 'supabase/migrations', cvVariantFactsMigration), 'utf8');
    if(recurringProduct){evidence.casesSha256=await digest(path.join(repo,'scripts/fixtures/recurring-product-native-cases.mjs'));evidence.productMigrations=[];for(const name of ['20261017122000_job_loop_dodo_entitlements.sql','20261017130000_job_loop_variant_execution.sql','20261017131000_job_loop_recurring_product.sql']){const filename=path.join(repo,'supabase/migrations',name);schema+='\n'+await readFile(filename,'utf8');evidence.productMigrations.push({name,sha256:await digest(filename)});}}
    if(loopSubscriptions){schema+='\nCREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz);\n'+await readFile(path.join(repo,'supabase/migrations',migration),'utf8');evidence.casesSha256=await digest(path.join(repo,'scripts/fixtures/loop-subscriptions-native-cases.mjs'));}
    evidence.executedSchemaSha256 = createHash('sha256').update(schema).digest('hex');
    await observer.query(schema);
    const owner = randomUUID(), other = randomUUID();
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(owner)}),(${quote(other)});`);
    const pids = new Set([await observer.json('SELECT to_json(pg_backend_pid());')]);
    async function actor(name, user = owner, role = 'authenticated') {
      const value = session(name);
      await value.query("SET statement_timeout='8s'; SET lock_timeout='6s';");
      value.pid = await value.json('SELECT to_json(pg_backend_pid());');
      assert(!pids.has(value.pid)); pids.add(value.pid);
      await value.query(`SELECT set_config('request.jwt.claim.sub',${quote(user ?? '')},false); SET ROLE ${role};`);
      return value;
    }
    async function newCheck(user = owner) {
      const check = randomUUID();
      await observer.query(`INSERT INTO cv_checks(id,user_id,request_id,job_title,company,job_description,original_text,reviewed_text,method_version,status)
        VALUES(${quote(check)},${quote(user)},${quote(randomUUID())},'Native role','Native company',repeat('x',80),repeat('y',80),repeat('z',80),'test','approved');`);
      return check;
    }
    const trackSql = id => `SELECT row_to_json(t) FROM public.track_cv_check(${quote(id)}) t;`;
    async function blocking(waiter, holder) {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const found = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
        if (found.includes(holder.pid)) return found;
        await pause(20);
      }
      throw new Error('Expected distinct native sessions to block.');
    }
    async function check(name, test) {
      const detail = await test(); evidence.checks.push({ name, passed: true, ...detail });
      console.log(JSON.stringify({ check: name, passed: true }));
    }
    if(loopSubscriptions)await loopSubscriptionsNativeCases({observer,actor,check,blocking,quote});
    else if(recurringProduct)await recurringProductNativeCases({observer,actor,check,blocking,quote});
    else if (cvVariantFacts) await cvVariantFactsNativeCases({ observer, actor, check, blocking, quote });
    else if (cvVariants) await cvVariantsNativeCases({ observer, actor, check, blocking, quote });
    else if (selectedPreparation) await selectedPreparationNativeCases({ observer, actor, check, blocking, quote });
    else if (checkLoop) await checkLoopNativeCases({ observer, actor, check, blocking, quote, owner, other, newCheck });
    else {
    await check('concurrent first tracking returns one identity and preserves winner progress', async () => {
      const source = await newCheck(), first = await actor('first'), retry = await actor('retry');
      await first.query('BEGIN;');
      const initial = await first.json(trackSql(source));
      await first.query(`UPDATE tracked_applications SET notes='Progress before retry',status='interview',follow_up_at='2026-10-20' WHERE id=${quote(initial.id)};`);
      const pending = retry.json(trackSql(source));
      const blockingPids = await blocking(retry, first);
      const before = await first.json(`SELECT row_to_json(t) FROM tracked_applications t WHERE id=${quote(initial.id)};`);
      await first.query('COMMIT;');
      const after = await pending;
      assert.deepEqual(after, before);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM tracked_applications WHERE cv_check_id=${quote(source)};`), 1);
      await first.end(); await retry.end();
      return { distinctBackendPids: [first.pid, retry.pid], blockingPids };
    });
    await check('source deletion waits for active creation then detaches without losing progress', async () => {
      const source = await newCheck(), writer = await actor('track-before-delete'), deleter = await actor('delete-after-track');
      await writer.query('BEGIN;');
      const result = await writer.json(trackSql(source));
      await writer.query(`UPDATE tracked_applications SET notes='Retain independent progress',status='applied' WHERE id=${quote(result.id)};`);
      const pending = deleter.query(`DELETE FROM cv_checks WHERE id=${quote(source)};`);
      const blockingPids = await blocking(deleter, writer);
      await writer.query('COMMIT;'); await pending;
      const row = await observer.json(`SELECT row_to_json(t) FROM tracked_applications t WHERE id=${quote(result.id)};`);
      assert.equal(row.cv_check_id, null); assert.equal(row.user_id, owner);
      assert.equal(row.status, 'applied'); assert.equal(row.notes, 'Retain independent progress');
      await writer.end(); await deleter.end();
      return { distinctBackendPids: [writer.pid, deleter.pid], blockingPids };
    });
    await check('creation waits for source deletion then fails without resurrecting source', async () => {
      const source = await newCheck(), deleter = await actor('delete-first'), writer = await actor('track-after-delete');
      await deleter.query(`BEGIN; DELETE FROM cv_checks WHERE id=${quote(source)};`);
      const pending = writer.json(trackSql(source)).then(() => false, error => /unavailable/.test(error.message));
      const blockingPids = await blocking(writer, deleter);
      await deleter.query('COMMIT;'); assert.equal(await pending, true);
      assert.equal(await observer.json(`SELECT to_json(count(*)) FROM tracked_applications WHERE cv_check_id=${quote(source)};`), 0);
      await deleter.end(); await writer.end();
      return { distinctBackendPids: [deleter.pid, writer.pid], blockingPids };
    });
    await check('native permission and owner boundaries block guessed links and foreign sources', async () => {
      const source = await newCheck(), foreign = await newCheck(other);
      const valid = await actor('valid-owner'); const row = await valid.json(trackSql(source)); await valid.end();
      const attempts = [
        ['foreign source', owner, 'authenticated', trackSql(foreign), /unavailable/],
        ['missing identity', null, 'authenticated', trackSql(source), /Sign in/],
        ['anonymous RPC', null, 'anon', trackSql(source), /permission denied/],
        ['direct insert', owner, 'authenticated', `INSERT INTO tracked_applications(user_id,cv_check_id,job_title,company) VALUES(${quote(owner)},${quote(source)},'Role','Co');`, /permission denied/],
        ['direct unlink', owner, 'authenticated', `UPDATE tracked_applications SET cv_check_id=NULL WHERE id=${quote(row.id)};`, /permission denied/],
        ['transfer owner', owner, 'authenticated', `UPDATE tracked_applications SET user_id=${quote(other)} WHERE id=${quote(row.id)};`, /row-level security/],
        ['source reparent', owner, 'authenticated', `UPDATE cv_checks SET user_id=${quote(other)} WHERE id=${quote(source)};`, /permission denied/],
      ];
      for (const [name, user, role, sql, expected] of attempts) {
        const attempted = await actor(name.replaceAll(' ', '-'), user, role);
        assert(await attempted.query(sql).then(() => false, error => expected.test(error.message)), name);
        await attempted.end();
      }
      const invisible = await actor('foreign-reader', other);
      assert.equal(await invisible.json(`SELECT to_json(count(*)) FROM tracked_applications WHERE id=${quote(row.id)};`), 0);
      await invisible.end();
      return { rejectedAttempts: attempts.map(item => item[0]) };
    });
    await check('manual and pack rows remain writable and same-title checks stay distinct', async () => {
      const first = await newCheck(), second = await newCheck(), pack = randomUUID();
      await observer.query(`INSERT INTO application_packs(id,user_id) VALUES(${quote(pack)},${quote(owner)});`);
      const client = await actor('legacy-and-distinct');
      assert.notEqual((await client.json(trackSql(first))).id, (await client.json(trackSql(second))).id);
      const manual = randomUUID(), linked = randomUUID();
      await client.query(`INSERT INTO tracked_applications(id,user_id,pack_id,job_title,company) VALUES
        (${quote(manual)},${quote(owner)},NULL,'Native role','Native company'),
        (${quote(linked)},${quote(owner)},${quote(pack)},'Native role','Native company');
        UPDATE tracked_applications SET status='offer',notes='Retained legacy progress' WHERE id IN (${quote(manual)},${quote(linked)});`);
      const rows = await client.json(`SELECT jsonb_agg(t) FROM tracked_applications t WHERE id IN (${quote(manual)},${quote(linked)});`);
      assert(rows.every(row => row.cv_check_id === null && row.status === 'offer'));
      await client.query(`DELETE FROM tracked_applications WHERE id IN (${quote(manual)},${quote(linked)});`);
      await client.end();
      return { distinctExactChecks: 2, legacyRowsUpdatedAndDeleted: 2 };
    });
    }
    evidence.backendPids = [...pids]; evidence.passed = true;
  } catch (error) {
    evidence.passed = false; evidence.failure = error instanceof Error ? error.message : String(error); throw error;
  } finally {
    for (const active of sessions) await active.end();
    if (startAttempted) {
      try { await command(pgctl, ['stop', '-D', data, '-m', 'fast', '-w', '-t', '15']); evidence.clusterStopped = true; }
      catch (error) { evidence.clusterStopped = false; evidence.stopFailure = String(error); }
    }
    evidence.finishedAt = new Date().toISOString();
    await writeFile(path.join(root, `${suite}-evidence.json`), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ stage: 'native-fixture-finished', root, passed: evidence.passed, checks: evidence.checks.length, clusterStopped: evidence.clusterStopped }));
  }
}

await prepare();
if (!args.includes('--prepare-only')) await runNative();

