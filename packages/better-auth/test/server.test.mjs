import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { spatialAuth } from '../build/src/server.js';

const databases = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

async function setup({ verifyPicoAuthCode, databaseHooks, constraintCheck, ...overrides } = {}) {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  const options = {
    database: db,
    baseURL: 'http://localhost:3000',
    secret: 'local-integration-test-secret-at-least-32-characters',
    logger: { level: 'error' },
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true } },
    databaseHooks,
    plugins: [spatialAuth({
      verifyPicoAuthCode: verifyPicoAuthCode ?? (async code => ({ subject: code })),
      verifyAccountBindingConstraints: constraintCheck === undefined ? async () => {
        const table = overrides.account?.modelName ?? 'account';
        const fields = [overrides.account?.fields?.providerId ?? 'providerId', overrides.account?.fields?.accountId ?? 'accountId'];
        const indexes = db.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all();
        return indexes.some(index => index.unique && !index.partial &&
          JSON.stringify(db.prepare(`PRAGMA index_info('${index.name}')`).all().map(field => field.name)) ===
          JSON.stringify(fields));
      } : constraintCheck,
    })],
    ...overrides,
  };
  await (await getMigrations(options)).runMigrations();
  const auth = betterAuth(options);
  await (await auth.$context).checkSchema?.();
  const request = (path, body, cookie) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  return { db, auth, request };
}
const proof = { provider: 'pico', authCode: 'verified-pico-subject' };
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

async function member(request, name = 'member') {
  const response = await request('/sign-up/email', { name, email: `${name}@example.invalid`, password: 'test-password-not-a-real-account' });
  assert.equal(response.status, 200);
  return { cookie: cookies(response), ...(await response.json()) };
}

async function pauseEmptyAccountReads(auth) {
  const context = await auth.$context;
  const findMany = context.adapter.findMany.bind(context.adapter);
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  context.adapter.findMany = async options => {
    const result = await findMany(options);
    if (options.model === 'account' && result.length === 0 && reads < 2) {
      if (++reads === 2) release();
      await barrier;
    }
    return result;
  };
}

test('concurrent sign-ins resolve one canonical user without orphan users', async () => {
  const { db, auth, request } = await setup();
  await pauseEmptyAccountReads(auth);
  const responses = await Promise.all([request('/spatial-auth/sign-in', proof), request('/spatial-auth/sign-in', proof)]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const [first, second] = await Promise.all(responses.map(response => response.json()));
  assert.equal(first.user.id, second.user.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account').get().count, 1);
});

test('stale sessions cannot link, including when a fresh signed cookie cache exists', async () => {
  let verified = 0;
  const { db, request } = await setup({ verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; } });
  const current = await member(request);
  db.prepare('UPDATE session SET createdAt = ? WHERE userId = ?').run(Date.now() - 301_000, current.user.id);
  const response = await request('/spatial-auth/link', proof, current.cookie);
  assert.equal(response.status, 403);
  assert.equal(verified, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM account WHERE providerId = 'pico'").get().count, 0);
});

test('the migration creates a compound unique provider/account index', async () => {
  const { db } = await setup();
  const unique = db.prepare("PRAGMA index_list('account')").all().filter(index => index.unique);
  assert.ok(unique.some(index => {
    const fields = db.prepare(`PRAGMA index_info('${index.name}')`).all().map(field => field.name);
    return JSON.stringify(fields) === JSON.stringify(['providerId', 'accountId']);
  }));
});

test('two current users racing to link the same identity get one success and one conflict', async () => {
  const { db, auth, request } = await setup();
  const first = await member(request, 'first');
  const second = await member(request, 'second');
  await pauseEmptyAccountReads(auth);
  const responses = await Promise.all([
    request('/spatial-auth/link', proof, first.cookie),
    request('/spatial-auth/link', proof, second.cookie),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses[0].status === 200 ? first : second;
  const account = db.prepare("SELECT * FROM account WHERE providerId = 'pico'").get();
  assert.equal(account.userId, winner.user.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 2);
  const repeat = await request('/spatial-auth/link', proof, winner.cookie);
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), { linked: true, alreadyLinked: true });
  const signedIn = await request('/spatial-auth/sign-in', proof);
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).user.id, winner.user.id);
});

