export type SpatialPlatform = 'meta-horizon' | 'pico' | 'android' | 'unknown';
export const getSpatialPlatform = (): SpatialPlatform => 'unknown';
export const getMetaUserProfile = async (): Promise<never> => {
  throw new Error('Meta Horizon platform identity requires the native Quest app');
};
export const getMetaUserProof = getMetaUserProfile;
export const getGoogleIdToken = async (_webClientId: string, _nonce: string): Promise<never> => {
  void _webClientId;
  void _nonce;
  throw new Error('Use Better Auth Google OAuth on web');
};
