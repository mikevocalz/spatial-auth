import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMergeCoordinator } from '../build/src/merge.js';

// A disposable host adapter exercises the public transaction contract. It is not
// a production Better Auth adapter or a policy for transferring real user data.
const cleanup = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); });
const now = 100_000;
const input = { intentId: 'intent', idempotencyKey: 'confirmation', currentBetterAuthUserId: 'target' };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'spatial-merge-test-'));
  const path = join(directory, 'fixture.sqlite');
  let db = new DatabaseSync(path);
  cleanup.push(() => { db.close(); rmSync(directory, { recursive: true }); });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_user (id TEXT PRIMARY KEY, tenant TEXT NOT NULL);
    CREATE TABLE domain_record (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES app_user(id));
    CREATE TABLE billing_record (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES app_user(id));
    CREATE TABLE account_binding (provider TEXT NOT NULL, subject TEXT NOT NULL, owner TEXT NOT NULL REFERENCES app_user(id), UNIQUE(provider, subject));
    CREATE TABLE app_session (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES app_user(id));
    CREATE TABLE source_auth_fence (owner TEXT PRIMARY KEY REFERENCES app_user(id));
    CREATE TABLE merge_intent (
      id TEXT PRIMARY KEY, targetUserId TEXT NOT NULL REFERENCES app_user(id), sourceUserId TEXT NOT NULL REFERENCES app_user(id),
      state TEXT NOT NULL, expiresAt INTEGER NOT NULL, targetReauthenticatedAt INTEGER NOT NULL,
      sourceProofVerifiedAt INTEGER NOT NULL, confirmedAt INTEGER NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE
    );
    CREATE TABLE verified_source (intent TEXT PRIMARY KEY REFERENCES merge_intent(id), provider TEXT NOT NULL, subject TEXT NOT NULL);
    CREATE TABLE outbox (intent TEXT PRIMARY KEY REFERENCES merge_intent(id), source TEXT NOT NULL REFERENCES app_user(id), delivered INTEGER NOT NULL DEFAULT 0);
    INSERT INTO app_user VALUES ('target', 'tenant'), ('source', 'tenant'), ('outsider', 'other');
    INSERT INTO domain_record VALUES ('target-draft', 'target'), ('source-draft', 'source');
    INSERT INTO billing_record VALUES ('source-purchase', 'source');
    INSERT INTO account_binding VALUES ('google', 'target-google', 'target'), ('meta-horizon', 'source-meta', 'source');
    INSERT INTO app_session VALUES ('target-session', 'target'), ('source-session', 'source');
    INSERT INTO merge_intent VALUES ('intent', 'target', 'source', 'confirmed', 110000, 99000, 99500, 99800, 'confirmation');
    INSERT INTO verified_source VALUES ('intent', 'meta-horizon', 'source-meta');
  `);
  const fault = { phase: undefined };
  const checkpoint = phase => { if (fault.phase === phase) throw new Error(`injected:${phase}`); };
  let tail = Promise.resolve();
  const store = {
    async withTransaction(fn) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      let started = false;
      try {
        db.exec('BEGIN IMMEDIATE');
        started = true;
        const result = await fn({
          getIntentForUpdate: async id => db.prepare('SELECT * FROM merge_intent WHERE id = ?').get(id) ?? null,
          assertEligible: async intent => {
            const source = db.prepare('SELECT tenant FROM app_user WHERE id = ?').get(intent.sourceUserId);
            const target = db.prepare('SELECT tenant FROM app_user WHERE id = ?').get(intent.targetUserId);
            if (!source || !target || source.tenant !== target.tenant) throw new Error('tenant-policy');
            if (db.prepare('SELECT 1 FROM source_auth_fence WHERE owner IN (?, ?)').get(intent.sourceUserId, intent.targetUserId)) {
              throw new Error('account-retired');
            }
            const owner = db.prepare(`SELECT a.owner FROM verified_source v JOIN account_binding a
              ON a.provider = v.provider AND a.subject = v.subject WHERE v.intent = ?`).get(intent.id);
            if (owner?.owner !== intent.sourceUserId) throw new Error('source-ownership-changed');
          },
          transferAllowedDomainRecords: async intent => {
            db.prepare('UPDATE domain_record SET owner = ? WHERE owner = ?').run(intent.targetUserId, intent.sourceUserId);
            checkpoint('domain');
          },
          transferVerifiedProviderBindings: async intent => {
            db.prepare('UPDATE account_binding SET owner = ? WHERE owner = ?').run(intent.targetUserId, intent.sourceUserId);
            checkpoint('provider');
          },
          commitAndQueueSessionRevocation: async intent => {
            db.prepare("UPDATE merge_intent SET state = 'committed' WHERE id = ?").run(intent.id);
            checkpoint('intent');
            // Authorization must deny this source immediately, even if the worker
            // cannot remove persisted sessions until after a restart.
            db.prepare('INSERT INTO source_auth_fence VALUES (?)').run(intent.sourceUserId);
            checkpoint('fence');
            db.prepare('INSERT INTO outbox (intent, source) VALUES (?, ?)').run(intent.id, intent.sourceUserId);
            checkpoint('outbox');
          },
        });
        checkpoint('before-commit');
        db.exec('COMMIT');
        started = false;
        return result;
      } catch (error) {
        if (started) db.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    },
  };
  return {
    get db() { return db; },
    fault,
    coordinator: createMergeCoordinator(store, { now: () => now }),
    reopen() { db.close(); db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys = ON'); },
    snapshot() {
      return Object.fromEntries(['domain_record', 'billing_record', 'account_binding', 'app_session', 'source_auth_fence', 'merge_intent', 'outbox']
        .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    },
    canAuthenticate(sessionId) {
      return Boolean(db.prepare(`SELECT 1 FROM app_session s WHERE s.id = ?
        AND NOT EXISTS (SELECT 1 FROM source_auth_fence f WHERE f.owner = s.owner)`).get(sessionId));
    },
    drainRevocations({ crashAfterRevoke = false } = {}) {
      for (const task of db.prepare('SELECT * FROM outbox WHERE delivered = 0').all()) {
        // This separate commit models an idempotent post-commit revocation whose
        // acknowledgement may be lost. No network or real session is accessed.
        db.prepare('DELETE FROM app_session WHERE owner = ?').run(task.source);
        if (crashAfterRevoke) throw new Error('worker-crash-before-ack');
        db.prepare('UPDATE outbox SET delivered = 1 WHERE intent = ?').run(task.intent);
      }
    },
  };
}

for (const phase of ['domain', 'provider', 'intent', 'fence', 'outbox', 'before-commit']) {
  test(`a failure after ${phase} rolls back every write and allows one clean retry`, async () => {
    const x = fixture();
    const before = x.snapshot();
    x.fault.phase = phase;
    await assert.rejects(x.coordinator.confirm(input), new RegExp(`injected:${phase}`));
    assert.deepEqual(x.snapshot(), before);
    x.reopen();
    assert.deepEqual(x.snapshot(), before);
    x.fault.phase = undefined;
    assert.deepEqual(await x.coordinator.confirm(input), { status: 'committed', targetUserId: 'target' });
    assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 1);
  });
}

test('commit transfers only allowed records, fences source access, and preserves target access', async () => {
  const x = fixture();
  await x.coordinator.confirm(input);
  assert.equal(x.db.prepare("SELECT owner FROM domain_record WHERE id = 'source-draft'").get().owner, 'target');
  assert.equal(x.db.prepare("SELECT owner FROM billing_record WHERE id = 'source-purchase'").get().owner, 'source');
  assert.equal(x.db.prepare("SELECT owner FROM account_binding WHERE subject = 'source-meta'").get().owner, 'target');
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM app_session WHERE owner = 'source'").get().n, 1);
  assert.equal(x.canAuthenticate('source-session'), false);
  assert.equal(x.canAuthenticate('target-session'), true);
});

test('serialized competing confirmations persist one commit and one outbox task', async () => {
  const x = fixture();
  const results = await Promise.all([x.coordinator.confirm(input), x.coordinator.confirm(input)]);
  assert.deepEqual(results.map(result => result.status), ['committed', 'already-committed']);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 1);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM domain_record').get().n, 2);
});

test('outbox survives restart and retries safely after revocation but before acknowledgement', async () => {
  const x = fixture();
  await x.coordinator.confirm(input);
  x.reopen();
  assert.equal(x.canAuthenticate('source-session'), false);
  assert.throws(() => x.drainRevocations({ crashAfterRevoke: true }), /worker-crash-before-ack/);
  assert.equal(x.db.prepare('SELECT delivered FROM outbox').get().delivered, 0);
  x.reopen();
  x.drainRevocations();
  x.drainRevocations();
  assert.equal(x.db.prepare('SELECT delivered FROM outbox').get().delivered, 1);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM app_session WHERE owner = 'source'").get().n, 0);
  assert.equal(x.canAuthenticate('target-session'), true);
  assert.equal((await x.coordinator.confirm(input)).status, 'already-committed');
});

test('a changed source provider association denies the merge without transferring anything', async () => {
  const x = fixture();
  x.db.prepare("UPDATE account_binding SET owner = 'outsider' WHERE subject = 'source-meta'").run();
  const before = x.snapshot();
  await assert.rejects(x.coordinator.confirm(input), /source-ownership-changed/);
  assert.deepEqual(x.snapshot(), before);
});

test('host tenant exclusions deny a merge without partial writes', async () => {
  const x = fixture();
  x.db.prepare("UPDATE app_user SET tenant = 'other' WHERE id = 'source'").run();
  const before = x.snapshot();
  await assert.rejects(x.coordinator.confirm(input), /tenant-policy/);
  assert.deepEqual(x.snapshot(), before);
});

test('a different caller or idempotency key cannot replay a committed intent', async () => {
  const x = fixture();
  await x.coordinator.confirm(input);
  const before = x.snapshot();
  await assert.rejects(x.coordinator.confirm({ ...input, currentBetterAuthUserId: 'outsider' }), { code: 'NOT_AUTHORIZED' });
  await assert.rejects(x.coordinator.confirm({ ...input, idempotencyKey: 'different' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.deepEqual(x.snapshot(), before);
});
