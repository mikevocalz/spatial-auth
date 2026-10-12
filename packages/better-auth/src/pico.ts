import { isAccountAvailable, sendAuthScopesRequest } from '@expo-pico/account';
import type { XRProof } from './types';

/**
 * PICO OS already provides the interactive identity UI.
 * Request an authorization code and send it ONLY to a trusted Better Auth
 * backend configured with verifyPicoAuthCode. Never treat userId as proof.
 */
export async function getPicoXRProof(
  scopes: string[] = []
): Promise<Extract<XRProof, { provider: 'pico' }>> {
  if (!isAccountAvailable()) {
    throw new Error('PICO Platform Service account is unavailable on this device/build');
  }
  const result = await sendAuthScopesRequest(scopes, 'auth-code');
  if (!result.authCode?.trim()) {
    throw new Error('PICO did not return an authorization code');
  }
  return { provider: 'pico', authCode: result.authCode };
}
