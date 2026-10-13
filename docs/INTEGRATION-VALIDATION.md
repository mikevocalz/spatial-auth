# Combined draft validation

This integration snapshot combines PRs #5–#12 without merging or closing them. [INTEGRATION-SNAPSHOT.json](INTEGRATION-SNAPSHOT.json) records each exact source head and the common base.

## Reconciliation

Source, tests and provider documentation are retained from those heads. The overlapping `packages/better-auth/package.json` edits are combined field by field: all public exports remain available, both database test suites run, and Better Auth plus `@better-auth/core` stay pinned at 1.7.7. The lockfile is the reviewed #5 lockfile; other branches add no dependencies. The contributor guide corrects the device-tool source to `callstack/agent-device`.

The additional public-export tests resolve through this package's own export map. They catch a missing module export or a dropped version pin after branch integration. The boundary script from #12 checks generated entry points and package isolation.

Run from the repository root:

```sh
npm test
npm run build
npm run typecheck
npm run lint
node scripts/verify-package-boundaries.mjs
```

## Remaining release gates

- The host must apply its reviewed uniqueness migration, implement the actual database constraint check, and validate its database dialect and multi-process concurrency.
- Connected Accounts requires the new session-snapshot callback and session-bound transport adapters. Server-side last-sign-in-method protection and secure native session persistence remain host responsibilities.
- The merge coordinator requires verified dual ownership, host-domain policy and locking, actual Better Auth/session-cache fencing, and durable revocation workers. SQLite fixtures do not perform real user-data merges.
- Meta, PICO, Google and Snap require configured provider services and real device/runtime acceptance. This snapshot adds no provider endpoints or native storage replacement.

Keep this integration PR in draft. Roll back package changes together with their matching host callback contracts; disable spatial endpoints if the host prerequisites are unavailable. No production migration or account mutation is part of this validation.
