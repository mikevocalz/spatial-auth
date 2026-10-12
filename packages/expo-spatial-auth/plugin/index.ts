import { ConfigPlugin, withAppBuildGradle } from '@expo/config-plugins';

type SpatialAuthOptions = {
  metaHorizon?: boolean;
  googleAndroidXR?: boolean;
  googleFlavor?: string;
};

const MARKER = '// expo-spatial-auth: platform runtime';
const GOOGLE_COORDINATES = [
  'androidx.credentials:credentials:1.6.0',
  'androidx.credentials:credentials-play-services-auth:1.6.0',
  'com.google.android.libraries.identity.googleid:googleid:1.1.1',
];

/** Keep Meta SDK out of mobile/PICO and Google Play Services out of Quest/PICO. */
export const withSpatialAuth: ConfigPlugin<SpatialAuthOptions> = (config, options = {}) => {
  if (!options.metaHorizon && !options.googleAndroidXR) return config;
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
    if (mod.modResults.contents.includes(MARKER)) return mod;
    const questGradle = options.metaHorizon
      ? 'android { productFlavors { quest { minSdkVersion 34 } } }\n'
      : '';
    const metaDependencies = options.metaHorizon
      ? [
          '    questImplementation "com.meta.horizon.platform.sdk:core-kotlin:0.2.2"',
          '    questImplementation "com.meta.horizon.platform.sdk:users-kotlin:0.2.2"',
        ]
      : [];
    const googleDependencies = options.googleAndroidXR
      ? GOOGLE_COORDINATES.map(
          (coordinate) => '    ' + googleConfiguration + ' "' + coordinate + '"'
        )
      : [];
    mod.modResults.contents +=
      '\n' +
      MARKER +
      '\n' +
      questGradle +
      'dependencies {\n' +
      [...metaDependencies, ...googleDependencies].join('\n') +
      '\n}\n';
    return mod;
  });
};

export default withSpatialAuth;