test('a rejected account create hook rolls back the new user and does not issue a session', async () => {
  const { db, request } = await setup({ databaseHooks: { account: { create: { before: async () => false } } } });
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
});

test('missing transaction support fails before consuming the provider proof', async () => {
  let verified = 0;
  const { db, auth, request } = await setup({ verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; } });
  const context = await auth.$context;
  context.adapter.options.adapterConfig.transaction = false;
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 503);
  assert.equal(verified, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
});

test('missing uniqueness migration fails closed, even if global schema validation was disabled', async () => {
  let verified = 0;
  const { db, request } = await setup({
    verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; },
    advanced: { database: { validateSchema: false } },
  });
  const index = db.prepare("PRAGMA index_list('account')").all().find(row => row.unique && row.origin === 'c');
  assert.ok(index);
  db.exec(`DROP INDEX "${index.name}"`);
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 503);
  assert.equal(verified, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
});

test('revoking a session while proof verification is pending prevents the link', async () => {
  let reachedProof;
  let releaseProof;
  const reached = new Promise(resolve => { reachedProof = resolve; });
  const released = new Promise(resolve => { releaseProof = resolve; });
  const { db, request } = await setup({ verifyPicoAuthCode: async () => {
    reachedProof();
    await released;
    return { subject: 'pico-user' };
  } });
  const current = await member(request);
  const pending = request('/spatial-auth/link', proof, current.cookie);
  await reached;
  db.prepare('DELETE FROM session WHERE userId = ?').run(current.user.id);
  releaseProof();
  const response = await pending;
  assert.equal(response.status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM account WHERE providerId = 'pico'").get().count, 0);
});

test('host account-linking policy is enforced before consuming proof', async () => {
  let verified = 0;
  const { request } = await setup({
    verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; },
    account: { accountLinking: { enabled: false } },
  });
  const current = await member(request);
  const response = await request('/spatial-auth/link', proof, current.cookie);
  assert.equal(response.status, 403);
  assert.equal(verified, 0);
});

test('host user provisioning policy can reject a spatial user without creating rows', async () => {
  const { db, request } = await setup({ user: { validateUserInfo: async ({ source }) => {
    assert.equal(source.method, 'spatial-auth');
    assert.equal(source.action, 'create-user');
    return { error: 'policy-denied' };
  } } });
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
});

test('a rejected session hook cannot issue an authenticated response', async () => {
  const { db, request } = await setup({ databaseHooks: { session: { create: { before: async () => false } } } });
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 500);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
  assert.equal(response.headers.getSetCookie().length, 0);
});

test('invalid provider output never reaches identity persistence', async () => {
  const { db, request } = await setup({ verifyPicoAuthCode: async () => ({ subject: 123 }) });
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
});

test('mapped account table and fields retain compound uniqueness and canonical identity', async () => {
  const { db, request } = await setup({ account: {
    modelName: 'provider_account',
    fields: { providerId: 'provider', accountId: 'subject', userId: 'owner' },
  } });
  const first = await request('/spatial-auth/sign-in', proof);
  const second = await request('/spatial-auth/sign-in', proof);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).user.id, (await second.json()).user.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM provider_account').get().count, 1);
});

test('missing host constraint verification fails before provider proof consumption', async () => {
  let verified = 0;
  const { request } = await setup({ constraintCheck: null,
    verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; },
  });
  assert.equal((await request('/spatial-auth/sign-in', proof)).status, 503);
  assert.equal(verified, 0);
});

test('constraint checker errors fail closed without reflecting database details', async () => {
  const { request } = await setup({ constraintCheck: async () => { throw new Error('private-database-password'); } });
  const response = await request('/spatial-auth/sign-in', proof);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private-database-password'));
});

