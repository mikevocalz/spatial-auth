import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(new URL('..', import.meta.url).pathname);
const json = path => JSON.parse(readFileSync(join(root,path),'utf8'));
const server = json('packages/better-auth/package.json');
const native = json('packages/expo-spatial-auth/package.json');
assert.equal(server.name, 'spatial-auth');
assert.equal(native.name, 'expo-spatial-auth');
assert.equal(json('package.json').private, true);
for (const type of ['dependencies','devDependencies']) {
  assert.equal(server[type]?.['@expo-pico/account'], undefined,
    'PICO native SDK must remain host-provided and independently buildable');
}
const serverDir = join(root,'packages/better-auth');
for (const [name, entry] of Object.entries(server.exports)) {
  if (name === './package.json') continue;
  for (const file of Object.values(entry)) {
    assert.ok(existsSync(join(serverDir,file)), `Missing spatial-auth export ${name}: ${file}`);
  }
}
const nativeDir = join(root,'packages/expo-spatial-auth');
for (const [name, entry] of Object.entries(native.exports)) {
  if (name === './package.json') continue;
  for (const file of typeof entry === 'string'?[entry]:Object.values(entry)) {
    assert.ok(existsSync(join(nativeDir,file)), `Missing expo-spatial-auth export ${name}: ${file}`);
  }
}
const plugin=readFileSync(join(root,'packages/expo-spatial-auth/plugin/index.ts'),'utf8');
assert.match(plugin,/questImplementation/);
assert.match(plugin,/com\.meta\.horizon/);
assert.match(plugin,/mobileImplementation/);
assert.doesNotMatch(plugin,/picoImplementation/);
const serverCode=readFileSync(join(root,'packages/better-auth/src/server.ts'),'utf8');
assert.doesNotMatch(serverCode,/from ['"]expo-spatial-auth/);
assert.doesNotMatch(serverCode,/from ['"]@expo-pico\/account/);
console.log('Spatial Auth package boundaries verified (static checks only; real APK tests still required).');
