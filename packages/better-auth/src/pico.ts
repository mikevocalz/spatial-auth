import type { XRProof } from './types';

/**
 * Runtime adapter contract for the existing @expo-pico/account package.
 * Inject rather than import it: Spatial Auth must build without the PICO SDK
 * and PICO must never depend on Meta/Google/Snap packages.
 */
export interface PicoAccountClient {
  isAccountAvailable(): boolean;
  sendAuthScopesRequest(
    scopes: string[],
    authType: 'auth-code'
  ): Promise<{ authCode?: string | null }>;
}

/**
 * Returns a code for the trusted host's PICO server-to-server verification.
 * A PICO OS user ID is not sufficient proof for Better Auth sign-in/linking.
 */
export async function getPicoXRProof(
  platform: PicoAccountClient,
  scopes: string[] = []
): Promise<Extract<XRProof, { provider: 'pico' }>> {
  if (!platform || !platform.isAccountAvailable()) {
    throw new Error('PICO Platform Service account is unavailable on this device/build');
  }
  const result = await platform.sendAuthScopesRequest(scopes, 'auth-code');
  if (!result.authCode?.trim()) {
    throw new Error('PICO did not return an authorization code');
  }
  return { provider: 'pico', authCode: result.authCode };
}
