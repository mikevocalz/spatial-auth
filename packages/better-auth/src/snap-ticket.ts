import type { VerifiedXRIdentity } from './types';

/**
 * Only a trusted Snap Cloud back end may issue/consume these tickets.
 * A Lens JavaScript string or claimed Snap user ID is never authoritative.
 */
export interface ConsumedSnapHandoff {
  subject: string;
  issuer: string;
  projectId: string;
  audience: string;
  expiresAt: number;
  issuedAt: number;
  /** Atomic consume succeeded, enforced by trusted backing service. */
  consumed: true;
}
export interface SnapHandoffProvider {
  /** Verify issuer/signature and atomically consume this ticket exactly once. */
  consumeAndVerify(ticket: string): Promise<ConsumedSnapHandoff | null>;
}
export function createSnapHandoffVerifier(opts: {
  issuer: string;
  projectId: string;
  audience: string;
  provider: SnapHandoffProvider;
  now?: () => number;
  maximumLifetimeMs?: number;
}): (ticket: string) => Promise<VerifiedXRIdentity> {
  const { issuer, projectId, audience, provider, now = Date.now, maximumLifetimeMs = 60000 } = opts;
  if (!issuer?.trim() || !projectId?.trim() || !audience?.trim() ||
      !provider?.consumeAndVerify || maximumLifetimeMs < 1000 ||
      maximumLifetimeMs > 300000) throw new Error('Snap handoff verifier is not configured');
  return async (ticket: string) => {
    if (typeof ticket !== 'string' || ticket.trim().length < 24 || ticket.length > 8192) {
      throw new Error('Snap handoff identity rejected');
    }
    try {
      const claimed = await provider.consumeAndVerify(ticket);
      const timestamp = now();
      if (!claimed || claimed.consumed !== true ||
          claimed.issuer !== issuer || claimed.projectId !== projectId ||
          claimed.audience !== audience || !claimed.subject?.trim() ||
          claimed.subject.length > 256 ||
          !Number.isFinite(claimed.issuedAt) || !Number.isFinite(claimed.expiresAt) ||
          claimed.issuedAt > timestamp || claimed.expiresAt <= timestamp ||
          claimed.expiresAt - claimed.issuedAt > maximumLifetimeMs) {
        throw new Error('Invalid Snap handoff');
      }
      return { subject: claimed.subject };
    } catch {
      throw new Error('Snap handoff identity rejected');
    }
  };
}
