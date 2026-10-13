/**
 * Headless server-side coordinator for merging TWO EXISTING Better Auth users.
 * The consuming app implements DB transaction, proof validation, domain moves,
 * billing/tenant exclusions and audit. No endpoint is registered by this module.
 *
 * Client provides only intentId/idempotencyKey. Everything else is loaded
 * from server-owned storage inside the transaction.
 */
export type MergeState = 'confirmed' | 'committed';
export interface StoredMergeIntent {
  id: string;
  targetUserId: string;
  sourceUserId: string;
  state: MergeState;
  expiresAt: number;
  targetReauthenticatedAt: number;
  sourceProofVerifiedAt: number;
  confirmedAt: number;
  idempotencyKey: string;
}
export class MergeRejected extends Error {
  constructor(public readonly code:
    'NOT_FOUND'|'EXPIRED'|'NOT_AUTHORIZED'|'PROOF_STALE'|'NOT_CONFIRMED'|'SAME_USER'|'IDEMPOTENCY_CONFLICT') {
    super(code);
    this.name = 'MergeRejected';
  }
}
/** Host-owned operations MUST share one atomic transaction / equivalent. */
export interface MergeTransaction {
  getIntentForUpdate(intentId: string): Promise<StoredMergeIntent | null>;
  /** Must check app-domain policies including tenant/child/billing/roles. */
  assertEligible(intent: StoredMergeIntent): Promise<void>;
  /** Must be transactional and idempotent. */
  transferAllowedDomainRecords(intent: StoredMergeIntent): Promise<void>;
  /** Reassociate provider accounts under uniqueness constraints. */
  transferVerifiedProviderBindings(intent: StoredMergeIntent): Promise<void>;
  /** Atomically fence source authentication, commit, and queue outbox revocation; no network IO. */
  commitAndQueueSessionRevocation(intent: StoredMergeIntent): Promise<void>;
}
export interface MergeStore {
  withTransaction<T>(fn: (tx: MergeTransaction) => Promise<T>): Promise<T>;
}
export function createMergeCoordinator(
  store: MergeStore,
  options: { now?: () => number; maxProofAgeMs?: number; maxTargetAuthAgeMs?: number } = {}
) {
  const now=options.now??Date.now;
  const maxProofAgeMs=options.maxProofAgeMs??120000;
  const maxTargetAuthAgeMs=options.maxTargetAuthAgeMs??300000;
  if(!Number.isSafeInteger(maxProofAgeMs)||!Number.isSafeInteger(maxTargetAuthAgeMs)||
     maxProofAgeMs<1000||maxTargetAuthAgeMs<1000) throw new Error('Invalid merge reauthentication policy');
  return {
    /**
     * Must be called on the server with the CURRENT Better Auth session's
     * user id, never a client claim. A confirmed intent was persisted only
     * after the host verified both accounts and showed a conflict preview.
     */
    async confirm(input: {intentId:string;idempotencyKey:string;currentBetterAuthUserId:string}) {
      if(!input.intentId?.trim()||!input.idempotencyKey?.trim()||
         !input.currentBetterAuthUserId?.trim()) throw new MergeRejected('NOT_AUTHORIZED');
      return store.withTransaction(async tx=>{
        const intent=await tx.getIntentForUpdate(input.intentId);
        if(!intent) throw new MergeRejected('NOT_FOUND');
        if(intent.targetUserId!==input.currentBetterAuthUserId) throw new MergeRejected('NOT_AUTHORIZED');
        if(intent.sourceUserId===intent.targetUserId) throw new MergeRejected('SAME_USER');
        if(intent.idempotencyKey!==input.idempotencyKey) throw new MergeRejected('IDEMPOTENCY_CONFLICT');
        if(intent.state==='committed') return {status:'already-committed' as const,targetUserId:intent.targetUserId};
        const timestamp=now();
        if(!Number.isFinite(timestamp)) throw new MergeRejected('PROOF_STALE');
        if(!Number.isFinite(intent.expiresAt)||intent.expiresAt<=timestamp) throw new MergeRejected('EXPIRED');
        if(intent.state!=='confirmed'||!Number.isFinite(intent.confirmedAt)||
           intent.confirmedAt>timestamp) throw new MergeRejected('NOT_CONFIRMED');
        if(!Number.isFinite(intent.sourceProofVerifiedAt)||!Number.isFinite(intent.targetReauthenticatedAt)||
           intent.sourceProofVerifiedAt>timestamp||intent.sourceProofVerifiedAt<timestamp-maxProofAgeMs ||
           intent.targetReauthenticatedAt>timestamp||
           intent.targetReauthenticatedAt<timestamp-maxTargetAuthAgeMs) {
          throw new MergeRejected('PROOF_STALE');
        }
        await tx.assertEligible(intent);
        await tx.transferAllowedDomainRecords(intent);
        await tx.transferVerifiedProviderBindings(intent);
        await tx.commitAndQueueSessionRevocation(intent);
        return {status:'committed' as const,targetUserId:intent.targetUserId};
      });
    }
  };
}
