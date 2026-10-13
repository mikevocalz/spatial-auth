# Spatial identity database invariants

The Better Auth `account` table must enforce uniqueness across `(providerId, accountId)`. The plugin declares this compound index through Better Auth 1.7.7’s schema API. Declaration does not apply a migration or prove that an existing database has the index.

## Host readiness

Configure `verifyAccountBindingConstraints` as a server-only function that inspects the actual host database and returns true only when the complete, non-partial unique constraint exists. Use the host’s mapped account table and column names. An unconditional `return true` does not satisfy this contract.

Both spatial endpoints call this function before consuming provider proof. Missing checks, false results, thrown errors, and adapters without a declared transaction implementation return 503. Better Auth’s available schema check also runs, but its column checks do not establish compound uniqueness. The package creates no database connection or credentials for this check.

Inspect duplicates before applying the host migration. For example, with unmapped PostgreSQL names:

```sql
SELECT "providerId", "accountId", COUNT(*)
FROM account GROUP BY "providerId", "accountId" HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX CONCURRENTLY account_provider_subject_unique
ON account ("providerId", "accountId");
```

Run `CREATE INDEX CONCURRENTLY` outside a transaction. Never delete duplicate ownership rows automatically. Resolve ambiguous ownership through independent proof and a reviewed migration. The plugin does not run this SQL.

## Endpoint behavior

`/spatial-auth/sign-in` now calls `resolveVerifiedAccount`. New user and provider-account rows share a Better Auth transaction. A duplicate insert rolls back the losing user and resolves the winning canonical user. A rejected or altered account-create hook also rolls back provisioning; after-commit hooks do not run for that failed transaction.

`/spatial-auth/link` calls `linkVerifiedAccount`. Conflicting concurrent owners receive 409; repeat links to the same user are idempotent. It reads the authoritative session instead of accepting a cached session cookie, requires authentication within five minutes (or a shorter host policy), and rechecks after provider verification. It honors disabled account linking and the host user-validation hook. The validation source is `method: 'spatial-auth'` with the corresponding create-user, sign-in, or link-account action.

Better Auth remains the only user/session authority. Provider email/name matching never selects or merges an app user. No two-user merge is performed by these endpoints.

## Evidence and release gates

`npm test` includes real Better Auth request-handler tests backed by disposable SQLite databases. They cover competing sign-ins, competing links, canonical user preservation, mapped fields, index absence, unsupported transaction capabilities, hook rollback, session freshness/revocation, origin protection, and host policies. The concurrency tests synchronize the initial account reads, then use actual constrained writes and transactions.

These tests do not validate production PostgreSQL/MySQL isolation, a host’s constraint-check implementation, provider services, or headset hardware. Each host must run its database concurrency and migration tests before enabling an adapter. No live migration or account operation is part of this test suite.
