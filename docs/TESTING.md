# Testing strategy and release gates

Spatial Auth is authentication infrastructure. CI success on Node does not prove Meta/PICO/Snap developer credentials or a real device's identity are verified.

## 1. Test layers

| Layer | Tooling | What it establishes |
| --- | --- | --- |
| Static | TypeScript strict mode, ESLint, format checks | Type/API and hygiene correctness |
| Server unit | Jest with verifier mocks and Better Auth test harness | State transitions and fail-closed behavior |
| Database integration | Disposable Postgres (or app's actual Better Auth adapter) | Uniqueness, transactions, FK consistency |
| Android build | Gradle / Expo Modules v2 + flavor checks | Kotlin compile, dependency separation, APK packaging |
| XR device | Meta Quest 3 / PICO OS / Android XR hardware | Real SDK identity UI, proof retrieval and server verification |
| Snap runtime | Lens Studio + authorized Specs/Snap Cloud project | OS session, Edge Function handoff and ticket consume |
| Host app E2E | Real backend + test accounts + sessions | Same user and data across devices, conflict/merge UX |
| Security | Red-team replay, race, takeover, fault injection | Proof and session controls actually enforced |

## 2. Required test identities

Use **two separate, consented sandbox accounts per provider** (Meta A/B, PICO A/B, Google A/B, Snap A/B if approved), plus a Better Auth app user already owning real test data (non-production) and a second Better Auth user owning deliberately conflicting data. Maintain test account IDs and credentials **outside the repository**.

Never use live subscriber purchases, children, medical records or third-party private messages as merge test fixtures.

## 3. Unit tests

For each provider verifier:
- Valid proof maps to verified immutable subject.
- Invalid, missing, malformed, expired and replayed proof rejects without account write.
- Upstream timeout, non-200 and JSON schema mismatch rejects without falling back to client ID.
- Unexpected provider ID or app scope rejected; issuer or audience mismatch rejected.
- Logging does not include tokens or PII.

For Better Auth plugin:
- First valid sign-in creates one user and account row.
- Repeat valid sign-in resolves same user.
- Existing Better Auth user can link fresh unclaimed Quest/PICO identity.
- Same provider identity linked to same user is idempotent.
- Provider identity owned by another user yields 409 with **zero data writes**.
- Missing current Better Auth session denies linking.
- Invalid source proof cannot create or link a user.
- Concurrent first sign-ins cannot create two canonical accounts for one identity.
- Same email across unrelated provider accounts never silently merges distinct users.
- Last authentication method cannot be unlinked under host policy.

## 4. API integration: Better Auth and database

Run with the **actual Better Auth version** selected for release. Validate server plugin endpoints, cookies, bearer/native session behavior, DB hook and schema compatibility. Ensure `account(providerId,accountId)` uniqueness and native storage survive a restart.

Fault injection:
1. Kill DB connection after user insert but before provider insert. Expected: rollback; no orphan user.
2. Competing links A/B to same provider subject. Expected: one success, one 409; exactly one DB owner.
3. Kill session issuance after verified account mapping. Expected: no insecure fallback token; clear retryable error.
4. Change source provider mapping after merge preview. Expected: revalidation rejects stale confirmation.
5. Domain-transfer rollback after several FK updates. Expected: no partial ownership.
6. Outbox worker crash after DB commit. Expected: idempotent replay without double charges or duplicated notifications.

## 5. Android / Expo build gates

Build and inspect:
- `mobileDebug` and `mobileRelease` without Meta SDK runtime.
- `questDebug` and `questRelease` with Meta Horizon Users/Core; ensure app ID configured and proof bridge compiles.
- `picoDebug` in **expo-pico consuming app**, using optional PICO adapter, with no injected Meta runtime.
- Android XR build with Credential Manager and Google ID; no Meta/Horizon requirement.
- Web build with native adapter shim/guards and functional normal Better Auth sign-in.

Verify Gradle resolves expected Maven coordinates, Kotlin metadata compatibility, minSdk, ABI support, no duplicate AAR/so, manifest merger and R8/minifier rules. Compile-only dependencies in a library are not proof that app APK has the correct runtime classes.

## 6. Meta Quest 3 end-to-end test

1. Sign into headset with Meta account A.
2. Launch consuming app and retrieve app-scoped ID and **fresh** user proof.
3. Backend verifies nonce and creates/maps Better Auth user A.
4. Persist session via secure native transport; kill/relaunch app; same canonical `user.id`.
5. Reusing the same Meta nonce must fail.
6. Change headset user or use another account B and assert it never authenticates as A.
7. Authenticated A links a different unclaimed account appropriately (where policy allows).
8. Test 409 when Meta(B) already belongs to Better Auth user B.
9. Sign out in the app; Better Auth session becomes unusable.
10. Repeat under offline, slow network, simulator signed-out and permission-denied conditions.

**Acceptance evidence:** device model and OS, app version, backend log correlation ID, redacted provider subject, API success/failure, automated test output. No raw tokens in screenshots/logs.

## 7. PICO end-to-end test

Confirm installed `@expo-pico/account` version and PPS native availability, interactive sign-in/cancel, `sendAuthScopesRequest([], 'auth-code')` result, server-side official code verification, duplicate account handling, Google link, logout and two-headset data continuity. Validate PICO OS5 and OS6 separately where supported. The service's own `unknown` age state must not be promoted to adult.

Do **not** consider PICO ready until a real code is exchanged with the official server and tested for expiration/replay. An auth-code returned by Kotlin alone is not verified sign-in.

## 8. Google Android XR test

Run the native Credential Manager bottom sheet and explicit button flow, test authorized/no-account/re-auth cases. Verify nonce, issuer and web client audience on the backend. Link Google to an existing Meta/PICO Better Auth user, ensure no second app user is created. Test signed-out flows and callback routing across device/browser where used.

## 9. Snap Specs test

Requires approved Snap Cloud alpha/project. Test Lens-to-OS Supabase authenticated session, service-backed one-time handoff ticket, host server issuer/project check, audience and short TTL, invalid/replayed ticket, and device disconnect. A mocked Snap ticket validates only type/endpoint logic, not Snap user identity.

## 10. Account merge end-to-end

Use Better Auth user A with saved items and user B with a different set. Verify both accounts independently. The UI must present clear target/source, inventory and conflict preview. Test explicit confirm and cancel, legitimate merge, role-denied merge, external purchase not transferable, partial transfer failure rollback, duplicate idempotency requests, session revocation and restart behavior. Verify all migrations maintain FK integrity and untouched records.

Under no circumstance should a source user be deleted when its domain records or ownership rules have not been completely reconciled.

## 11. Release decisions

### Alpha gate

Unit/build tests green; no unverified fallback; docs correctly label incomplete adapters; demo/test credentials separated from production. This **does not** permit declaring production readiness.

### Beta gate

Real Quest 3 + PICO verified sign-in, Google native ID token validation, account-link uniqueness, secure sessions, tested conflict UI, monitoring, runtime and store permission review.

### Production gate

Repeat all provider-specific real hardware tests for enabled providers; approved security review, DB migration/restore rehearsal, dual-user merge service if enabled, access-control audit, privacy review, secret rotation and incident response runbook, version pin, release checklist and maintainer sign-off.

### Go/no-go checklist

- [ ] Backend verifiers tested using real platform-issued evidence.
- [ ] All providers fail closed during outage and replay.
- [ ] Better Auth database uniqueness and session persistence verified.
- [ ] Two-account merge tested or feature **not exposed**.
- [ ] Quest and PICO hardware test sign-offs attached.
- [ ] Google XR device proof, nonce, expected SDK/Kotlin versions verified.
- [ ] Snap Specs enabled only after handoff service validation.
- [ ] Native release artifacts scanned for secret leakage and dependency skew.
- [ ] Release notes mark exact supported devices, OS versions and restrictions.

## 12. Recommended CI checks

```bash
npm install
npm run build
npm run typecheck
npm test
npm run lint

# In a configured Expo example with Android SDK / devices:
# npx expo prebuild --platform android
# cd android && ./gradlew assembleQuestDebug
# cd android && ./gradlew assembleMobileDebug
```

Do not assert these Gradle tasks exist in a standalone, backend-only checkout; they apply to the consuming Expo example after the device flavors are configured.
