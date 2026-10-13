import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Resolve through this package's export map, not an adjacent workspace checkout.
const require = createRequire(new URL('../package.json', import.meta.url));
const expected = {
  'server': ['spatialAuth'],
  'meta': ['createMetaUserProofVerifier'],
  'pico': ['getPicoXRProof'],
  'pico-server': ['createPicoServerVerifier'],
  'google': ['obtainAndroidXRGoogleCredential'],
  'snap': ['getSnapSpecsProof'],
  'snap-ticket': ['createSnapHandoffVerifier'],
  'identity-binding': ['resolveVerifiedAccount', 'linkVerifiedAccount'],
  'merge': ['createMergeCoordinator'],
  'connected-accounts': ['createConnectedAccountsController', 'getConnectedAccountRows'],
};
for (const [entry, names] of Object.entries(expected)) {
  test(`the combined package exports ${entry}`, () => {
    const module = require(`spatial-auth/${entry}`);
    for (const name of names) assert.equal(typeof module[name], 'function', `${entry}.${name}`);
  });
}

test('Better Auth and core remain pinned to the audited API version', () => {
  const pkg = require('spatial-auth/package.json');
  assert.equal(pkg.peerDependencies['better-auth'], '1.7.7');
  assert.equal(pkg.dependencies['@better-auth/core'], '1.7.7');
});
