# spatial-auth (Better Auth server plugin)

This package registers verified Meta/PICO/Snap identity sign-in and explicit account-linking endpoints for an application **already using Better Auth**. Better Auth remains the sole app user/session authority. Use the built-in Better Auth Google provider for Google ID tokens, including Google Android XR.

Entry points: `spatial-auth/server`, `spatial-auth/meta`, `spatial-auth/pico`, `spatial-auth/snap`, `spatial-auth/types`.

PICO does **not** have an npm-published package dependency at development time: the host PICO app supplies its existing `@expo-pico/account` module to `getPicoXRProof(picoAccount)`. Server-side PICO authorization-code verification must be supplied by the host and has no fallback to an unverified profile ID.

Sign-in and linking use the race-recovery helpers and Better Auth transactions. Supply `verifyAccountBindingConstraints` to check the actual unique provider/account constraint, and apply the declared index through your reviewed host migration. Missing readiness checks disable these endpoints with 503. Linking requires an authoritative session less than five minutes old and honors stricter host policies. Merging two independent Better Auth users is **not** an automatic provider-link operation; see [the full account migration protocol](../../docs/ACCOUNT-LINKING-AND-MERGING.md). There is no generalized merge endpoint in this package yet.

Read the repository [README](../../README.md), [API reference](../../docs/API.md), [security requirements](../../docs/SECURITY.md) and [provider matrix](../../docs/PROVIDERS.md) before enabling providers.

**Status:** alpha. Not production-authenticated on all devices.

This integration is pinned to Better Auth and `@better-auth/core` 1.7.7. Upgrade them together after rerunning the handler and database tests. `npm test` runs unit tests and real Better Auth request-handler tests against disposable SQLite databases. Provider proofs are fixtures; production database, provider service, and device tests remain required.
