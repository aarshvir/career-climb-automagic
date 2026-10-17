import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

export const TARGETS = Object.freeze({ facebook: '61581026901070', instagram: '17841415488116661', adAccount: '1843729196384751', campaign: '120252906111780325', adset: '120252906157150325', ad: '120252906172570325' });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function canonical(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if ((!Array.isArray(value) && !plain(value)) || stack.has(value)) throw new TypeError('Finite JSON values without cycles required');
  stack.add(value);
  const result = Array.isArray(value) ? '[' + Array.from(value, item => canonical(item, stack)).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], stack)).join(',') + '}';
  stack.delete(value);
  return result;
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const epoch = value => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))) throw new Error('Invalid time');
  const parsed = new Date(value).valueOf(); if (!Number.isFinite(parsed)) throw new Error('Invalid time'); return parsed;
};
const iso = value => new Date(epoch(value)).toISOString();
const strictKeys = (obj, keys) => { if (!plain(obj) || Object.keys(obj).some(key => !keys.includes(key))) throw new Error('Unexpected fields'); };
function validateOperation(op) {
  strictKeys(op, ['kind', 'platform', 'target', 'content']);
  if (op.kind === 'pause_campaign') {
    if (op.platform !== 'meta' || op.target !== TARGETS.campaign || op.content?.accountId !== TARGETS.adAccount) throw new Error('Unapproved advertising scope');
    strictKeys(op.content, ['accountId', 'reason', 'decisionId']);
    if (!nonempty(op.content.reason) || !nonempty(op.content.decisionId)) throw new Error('A measured stop reason is required');
  } else if (op.kind === 'organic_post') {
    if (!['facebook', 'instagram'].includes(op.platform) || op.target !== TARGETS[op.platform]) throw new Error('Unapproved brand identity');
    strictKeys(op.content, ['creativeId', 'revision', 'manifestDigest', 'assetHashes', 'caption', 'destinationUrl']);
    if (!nonempty(op.content.creativeId) || !Number.isSafeInteger(op.content.revision) || op.content.revision < 1 || !/^[a-f0-9]{64}$/.test(op.content.manifestDigest) || !Array.isArray(op.content.assetHashes) || !op.content.assetHashes.length || op.content.assetHashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Exact reviewed creative required');
    if (typeof op.content.caption !== 'string' || !op.content.caption.trim() || op.content.caption.length > 2200) throw new Error('Invalid caption');
    const url = new URL(op.content.destinationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'jobvance.io' || url.port || url.username || url.password || url.hash || !['/loop', '/onboarding', '/check', '/job-loop'].includes(url.pathname)) throw new Error('Unapproved destination');
    for (const [key, value] of url.searchParams) if (!/^utm_(source|medium|campaign|content)$/.test(key) || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Private or unsupported URL data');
  } else throw new Error('Unsupported external action');
}
function identity(op) {
  // Review timestamps/revisions must not make the same content post twice.
  return digest(op.kind === 'organic_post' ? { kind: op.kind, platform: op.platform, target: op.target, caption: op.content.caption, destinationUrl: op.content.destinationUrl, assetHashes: op.content.assetHashes } : op);
}

/** A local durable outbox. It never calls an external API or owns credentials. */
export class ReceiptStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','inflight','unknown','confirmed')), token TEXT, started TEXT, receipt TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY, operation_id TEXT REFERENCES operations(id), kind TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const out = fn(); this.db.exec('COMMIT'); return out; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  event(id, kind, body, now) { this.db.prepare('INSERT INTO events(operation_id,kind,body,created) VALUES(?,?,?,?)').run(id, kind, canonical(body), iso(now)); }
  enqueue(op, now = Date.now()) {
    validateOperation(op); canonical(op); iso(now); const key = identity(op);
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT id,status FROM operations WHERE identity=?').get(key);
      if (existing) return { ...existing, duplicate: true };
      const id = randomUUID(); this.db.prepare('INSERT INTO operations(id,identity,body,status,created) VALUES(?,?,?,?,?)').run(id, key, canonical(op), 'queued', iso(now));
      this.event(id, 'queued', { identity: key }, now); return { id, status: 'queued', duplicate: false };
    });
  }
  get(id) { const row = this.db.prepare('SELECT * FROM operations WHERE id=?').get(id); if (!row) throw new Error('Unknown operation'); return { ...row, body: JSON.parse(row.body), receipt: row.receipt ? JSON.parse(row.receipt) : null }; }
  claim(id, { now = Date.now(), manifestDigest = null, quality = null } = {}) {
    const currentTime = epoch(now);
    return this.transaction(() => {
      const row = this.get(id);
      if (row.status !== 'queued') throw new Error('Operation already attempted; reconcile rather than retry');
      if (row.body.kind === 'organic_post') {
        if (manifestDigest !== row.body.content.manifestDigest) throw new Error('Review does not match queued creative');
        if (!plain(quality) || quality.ok !== true || quality.reviewed !== true || !Array.isArray(quality.errors) || quality.errors.length !== 0 || quality.manifestDigest !== manifestDigest
          || !Number.isFinite(quality.validatedAt) || quality.validatedAt > currentTime || currentTime - quality.validatedAt > 60000
          || !Array.isArray(quality.assets) || quality.assets.length !== row.body.content.assetHashes.length
          || quality.assets.some((asset, index) => !plain(asset) || asset.sha256 !== row.body.content.assetHashes[index] || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1)) throw new Error('Fresh successful exact asset quality validation required');
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(now));
        if (['Sat', 'Sun'].includes(weekday)) throw new Error('Brand cadence is one reviewed post per weekday');
        const started = this.db.prepare("SELECT body,started FROM operations WHERE started IS NOT NULL AND status IN ('inflight','unknown','confirmed')").all();
        if (started.some(other => { const body = JSON.parse(other.body); return body.kind === 'organic_post' && body.platform === row.body.platform && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(other.started)) === day; })) throw new Error('Daily publishing slot already used or unresolved');
      }
      const token = randomUUID(); this.db.prepare("UPDATE operations SET status='inflight',token=?,started=? WHERE id=?").run(token, iso(now), id);
      this.event(id, 'dispatch_started', { token }, now); return { id, token, body: row.body, started: iso(now) };
    });
  }
  uncertain(id, token, reason, now = Date.now()) {
    return this.transaction(() => { const row = this.get(id); if (row.token !== token || !['inflight', 'unknown'].includes(row.status)) throw new Error('Wrong attempt'); this.db.prepare("UPDATE operations SET status='unknown' WHERE id=?").run(id); this.event(id, 'outcome_unknown', { reason: String(reason).slice(0,500) }, now); return this.get(id); });
  }
  confirm(id, token, receipt, now = Date.now()) {
    return this.transaction(() => {
      const row = this.get(id);
      strictKeys(receipt, ['externalId','url','observedAt','target','bodyDigest','verification']);
      if (row.token !== token || !['inflight', 'unknown', 'confirmed'].includes(row.status)) throw new Error('Wrong attempt');
      if (!nonempty(receipt.externalId) || receipt.target !== row.body.target || receipt.bodyDigest !== digest(row.body) || receipt.verification !== 'platform_readback' || epoch(receipt.observedAt) < epoch(row.started) || epoch(receipt.observedAt) > epoch(now)) throw new Error('Verified matching platform receipt required');
      if (row.body.kind === 'organic_post') { const url = new URL(receipt.url); const domain = row.body.platform === 'facebook' ? 'facebook.com' : 'instagram.com'; if (url.protocol !== 'https:' || ![domain, `www.${domain}`].includes(url.hostname) || url.port || url.username || url.password) throw new Error('Invalid platform receipt URL'); }
      else if (receipt.externalId !== TARGETS.campaign) throw new Error('Wrong campaign receipt');
      if (row.status === 'confirmed') { if (canonical(row.receipt) !== canonical(receipt)) throw new Error('Confirmed receipt cannot change'); return row; }
      this.db.prepare("UPDATE operations SET status='confirmed',receipt=? WHERE id=?").run(canonical(receipt), id); this.event(id, 'confirmed', receipt, now); return this.get(id);
    });
  }
  recover(now = Date.now(), timeoutMs = 10*60*1000) {
    const currentTime = epoch(now); if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('Invalid recovery timeout');
    return this.transaction(() => { const rows = this.db.prepare("SELECT id,started FROM operations WHERE status='inflight'").all(); const changed = [];
      for (const row of rows) if (epoch(row.started) + timeoutMs <= currentTime) { this.db.prepare("UPDATE operations SET status='unknown' WHERE id=?").run(row.id); this.event(row.id, 'crash_recovery_requires_reconciliation', {}, now); changed.push(row.id); }
      return changed;
    });
  }
  observe(kind, body, now = Date.now()) { const id = digest({ kind, body }); this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?)').run(id, kind, canonical(body), iso(now)); return id; }
  report() { return { operations: this.db.prepare('SELECT id,body,status,started,receipt,created FROM operations ORDER BY created').all().map(row => ({...row,body:JSON.parse(row.body),receipt:row.receipt?JSON.parse(row.receipt):null})), observations: this.db.prepare('SELECT * FROM observations ORDER BY created').all().map(row=>({...row,body:JSON.parse(row.body)})) }; }
}