test('disabling global freshness never disables the five-minute spatial linking limit', async () => {
  const { db, request } = await setup({ session: { freshAge: 0, cookieCache: { enabled: true } } });
  const current = await member(request);
  db.prepare('UPDATE session SET createdAt = ? WHERE userId = ?').run(Date.now() - 301_000, current.user.id);
  assert.equal((await request('/spatial-auth/link', proof, current.cookie)).status, 403);
});

test('a stricter host freshness policy is retained', async () => {
  const { db, request } = await setup({ session: { freshAge: 1 } });
  const current = await member(request);
  db.prepare('UPDATE session SET createdAt = ? WHERE userId = ?').run(Date.now() - 2_000, current.user.id);
  assert.equal((await request('/spatial-auth/link', proof, current.cookie)).status, 403);
});

test('host validation can deny a provider link without modifying accounts', async () => {
  const { db, request } = await setup({ user: { validateUserInfo: async ({ source }) => {
    if (source.action === 'link-account') return { error: 'blocked-link' };
  } } });
  const current = await member(request);
  assert.equal((await request('/spatial-auth/link', proof, current.cookie)).status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM account WHERE providerId = 'pico'").get().count, 0);
});

test('returning sign-ins still pass the host user policy', async () => {
  let rejectReturning = false;
  const { db, request } = await setup({ user: { validateUserInfo: async ({ source }) => {
    if (rejectReturning && source.action === 'sign-in') return { error: 'blocked-sign-in' };
  } } });
  assert.equal((await request('/spatial-auth/sign-in', proof)).status, 200);
  rejectReturning = true;
  assert.equal((await request('/spatial-auth/sign-in', proof)).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 1);
});

test('a foreign browser origin cannot invoke the spatial sign-in endpoint', async () => {
  let verified = 0;
  const { auth } = await setup({ verifyPicoAuthCode: async () => { verified++; return { subject: 'pico-user' }; } });
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/spatial-auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify(proof),
  }));
  assert.equal(response.status, 403);
  assert.equal(verified, 0);
});

test('native sign-in without browser origin headers remains supported', async () => {
  const { auth } = await setup();
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/spatial-auth/sign-in', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(proof),
  }));
  assert.equal(response.status, 200);
});

test('a host hook cannot redirect the verified provider binding to another subject', async () => {
  let userAfterCommit = 0;
  const { db, request } = await setup({ databaseHooks: {
    user: { create: { after: async () => { userAfterCommit++; } } },
    account: { create: { before: async () => ({ data: { accountId: 'different-subject' } }) } },
  } });
  assert.equal((await request('/spatial-auth/sign-in', proof)).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account').get().count, 0);
  assert.equal(userAfterCommit, 0);
});

test('a foreign browser origin cannot link using a valid authenticated cookie', async () => {
  let verified = 0;
  const { auth, db, request } = await setup({ verifyPicoAuthCode: async () => {
    verified++;
    return { subject: 'pico-user' };
  } });
  const current = await member(request);
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/spatial-auth/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example', cookie: current.cookie },
    body: JSON.stringify(proof),
  }));
  assert.equal(response.status, 403);
  assert.equal(verified, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM account WHERE providerId = 'pico'").get().count, 0);
});

test('link freshness accepts one millisecond before five minutes and rejects the exact boundary', async t => {
  let verified = 0;
  const { db, request } = await setup({ verifyPicoAuthCode: async () => {
    verified++;
    return { subject: 'pico-user' };
  } });
  const current = await member(request);
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  db.prepare('UPDATE session SET createdAt = ? WHERE userId = ?').run(now - 299_999, current.user.id);
  assert.equal((await request('/spatial-auth/link', proof, current.cookie)).status, 200);
  t.mock.timers.tick(1);
  assert.equal((await request('/spatial-auth/link', proof, current.cookie)).status, 403);
  assert.equal(verified, 1);
});
