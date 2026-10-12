import type { VerifiedXRIdentity, XRProof } from './types';

export interface MetaUserProof {
  /** App-scoped account ID from the Meta Horizon Platform SDK. */
  userId: string;
  /** One-time proof returned by Meta's getUserProof() API. */
  nonce: string;
}

export function getMetaXRProof({
  userId,
  nonce,
}: MetaUserProof): Extract<XRProof, { provider: 'meta-horizon' }> {
  if (!userId?.trim() || !nonce?.trim())
    throw new Error('Both a Meta user ID and user proof are required');
  return { provider: 'meta-horizon', userId, nonce };
}

/**
 * Backend-only Meta verifier. Uses the official one-use nonce endpoint.
 * Pass Meta App ID and App Secret from server-side environment variables only.
 * Never import this verifier into the headset/client bundle.
 */
export function createMetaUserProofVerifier(options: {
  appId: string;
  appSecret: string;
  fetcher?: typeof fetch;
}): (proof: MetaUserProof) => Promise<VerifiedXRIdentity> {
  if (!options.appId || !options.appSecret)
    throw new Error('Meta platform credentials are required');
  const fetcher = options.fetcher || fetch;
  return async ({ userId, nonce }) => {
    if (!userId?.trim() || !nonce?.trim()) throw new Error('Meta proof missing');
    const response = await fetcher('https://graph.oculus.com/user_nonce_validate', {
      method: 'POST',
      body: new URLSearchParams({
        access_token: `OC|${options.appId}|${options.appSecret}`,
        nonce,
        user_id: userId,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok) throw new Error('Meta user verification failed');
    const data = (await response.json()) as { is_valid?: boolean };
    if (data.is_valid !== true) throw new Error('Meta user verification failed');
    return { subject: userId };
  };
}
