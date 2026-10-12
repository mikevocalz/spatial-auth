# spatial-auth (Better Auth server plugin)

This package registers verified Meta/PICO/Snap identity sign-in and explicit account-linking endpoints for an application **already using Better Auth**. Better Auth remains the sole app user/session authority. Use the built-in Better Auth Google provider for Google ID tokens, including Google Android XR.

Entry points: `spatial-auth/server`, `spatial-auth/meta`, `spatial-auth/pico`, `spatial-auth/snap`, `spatial-auth/types`.

PICO does **not** have an npm-published package dependency at development time: the host PICO app supplies its existing `@expo-pico/account` module to `getPicoXRProof(picoAccount)`. Server-side PICO authorization-code verification must be supplied by the host and has no fallback to an unverified profile ID.

Normal linking to an already-authenticated Better Auth user is implemented. Merging two independent Better Auth users is **not** an automatic provider-link operation; see [the full account migration protocol](../../docs/ACCOUNT-LINKING-AND-MERGING.md). There is no generalized merge endpoint in this package yet.

Read the repository [README](../../README.md), [API reference](../../docs/API.md), [security requirements](../../docs/SECURITY.md) and [provider matrix](../../docs/PROVIDERS.md) before enabling providers.

**Status:** alpha. Not production-authenticated on all devices.
