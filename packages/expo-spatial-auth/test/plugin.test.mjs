import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const withSpatialAuth = require('../app.plugin.js');
const original = 'plugins { id "com.android.application" }\n\nandroid { namespace "example.host" }\n\ndependencies { implementation "example:host-library:1.0" }\n';

async function apply(contents, options = {}, language = 'groovy') {
  const config = withSpatialAuth({ name: 'fixture', slug: 'fixture' }, options);
  const mod = config.mods?.android?.appBuildGradle;
  if (!mod) return contents;
  const result = await mod({
    ...config,
    modResults: { contents, language },
    modRequest: { projectRoot: '/fixture', platformProjectRoot: '/fixture/android', platform: 'android', modName: 'appBuildGradle' },
  });
  return result.modResults.contents;
}

test('leaves an unconfigured host unchanged', async () => {
  assert.equal(await apply(original), original);
});

test('enables both providers in separate default configurations', async () => {
  const result = await apply(original, { metaHorizon: true, googleAndroidXR: true });
  assert.ok(result.startsWith(original));
  assert.match(result, /questImplementation "com\.meta\.horizon/);
  assert.match(result, /mobileImplementation "androidx\.credentials/);
  assert.doesNotMatch(result, /questImplementation "androidx/);
});

test('repeated configuration is byte-for-byte idempotent', async () => {
  const options = { metaHorizon: true, googleAndroidXR: true };
  const once = await apply(original, options);
  assert.equal(await apply(once, options), once);
});

test('changing the Google flavor replaces the prior configuration', async () => {
  const first = await apply(original, { googleAndroidXR: true, googleFlavor: 'mobile' });
  const result = await apply(first, { googleAndroidXR: true, googleFlavor: 'androidXR' });
  assert.match(result, /androidXRImplementation "androidx\.credentials/);
  assert.doesNotMatch(result, /mobileImplementation/);
  assert.equal((result.match(/androidx\.credentials:credentials:1\.6\.0/g) ?? []).length, 1);
});

test('disabling Meta removes its generated runtime and minSdk override', async () => {
  const first = await apply(original, { metaHorizon: true, googleAndroidXR: true });
  const result = await apply(first, { googleAndroidXR: true });
  assert.doesNotMatch(result, /com\.meta\.horizon|minSdkVersion 34|mobileImplementation/);
  assert.match(result, /implementation "androidx\.credentials/);
  assert.ok(result.startsWith(original));
});

test('disabling Google removes its generated runtime', async () => {
  const first = await apply(original, { metaHorizon: true, googleAndroidXR: true });
  const result = await apply(first, { metaHorizon: true });
  assert.doesNotMatch(result, /androidx\.credentials|googleid/);
  assert.match(result, /questImplementation/);
});

test('disabling both providers restores the original host byte-for-byte', async () => {
  const first = await apply(original, { metaHorizon: true, googleAndroidXR: true });
  assert.equal(await apply(first), original);
});

test('rejects invalid Gradle flavor names before interpolation', () => {
  for (const googleFlavor of ['mobile-debug', 'bad"; throw 1', '1invalid']) {
    assert.throws(() => withSpatialAuth({ name: 'fixture', slug: 'fixture' }, { googleAndroidXR: true, googleFlavor }), /valid Gradle flavor/);
  }
});

test('does not append Groovy syntax to Kotlin DSL', async () => {
  await assert.rejects(apply(original, { metaHorizon: true }, 'kotlin'), /Groovy/);
});

const legacy = '\n// expo-spatial-auth: platform runtime\n' +
  'android { productFlavors { quest { minSdkVersion 34 } } }\n' +
  'dependencies {\n' +
  '    questImplementation "com.meta.horizon.platform.sdk:core-kotlin:0.2.2"\n' +
  '    questImplementation "com.meta.horizon.platform.sdk:users-kotlin:0.2.2"\n' +
  '    mobileImplementation "androidx.credentials:credentials:1.6.0"\n' +
  '    mobileImplementation "androidx.credentials:credentials-play-services-auth:1.6.0"\n' +
  '    mobileImplementation "com.google.android.libraries.identity.googleid:googleid:1.1.1"\n' +
  '}\n';

test('migrates the exact old generated stanza and preserves later host additions', async () => {
  const hostAddition = '\n// Another plugin owns this\napply from: "custom.gradle"\n';
  const result = await apply(original + legacy + hostAddition, { googleAndroidXR: true, googleFlavor: 'androidXR' });
  assert.ok(result.startsWith(original + hostAddition));
  assert.doesNotMatch(result, /com\.meta\.horizon|mobileImplementation/);
  assert.match(result, /androidXRImplementation/);
  assert.match(result, /end platform runtime/);
});

test('removes a legacy CRLF stanza without altering host bytes', async () => {
  const host = original.replaceAll('\n', '\r\n');
  assert.equal(await apply(host + legacy.replaceAll('\n', '\r\n')), host);
});

test('refuses to erase hand-edited or incomplete generated blocks', async () => {
  for (const contents of [
    original + legacy.replace('dependencies {', 'dependencies {\n    implementation "host:owned:1.0"'),
    original + '\n// expo-spatial-auth: platform runtime\n',
    original + '\n// expo-spatial-auth: end platform runtime\n',
  ]) {
    await assert.rejects(apply(contents, { metaHorizon: true }), /edited or is incomplete/);
  }
});

test('can leave an unconfigured Kotlin host untouched', async () => {
  assert.equal(await apply(original, {}, 'kotlin'), original);
});

for (const options of [
  { metaHorizon: true },
  { googleAndroidXR: true },
  { googleAndroidXR: true, googleFlavor: 'androidXR' },
  { metaHorizon: true, googleAndroidXR: true, googleFlavor: 'androidXR' },
]) {
  test(`repeat and remove provider configuration ${JSON.stringify(options)}`, async () => {
    const first = await apply(original, options);
    assert.equal(await apply(first, options), first);
    assert.equal(await apply(first), original);
  });
}
