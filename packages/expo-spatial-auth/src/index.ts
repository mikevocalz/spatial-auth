import { requireOptionalNativeModule } from 'expo-modules-core';

export type SpatialPlatform = 'meta-horizon' | 'pico' | 'android' | 'unknown';
export interface MetaNativeUser {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
}
export interface MetaNativeProof extends MetaNativeUser {
  nonce: string;
}
export interface GoogleNativeCredential {
  idToken: string;
}

interface NativeSpatialAuth {
  getPlatform(): SpatialPlatform;
  getMetaUserProfile(): Promise<MetaNativeUser>;
  getMetaUserProof(): Promise<MetaNativeProof>;
  getGoogleIdToken(webClientId: string, nonce: string): Promise<GoogleNativeCredential>;
}

function requireModule(): NativeSpatialAuth {
  const native = requireOptionalNativeModule<NativeSpatialAuth>('ExpoSpatialAuth');
  if (!native)
    throw new Error('ExpoSpatialAuth native module not present; rebuild your development client');
  return native;
}

export function getSpatialPlatform(): SpatialPlatform {
  return (
    requireOptionalNativeModule<NativeSpatialAuth>('ExpoSpatialAuth')?.getPlatform() ?? 'unknown'
  );
}

export function getMetaUserProfile(): Promise<MetaNativeUser> {
  return requireModule().getMetaUserProfile();
}

export function getMetaUserProof(): Promise<MetaNativeProof> {
  return requireModule().getMetaUserProof();
}

/**
 * On Android XR use Credential Manager to get a Google ID token.
 * Send ONLY to Better Auth's Google provider with the same nonce.
 * Do not interpret this as device-owner proof; users choose their Google account.
 */
export function getGoogleIdToken(
  webClientId: string,
  nonce: string
): Promise<GoogleNativeCredential> {
  if (!webClientId?.trim() || !nonce?.trim()) {
    throw new Error('Google web client ID and nonce are required');
  }
  return requireModule().getGoogleIdToken(webClientId, nonce);
}
