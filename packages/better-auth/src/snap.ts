import type { XRProof } from './types';

/**
 * Snap Specs does NOT expose the wearer OIDC token to Lens JavaScript.
 * A trusted companion service can issue a one-time ticket after verifying
 * the authenticated user via Snap Cloud / Mobile Kit.
 * Never use display names or a client-supplied Snapchat UID as identity.
 */
export function getSnapSpecsProof(ticket: string): Extract<XRProof, { provider: 'snap-specs' }> {
  if (!ticket || ticket.trim().length < 24)
    throw new Error('A one-use server-issued handoff ticket is required');
  return { provider: 'snap-specs', ticket };
}
