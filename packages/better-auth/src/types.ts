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
  /**
   * Inspect the host database's actual UNIQUE(providerId, accountId) constraint,
   * using its mapped table/column names. Return true only when it is enforced.
   * Called before each spatial identity request; absence or failure disables it.
   */
  verifyAccountBindingConstraints?: () => Promise<boolean>;
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
