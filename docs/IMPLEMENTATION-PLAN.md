# Implementation plan, engineering roster and release roadmap

**Mission:** ship a production-quality open-source spatial identity layer for applications already using Better Auth. Users can sign in on Meta Quest 3, PICO OS and Google Android XR, and explicitly link those provider identities to the same Better Auth application user. Snap Specs is a separate Snap Cloud adapter. Never create a second application-user system.

## 1. Non-negotiable acceptance criteria

- [ ] A person with a pre-existing Better Auth user and content can link a verified Quest identity without a new application user.
- [ ] The same person can later link a verified PICO identity from Account Settings; app progress, permissions and user ID remain unchanged.
- [ ] A Quest-first Better Auth user can link Google, and Google sign-in returns the **same** Better Auth user ID on web or Android XR.
- [ ] Two pre-existing Better Auth users must present an explicit, independently verified merge review, not an implicit merge.
- [ ] An attempted link to an already-owned provider returns 409, retains both app users, and offers a secure merge choice where implemented.
- [ ] A finished merge transfers only eligible host-app records in a transaction, leaves purchase/role restrictions intact, revokes source sessions and has audit/recovery evidence.
- [ ] PICO package and its existing SDK code remain in `mikevocalz/expo-pico`. Spatial Auth is independently versioned, tested, built and published.
- [ ] No SDK dependency from Meta/Google/Snap leaks into a PICO-only build; no real-world provider verification claims from mocked tests.

## 2. Proposed senior engineering roster

These are **roles and review responsibilities**, not claims that named people were hired or assigned.

| Role | Required expertise | Ownership / approval gate |
| --- | --- | --- |
| Principal identity/security engineer | OIDC/OAuth, Better Auth plugins, replay/fraud, key rotation | Identity protocol, verification and auth abuse model |
| Staff TypeScript/Better Auth engineer | Server plugin types, session adapters, DB transactions | Endpoints, provider mapping, session lifecycle |
| Staff Kotlin/Expo Modules v2 engineer | Expo modules, coroutine APIs, Android Gradle flavor packaging | Native bridge, build isolation, hardware smoke tests |
| Meta Horizon SDK specialist | Quest 3, Meta user proof, entitlement/DUC | Meta app-scoped verification and real-device sign-off |
| PICO PPS platform engineer | PICO OS5/OS6, public SDK, server code exchange | Official PICO identity verifier and SDK compatibility |
| Android XR / Google identity specialist | Credential Manager, OIDC nonce, Play Services | Android XR native authentication, client ID validation |
| Snap Lens/Snap Cloud engineer | Lens Studio, Supabase auth, Snap OIDC project scoping | Secure one-use Snap handoff service |
| Staff Postgres/data migration engineer | Better Auth schemas, unique indexes, transactions/outbox | Conflict-safe linking and two-account merge operations |
| Product security / privacy engineer | Consent, account recovery, minor accounts, data lifecycle | UX threat review, privacy gate, deletion and audit |
| Senior cross-platform product designer | XR gaze/pinch/touch, account settings, accessibility | Platform-consistent UI, 409 and merge preview |
| QA automation & release engineer | Android flavors, real headsets, CI release provenance | Device matrix, adversarial tests, signed artifact gates |

## 3. Relevant required skills / working agreements

Use applicable repository and platform skills during every implementation, review, docs and PR iteration: Expo skills, Matt Pocock TypeScript skills, proven native Android/React Native guidance, security review, repo cleanup and documentation quality. Use `pbakaus/impeccable` for UI review, `petergyang/no-ai-slop` for docs, `coreyhaines31/marketingskills` for public SDK positioning, and `Argent/agent-device` for supported device automation. Spatial Auth must never import a user's other application UI package just to share visual styles. Use the host app's existing semantic/UI components.

No raw web identity form inside an XR panel when official platform UI exists. No simultaneous redesign of all provider adapters in one unreviewable mega-diff. Prefer small, focused PRs, a test per security fix and mandatory reviewing.

## 4. Workstreams and implementable PR decomposition

### PR A — Repository independence (blocking)
**Owner:** platform infra + maintainer.  
Move reusable code from old `expo-pico` PR into `spatial-auth`. Separate Better Auth server, Expo Modules v2 Android adapter, PICO interface and Snap contract. Rename README, set package exports, types, workspace, license, CI, SDK matrices, test harness. Open the new PR before closing the old one. Preserve source provenance, and do not merge old mixed-platform changes into PICO's main branch.

Done when `expo-pico` main remains unchanged and the new repository has reproducible build, tests and package artifacts.

### PR B — Better Auth server plugin hardening (blocking)
**Owner:** identity engineer + DB engineer.  
Define full verified-proof contract, issuer/app namespace, strict schemas, rate limiting and audit events. Test atomic user+provider account creation under concurrency. Verify Better Auth version API correctness, adapter hooks and session persistence across web and Expo. Unify error codes. Protect link with recent-session checks; no implicit email linking.

Done when valid provider proof creates/looks up exactly one Better Auth user and duplicate mapping races are resolved safely.

### PR C — Meta Horizon Quest 3 production path
**Owner:** Meta specialist + Kotlin engineer.  
Implement SDK initialization and nullable/signed-out states. Retrieve user and one-use proof on Quest 3 with the Horizon SDK, validate using Meta service on the host backend, handle replay/timeout/errors, ensure permissions and developer setup. Test Quest 3/3S and simulator differences, real-device account A/B and sign-out.

Done when one physical headset and a second Meta test identity complete successful and adversarial E2E validation.

