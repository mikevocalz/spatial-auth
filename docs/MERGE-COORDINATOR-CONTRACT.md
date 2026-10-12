# Transactional merge coordinator alpha

`createMergeCoordinator` is a **server-only host integration contract** for two **existing** Better Auth users. It is not an endpoint or a complete migration service. The host must implement `withTransaction` and the same-transaction handlers, with deterministic row locks, unique provider mappings and FK-safe domain transfers.

**Security:** The public caller supplies only merge intent ID and idempotency key. `currentBetterAuthUserId` is the **server's authenticated Better Auth session**, never a client body claim. The stored intent is created after separate source-user proof, recent target reauthentication, explicit inventory preview and confirmation. Time checks are defense-in-depth; the host must bind the source proof to the source user's existing provider association and consume it once.

Transfers MUST preserve billing entitlements and tenant/child/admin permissions according to the host app's domain rules. `commitAndQueueSessionRevocation` queues a transactional outbox task; source sessions must be revoked, never silently accepted after consolidation. Account deletion, recovery and external side effects remain out of scope until migration policies and integration tests exist.

The included tests validate ordering and denial states, not a database rollback or a real user-data merge. This PR remains draft until Postgres/host integration, crash/replay tests, and QA/security sign-off.
