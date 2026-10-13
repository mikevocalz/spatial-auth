import { ConfigPlugin, withAppBuildGradle } from '@expo/config-plugins';

type SpatialAuthOptions = {
  metaHorizon?: boolean;
  googleAndroidXR?: boolean;
  googleFlavor?: string;
};

const MARKER = '// expo-spatial-auth: platform runtime';
const END_MARKER = '// expo-spatial-auth: end platform runtime';
const QUEST_GRADLE = 'android { productFlavors { quest { minSdkVersion 34 } } }';
const META_COORDINATES = [
  'com.meta.horizon.platform.sdk:core-kotlin:0.2.2',
  'com.meta.horizon.platform.sdk:users-kotlin:0.2.2',
];
const GOOGLE_COORDINATES = [
  'androidx.credentials:credentials:1.6.0',
  'androidx.credentials:credentials-play-services-auth:1.6.0',
  'com.google.android.libraries.identity.googleid:googleid:1.1.1',
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove only our exact generated stanza, including the original unclosed format. */
function removeGeneratedRuntime(contents: string): string {
  const coordinates = [...META_COORDINATES, ...GOOGLE_COORDINATES].map(escapeRegex).join('|');
  const stanza = new RegExp(
    '\\r?\\n' + escapeRegex(MARKER) + '\\r?\\n' +
    '(?:' + escapeRegex(QUEST_GRADLE) + '\\r?\\n)?' +
    'dependencies \\{\\r?\\n' +
    '(?:    (?:implementation|[A-Za-z][A-Za-z0-9]*Implementation) "(?:' + coordinates + ')"\\r?\\n)+' +
    '\\}\\r?\\n(?:' + escapeRegex(END_MARKER) + '\\r?\\n)?',
    'g'
  );
  const result = contents.replace(stanza, '');
  if (result.includes(MARKER) || result.includes(END_MARKER)) {
    throw new Error('Spatial Auth generated Gradle block was edited or is incomplete; reconcile it or run a clean Expo prebuild');
  }
  return result;
}

/** Keep Meta SDK out of mobile/PICO and Google Play Services out of Quest/PICO. */
export const withSpatialAuth: ConfigPlugin<SpatialAuthOptions> = (config, options = {}) => {
  const flavor = options.googleFlavor;
  if (flavor !== undefined && !/^[A-Za-z][A-Za-z0-9]*$/.test(flavor)) {
    throw new Error('Spatial Auth googleFlavor must be a valid Gradle flavor name');
  }
  const googleConfiguration = flavor
    ? flavor + 'Implementation'
    : options.metaHorizon
      ? 'mobileImplementation'
      : 'implementation';
  return withAppBuildGradle(config, (mod) => {
    const existing = mod.modResults.contents;
    const enabled = options.metaHorizon || options.googleAndroidXR;
    if (!enabled && !existing.includes(MARKER) && !existing.includes(END_MARKER)) return mod;
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Spatial Auth config plugin requires a Groovy app build.gradle');
    }
    const contents = removeGeneratedRuntime(existing);
    if (!enabled) {
      mod.modResults.contents = contents;
      return mod;
    }
    const questGradle = options.metaHorizon
      ? QUEST_GRADLE + '\n'
      : '';
    const metaDependencies = options.metaHorizon
      ? META_COORDINATES.map(coordinate => '    questImplementation "' + coordinate + '"')
      : [];
    const googleDependencies = options.googleAndroidXR
      ? GOOGLE_COORDINATES.map(
          (coordinate) => '    ' + googleConfiguration + ' "' + coordinate + '"'
        )
      : [];
    mod.modResults.contents =
      contents +
      '\n' +
      MARKER +
      '\n' +
      questGradle +
      'dependencies {\n' +
      [...metaDependencies, ...googleDependencies].join('\n') +
      '\n}\n' + END_MARKER + '\n';
    return mod;
  });
};

export default withSpatialAuth;
