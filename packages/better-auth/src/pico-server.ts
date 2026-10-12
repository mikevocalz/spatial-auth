import type { VerifiedXRIdentity } from './types';

export type AttestedPicoIdentity = {
  openUid: string;
  appId: string;
  /** Server-attested expiration, not any value copied from client body. */
  expiresAt: number;
  /** True only if the backend has consumed this authorization code once. */
  codeConsumed: true;
  displayName?: string;
};
export type PicoServerCodeExchange = (input: {
  authCode: string;
  expectedAppId: string;
}) => Promise<AttestedPicoIdentity>;

/**
 * Makes an app-provided, developer-approved PICO S2S exchange usable as a
 * Spatial Auth verifier. This does not invent a token URL or accept openUid
 * from the device. The host must make consumption atomic and one-time.
 */
export function createPicoServerVerifier(options: {
  expectedAppId: string;
  exchangeAndConsume: PicoServerCodeExchange;
  now?: () => number;
}): (authCode: string) => Promise<VerifiedXRIdentity> {
  const { expectedAppId, exchangeAndConsume, now = Date.now } = options;
  if (!expectedAppId?.trim() || !exchangeAndConsume) throw new Error('PICO server verification is not configured');
  return async (authCode: string) => {
    if (!authCode?.trim() || authCode.length > 8192) throw new Error('Invalid PICO authorization code');
    try {
      const result = await exchangeAndConsume({ authCode, expectedAppId });
      if (!result || result.appId !== expectedAppId ||
          !result.openUid?.trim() || result.openUid.length > 256 ||
          result.codeConsumed !== true || !Number.isFinite(result.expiresAt) ||
          result.expiresAt <= now()) {
        throw new Error('PICO identity proof rejected');
      }
      return { subject: result.openUid, name: result.displayName };
    } catch {
      throw new Error('PICO identity proof rejected');
    }
  };
}