### PR D — PICO OS adapter with no PICO repo duplication
**Owner:** PICO engineer + identity engineer.  
Consume installed `@expo-pico/account` and its `sendAuthScopesRequest([], 'auth-code')`. Implement the official, audited server verifier for the configured PPS SDK and developer account. Test app ID scopes, code expiry/replay, OS5/OS6 behavior, login and logout, dependency isolation.

Done when production-mode code exchange is verified from a physical PICO headset, not a mock.

### PR E — Google Android XR / Google account linking
**Owner:** Android XR + Better Auth engineer.  
Credential Manager native UI, Google ID token with a fresh nonce, audience/issuer/signature validation, standard Better Auth Google social identity. Prefer existing OAuth/linkSocial flows when possible; ensure Google linking from an XR-created user does not create a new app identity. Test native and web return same app user.

Done when linked users access identical data from XR and web, with verified nonce rejection.

### PR F — Account Settings / connected providers UX
**Owner:** cross-platform UX designer + accessibility engineer.  
Connected Accounts list using Better Auth `listAccounts`; stable rows, connect/disconnect, supported device availability, confirmation, blocked last-method removal, canceled auth, session transfer, QR/mobile handoff only when needed. Produce XR layout tests for gaze/pinch, desktop responsive, mobile/tablet.

Done when a user can see and understand which sign-in methods lead to their app profile, with safe conflict messaging.

### PR G — Two-user Better Auth account merge coordinator (high risk; separate approval)
**Owner:** identity/security + DB/data migration + host app domain owners.  
Independent recent reauth for A and B, redacted domain inventory, explicit target selection, preview, policy checks, short TTL merge intent, idempotency key, transactional transfer, provider row reassociation, source session revocation, outbox finalization, audit and restore drills. The library supplies intent interfaces; the host application supplies concrete domain transfer handlers. Never expose "Merge" until all required host handlers exist.

Done when crash/fault injection proves no partial domain transfers or unauthorized account ownership changes. Include privacy and billing review.

### PR H — Snap Specs trusted handoff (provider gated)
**Owner:** Snap Cloud engineer + identity engineer.  
Confirm alpha access, develop trusted Snap Cloud edge/service handoff from authenticated wearer session, mint/consume one-time ticket bound to project/user/app client, verify on Better Auth backend. Device test on Specs. Keep Snap SDK out of Expo Android.

Done when real wearer A/B and replay attack tests pass with approved project credentials.

### PR I — Release engineering and publication
**Owner:** QA/release + security.  
Lock npm/Gradle dependencies; package API checks; signed provenance; security scan; docs drift checks; device matrix; versioned changelog, migration notes and rollback. Release disabled adapters as feature-gated, not pseudo-available. Publish only packages that pass their respective hardware/backend gates.

## 5. Milestone matrix

| Milestone | Required content | Ship decision |
| --- | --- | --- |
| M0: Repo foundations | source extraction, docs, CI, TS tests | Dev-only |
| M1: Secure sign-in | DB uniqueness, Meta and PICO real server proofs | Limited internal alpha |
| M2: Cross-device linking | Settings, Google ID, sessions and data continuity | Public beta with explicit device support |
| M3: Safe preexisting-user merge | Dual auth, domain transactions, consent UI, audit | Separate feature rollout |
| M4: Additional platforms | Android XR hardware, Snap approved flow | Enable only verified adapters |
| M5: General availability | Security/device approvals, monitoring, releases | Production |

Do not block stable Meta/PICO linking on unapproved Snap APIs, and do not ship unsafe generic merges to meet an arbitrary milestone.

## 6. Engineering policy

- **Proof first:** no identity write based solely on a client claim.
- **Test evidence:** every PR includes before/after flows, reproduction, unit/device test output, and database assertion for auth changes.
- **Version discipline:** use the latest **compatible** package versions for Expo SDK, Kotlin metadata, Gradle and provider SDK; pin and document why a newer version is blocked.
- **Review roster:** minimum identity/security + platform owner for proof changes, database engineer for account migrations, privacy/billing owner for entitlements, product/UX owner for merge copy.
- **No AI-generated filler:** README and docs describe actual code or explicitly marked future functionality. No setup/handoff clutter in published API docs.
- **Release integrity:** conventional commits, small PRs, no forced pushes over collaborative work, protected branches and approvals, semantic versions and changelog entries.
- **Privacy:** disable user analytics that might log tokens, raw provider IDs or sensitive profile data; review protected records and consent.

## 7. Outstanding blockers and external decisions

1. Host app must identify its actual Better Auth DB adapter and deployment, schema naming, session transport and organization/role system.
2. Meta developer setup, proof verification credentials and device/simulator testing access.
3. Official PICO server code validation for the SDK and app account used by the host.
4. Which app-owned records can legally transfer from B to A? Specify every table/tenant, entitlements, paid objects and moderation state.
5. Host app needs UX copy and consent policy for cross-user merges and account deletion.
6. Google Android XR OS/device, Google OAuth project and audience configuration.
7. Snap Cloud alpha/project and identity handoff API limitations.
8. CI must prove real Android Gradle compile and no forbidden native dependencies in each flavor.

## 8. Release rubric

An adapter is **implemented** only if production proof validation and at least one actual device end-to-end test pass. A **typed contract** or passing Jest mock is not a completed provider. Account linking is complete when an existing Better Auth user successfully returns across two devices with unchanged `user.id`. Account merging is complete only when two preexisting users' eligible app data and sessions survive a verified transactional consolidation, with no privilege or purchase leakage.

See [Architecture](ARCHITECTURE.md), [Provider Matrix](PROVIDERS.md), [Security](SECURITY.md), [Account Linking and Merging](ACCOUNT-LINKING-AND-MERGING.md), [Testing](TESTING.md) and [API](API.md).
