# Spatial Auth architecture

**Audience:** maintainers, identity engineers, Expo / Android platform owners, host-app architects, DB engineers and security reviewers.  
**Normative terms:** MUST / MUST NOT / SHOULD / MAY indicate requirements.

## 1. Core invariants

1. **Better Auth owns the application user.** No device adapter creates an alternative application account table, authorizes access to app data, or issues its own long-lived app session. The canonical foreign key for app records is Better Auth `user.id`.
2. A platform identity is the pair `(providerId, providerSubject)`, not a display name, email address, avatar URL, headset serial, device advertising identifier, or hardware fingerprint.
3. Every platform subject MUST originate from a **server-verified** fresh provider proof. No client-supplied user ID is accepted alone, even if the device SDK returned it.
4. Exactly one Better Auth user may own a given provider identity at a time. Enforce this with a DB constraint, not application-level pre-check alone.
5. The server may create a Better Auth session only **after** verified identity mapping and database consistency checks complete. A native OS session must not be confused with a Better Auth app session.
6. A device identity may be linked to a currently authenticated Better Auth user without changing that user's ID. **Two existing Better Auth user rows are not merged implicitly**.
7. Security review is required before broadening scopes or enabling cross-app identity sharing.

## 2. Logical boundary map

```text
+------------------- DEVICE TRUST BOUNDARY --------------------+
| Meta Quest 3       PICO OS         Android XR      Snap Lens  |
| Meta Users SDK     PPS account     Credential Mgr  Snap Cloud |
| getUserProof       auth code       Google ID token  handoff   |
+--------------------------+------------------------------------+
                           | short-lived evidence only
                           v TLS
+------------------------- APP SERVER --------------------------+
| Host Better Auth endpoints                                    |
|    +--- spatial-auth plugin --------------------------------+ |
|    | verify + normalize provider subject                    | |
|    | sign-in / explicit link / conflict                     | |
|    +--------------------+-----------------------------------+ |
|                         |                                     |
|  Google Better Auth provider (OIDC verification)              |
|                         |                                     |
| Better Auth internal adapter -> user/account/session tables    |
| Host authorization -> roles/tenancy/entitlements               |
| Domain services: progress, media, orders, memberships          |
+-------------------------+------------------------------------+
                          |
                          v
                    App database
```

### OS account vs application account

- **PICO OS** signs in the wearer/device to the PICO Platform Service. The native package can request profile and proof credentials. That does not grant access to the host application's private records.
- **Meta Horizon OS** signs in the Quest wearer. The Meta SDK's app-scoped ID is insufficient without one-time UserProof validation on the host server.
- **Android XR** has credential UI for user-selected Google accounts. The Google credential must be verified through Better Auth's Google provider and the configured Google client ID. Android XR itself is not a separate user namespace.
- **Specs** has a Lens/Snap Cloud security boundary. Identity cannot be established by trusting a caller-provided Lens user ID.
- **Better Auth** assigns the canonical application user ID, account associations and sessions. Apps continue using existing Better Auth hooks, organizations, permissions, policies and database adapter.

## 3. Packages and load boundaries

| Package | Purpose | Import/runtime constraints |
| --- | --- | --- |
| `spatial-auth/server` | Better Auth plugin and verified identity binding | Server-only; no Android SDK, Expo runtime or secrets in JS client |
| `spatial-auth/meta` | One-time Meta proof builder and server verifier helper | Server verifier must not be imported into Expo runtime |
| `spatial-auth/pico` | Adapter for existing `@expo-pico/account` | PICO Expo builds only; optional platform dependency |
| `spatial-auth/snap` | Server-issued handoff ticket contract | Does not bypass Snap Cloud token protections |
| `expo-spatial-auth` | Expo Modules v2 Kotlin platform bridge | Optional Meta / Google flavors; native dev client required |

Long-term packaging MAY split native adapters into separate independently versioned packages, but MUST retain the same provider IDs, stable proof and session contracts.

### Device flavor constraints

Meta Horizon and Google Play Services artifacts must not be pulled into PICO APKs. A Quest build must not accidentally load Android XR Google identity dependencies; mobile or Android XR builds must not need Meta SDK runtime classes. Kotlin provider-specific bridge classes should be lazily accessed only when their runtime dependency exists. CI must verify Gradle dependency graphs and actual APKs, not assume declared `compileOnly` makes runtime code safe.

## 4. Canonical data model

Leverage the existing Better Auth `user`, `account`, `session` and related tables, not a shadow `spatial_users` store.

```text
user
  id                     primary key, app identity
  name, email, ...       managed by Better Auth
account
  id                     Better Auth account-row ID
  userId                 FK -> user.id
  providerId             'meta-horizon' | 'pico' | 'google' | 'snap-specs'
  accountId              provider's server-verified subject
  ...                    Better Auth fields
session
  id, token, userId, expiresAt, ...
```

Create and enforce a **unique composite index** on `account(providerId, accountId)`, respecting Better Auth's actual adapter schema and any existing provider ID names. Add a DB migration with preflight duplicate detection. On a duplicate insert race, reload the owner and follow the conflict policy; never manufacture two users for the same provider identity.

