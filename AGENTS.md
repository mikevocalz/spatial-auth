# Spatial Auth engineering rules

This repository is a standalone Better Auth identity system for spatial platforms. **The application MUST use Better Auth as its canonical user/session authority.** Device SDKs supply short-lived, server-verified identity evidence only.

## Required skills and specialists

Apply relevant available first-party / installed skills before coding, review, UX and release work. Maintain specialist ownership for identity security, Kotlin/Expo Modules v2, Meta Horizon, PICO PPS, Google Android XR, Snap Cloud, database migrations, privacy and XR accessibility.

Recommended skill sources to consult when available:

- `expo/skills` — Expo config plugins, Expo Modules v2, native dev clients and Android builds.
- `mattpocock/skills` — strict TypeScript, APIs, discrimination and type-safe contracts.
- `callstack/agent-device` — supported device interaction, test evidence and regression.
- `pbakaus/impeccable` — UX/design review for Settings and XR gaze/pinch/touch.
- `petergyang/no-ai-slop` — accurate, non-boilerplate README and docs.
- `coreyhaines31/marketingskills` — public SDK package positioning, not auth correctness.
- Existing Better Auth / platform / security skills configured in the development environment.

Use a documented fallback when a skill is unavailable; **never claim a skill or review was executed if it wasn't**. Avoid generic setup and handoff artifacts in the public release.

## Code and PR requirements

- Device user IDs or profiles alone are never accepted as proof. No placeholder server verifier may authenticate real users.
- Provider identity = verified `(providerId, accountId)` with database uniqueness and verified app/issuer scope.
- Linking an unclaimed provider to a current Better Auth user does **not** mean merging two existing user rows.
- Existing-user merges require dual verified ownership, recently authenticated target, user preview, consent and transactional host-domain migration with audit/recovery. Never combine memberships or purchases by default.
- Platform adapter SDKs stay isolated: no Meta/Google/Snap implementation inside `expo-pico`.
- Require unit tests for malformed/replayed proofs, 409 ownership conflicts, concurrency and fail-closed behavior.
- Only advertise a provider as live after actual verified hardware and server service tests; mocks prove contracts, not integration.
- All PRs must contain scope, tests, outstanding hardware/credential dependencies and rollout/rollback notes.
