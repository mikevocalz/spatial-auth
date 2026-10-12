# Spatial identity DB invariants

The Better Auth `account` table MUST enforce a unique composite provider binding. The exact database and mapped schema must be inspected in the consuming app before migration.

```sql
-- PostgreSQL example ONLY: inspect Better Auth adapter mappings and existing duplicates first.
SELECT "providerId", "accountId", COUNT(*)
FROM account GROUP BY "providerId", "accountId" HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX CONCURRENTLY account_provider_subject_unique
ON account ("providerId", "accountId");
```

Perform `CREATE INDEX CONCURRENTLY` outside a transaction. Never auto-delete duplicates. Resolve ambiguous ownership with independent verified user control and a reviewed migration.

`resolveVerifiedAccount` and `linkVerifiedAccount` are backend helpers with explicit transactional store contracts and race-recovery tests. They **do not add** the database constraint; host adapters supply that migration and must use atomic provider account writes. Audit source ownership and a returning original error if no winning owner appears.

These helpers are staged for integration into the Better Auth plugin once adapters and schema constraints are verified. Provider email/name matching is never a substitute for a verified subject.