Identity attribution MUST include the app/developer context if the provider's subject is only app-scoped. Do not assume Meta user IDs are portable across unrelated Meta applications. Stable `providerId` may incorporate an issuer/app namespace if the same database accepts multiple registered provider applications; document this explicitly in each adapter config.

### Merge-intent data (host app owned)

Recommended, separate from Better Auth base tables:

| Entity | Fields / constraints |
| --- | --- |
| `account_merge_intent` | id, targetUserId, sourceUserId, requesterSessionId, state, createdAt, expiresAt, sourceProofDigest, policyVersion, confirmationAt, idempotencyKey |
| `account_merge_audit` | eventId, mergeIntentId, actorUserId, event, timestamp, redacted metadata |
| `account_merge_outbox` | id, mergeIntentId, eventType, payloadRef, publishedAt, retryCount |
| `merge_data_inventory` | intentId, domain, sourceCount, destinationCount, conflictCount, decision, digest |

Use private datastore tables with unique intent/idempotency constraints, restrictive access controls, short expiry for merge authorizations, and a retention policy for audit records.

## 5. Session lifecycle

1. Obtain platform evidence at the native boundary only on explicit sign-in or linking.
2. POST evidence to host Better Auth over TLS with origin/app binding and rate limits.
3. Server validates issuer, intended app/client ID, proof cryptography / exchange, expiry, one-time use, and returned subject. A network failure is an authentication failure, not an excuse for accepting raw IDs.
4. Resolve Better Auth account row under uniqueness constraint. If absent, atomically create a user plus provider account. Existing app user IDs must not be replaced.
5. Issue Better Auth session, not provider access token. Native clients use a secure, supported session persistence flow and clear both cookies/headers and persisted tokens on sign-out.
6. Reverify session at protected endpoints. User's OS sign-out should not be assumed to revoke a Better Auth session unless the app explicitly performs that action.

Session expiry, revocation, multi-device logout, abuse limits, cookie attributes, and refresh policy remain host Better Auth responsibilities. Never log token contents or the Meta one-time proof.

## 6. Identity state machine

```text
UNAUTHENTICATED
  -> PROOF_REQUESTED
  -> VERIFYING
  -> VERIFIED
      -> EXISTING_LINKED_USER -> APP_SESSION
      -> NO_PROVIDER_ASSOCIATION -> PROVISION_USER -> APP_SESSION
      -> LINK_EXISTING_USER (has app session) -> LINKED
      -> ASSOCIATED_WITH_OTHER_USER -> CONFLICT_409
      -> USER_ABORTED / VERIFIER_FAILED / REPLAYED / EXPIRED -> DENIED

CONFLICT_409
  -> user explicitly selects "Review account merge"
  -> dual control proof + recent auth + preview
  -> explicit confirm + transactional host migration
  -> canonical Better Auth user remains target
```

A 409 is not an internal error; render an actionable explanation. Do not overwrite the active session with the other user during link negotiation.

## 7. Multi-tenant and entitlements

Identity ownership and tenant membership are separate concepts. Merging a human's app identities MUST NOT silently elevate teacher/admin/business roles or move school-owned records, billing accounts, app-store purchases, organization ownership, or child/dependent profiles. The host app supplies domain-specific policies. Entitlements from Meta/PICO storefronts may be provider-bound and legally non-transferable; keep the original purchase provenance.

## 8. Failure handling and observability

Record reason codes such as `PROVIDER_UNAVAILABLE`, `PROOF_EXPIRED`, `PROOF_REPLAYED`, `PROVIDER_SCOPE_MISMATCH`, `ACCOUNT_ALREADY_LINKED`, `MERGE_REQUIRES_REAUTH`, and `DOMAIN_TRANSFER_FAILED`. Log request IDs and redacted actor/account references; do not log bearer tokens, OAuth codes or nonce values. Record verification latency, 409 rates, replay rejects and session issue failures by provider without exposing user identifiers in analytics.

A provider outage must fail closed and may allow existing valid Better Auth sessions to continue according to host policy; it must never silently create a new account because an identity lookup timed out.

## 9. Design decisions and alternatives

- **Why Better Auth?** The consuming app already has a user database and sessions. Creating a spatial-specific user system multiplies authorization bugs and splits user data.
- **Why no implicit email merge?** PICO/Quest may not supply verified email, and equal emails do not establish control of two existing user records. Explicit linking is safer.
- **Why not OAuth everywhere?** Meta Horizon UserProof, PICO authorization code, Google Credential Manager and Specs Snap Cloud do not have interchangeable trust contracts.
- **Why a standalone repository?** Provider SDKs, releases and device CI change independently of PICO's core runtime. No Meta/Snap/Google feature belongs in `expo-pico`.
- **Why app-specific merge callbacks?** A generic auth package cannot know whether lessons, subscription purchases, tickets, org roles or saved worlds may be transferred. The host domain owns those policies.

## 10. Required review

Changes to identity verification, provider keying, account-write paths, merge rules, session transport or database uniqueness require security and database-owner review. All merge migrations require a restore rehearsal and reproducible checks. See [Security](SECURITY.md), [API](API.md), [Testing](TESTING.md).
