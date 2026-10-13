import type { VerifiedXRIdentity, XRProof } from './types';

export interface MetaUserProof {
  /** App-scoped account ID returned by Meta Horizon Platform SDK. */
  userId: string;
  /** Fresh, single-use nonce from getUserProof(). */
  nonce: string;
}
export function getMetaXRProof({ userId, nonce }: MetaUserProof): Extract<XRProof, { provider: 'meta-horizon' }> {
  if (!userId?.trim() || !nonce?.trim()) throw new Error('Both a Meta user ID and user proof are required');
  return { provider: 'meta-horizon', userId, nonce };
}

export interface MetaVerifierConfig {
  appId: string;
  appSecret: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}
/** Server-only verifier. Do NOT import into a headset bundle. */
export function createMetaUserProofVerifier({
  appId, appSecret, fetcher = fetch, timeoutMs = 8000
}: MetaVerifierConfig): (proof: MetaUserProof) => Promise<VerifiedXRIdentity> {
  if (!appId?.trim() || !appSecret?.trim()) throw new Error('Meta app ID and server secret are required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('Invalid Meta verification timeout');
  }
  return async ({ userId, nonce }) => {
    if (!userId?.trim() || !nonce?.trim() || userId.length > 256 || nonce.length > 8192) {
      throw new Error('Meta user proof missing or invalid');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetcher('https://graph.oculus.com/user_nonce_validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-store',
        },
        body: new URLSearchParams({
          access_token: `OC|${appId}|${appSecret}`,
          user_id: userId,
          nonce
        }),
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'error'
      });
      if (!result.ok) throw new Error('Meta identity verification failed');
      const payload: unknown = await result.json();
      if (!payload || typeof payload !== 'object' || !('is_valid' in payload) ||
          (payload as { is_valid: unknown }).is_valid !== true) {
        throw new Error('Meta identity verification failed');
      }
      // Meta validates the given user_id/nonce pair for this app. Never derive
      // the subject from an unverified profile response or display name.
      return { subject: userId };
    } catch {
      // Fail closed and do not leak provider response bodies or app tokens.
      throw new Error('Meta identity verification failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
