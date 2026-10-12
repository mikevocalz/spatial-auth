/** A provider subject is trustworthy only after the backend has verified a platform credential. */
export interface VerifiedXRIdentity {
  /** Immutable, platform-assigned subject from server-side validation, never from the client body. */
  subject: string;
  name?: string;
  image?: string | null;
}

export type XRProof =
  | { provider: 'pico'; authCode: string }
  | { provider: 'meta-horizon'; userId: string; nonce: string }
  | { provider: 'snap-specs'; ticket: string };

export interface XRVerification {
  /** Exchange and validate the PICO auth code with the official platform backend. */
  verifyPicoAuthCode?: (authCode: string) => Promise<VerifiedXRIdentity>;
  /** Verify Meta's one-use user-proof nonce server-to-server against the claimed user id. */
  /**
   * Verify a one-use, app-issued exchange ticket obtained from a trusted
   * Snap Cloud backend. Snap OS keeps its OIDC token out of Lens JS.
   */
  verifySnapSpecsTicket?: (ticket: string) => Promise<VerifiedXRIdentity>;
  verifyMetaUserProof?: (proof: { userId: string; nonce: string }) => Promise<VerifiedXRIdentity>;
}
