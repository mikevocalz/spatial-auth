# Contributing to Spatial Auth

Welcome. Spatial Auth is a security-sensitive Better Auth and Expo Modules v2 library. Pull requests should describe what behavior changes, which provider/device versions were tested, what unverified claims remain and how to roll back.

## Development

Use Node 22+, npm workspaces. Install with `npm install`, build with `npm run build`, check types with `npm run typecheck`, and run Jest tests with `npm test`. Expo Kotlin compilation requires a separately configured consuming Expo Android example and device flavor. No successful unit-test run substitutes for actual developer-proof verification.

## PR checklist

- Identity code verifies proof server-side; no unverified ID fallback.
- New provider subject scope is documented and unique in Better Auth.
- Tests cover valid, expired, replayed, wrong app, conflicting account and cancellation.
- DB account migrations have preflight checks, idempotency and rollback.
- No server secret or raw provider token appears in client bundles, logs or fixtures.
- README and relevant docs updated with **implemented versus planned** status.
- Relevant maintainers (identity security, platform, database, privacy) review before merge.

Keep changes targeted. Never modify the PICO monorepo to implement unrelated Meta/Google/Snap features. Do not include generic AI setup/handoff documents or claim hardware testing you did not perform. See the engineering roster in `docs/IMPLEMENTATION-PLAN.md`.
