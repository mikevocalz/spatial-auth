/**
 * Google Android XR is Google authentication via the existing Better Auth
 * 'google' provider, not a new 'android-xr' identity namespace.
 * This helper never verifies JWTs in JS; the Better Auth backend must.
 */
export interface GoogleCredentialClient {
  getGoogleIdToken(webClientId: string, nonce: string): Promise<{ idToken: string }>;
}
export type GoogleIdentityEvidence = { provider: 'google'; idToken: string; nonce: string };
export async function obtainAndroidXRGoogleCredential(
  client: GoogleCredentialClient,
  opts: { webClientId: string; serverChallengeNonce: string }
): Promise<GoogleIdentityEvidence> {
  if (!opts.webClientId?.trim() || !opts.serverChallengeNonce?.trim() ||
      opts.serverChallengeNonce.length < 16) {
    throw new Error('Verified Google OAuth client ID and fresh server challenge are required');
  }
  const result = await client.getGoogleIdToken(opts.webClientId, opts.serverChallengeNonce);
  if (!result.idToken?.trim() || result.idToken.length > 20000) {
    throw new Error('Google Credential Manager returned no usable identity token');
  }
  return { provider: 'google', idToken: result.idToken, nonce: opts.serverChallengeNonce };
}
