# Security model and production controls

**Default state:** fail closed. Spatial Auth handles authentication-critical evidence; incorrect behavior can grant another person's application profile and data.

## Threat model

| Threat | Example | Required defense |
| --- | --- | --- |
| Claimed identity injection | Client POSTs another wearer's Meta/PICO user ID | Server validates actual provider-issued proof |
| Proof replay | Attacker retries intercepted Meta nonce/PICO code | One-time use, expiry, server-side replay records, TLS |
| Cross-app identity collision | Two Meta applications yield different app-scoped IDs | Include issuer and intended registered app ID namespace |
| Cross-provider collision | PICO subject and Meta subject share string | Composite `providerId/accountId` unique key |
| Account takeover via implicit match | Same email/name from another OS account | Disable implicit linking; explicit user control |
| Session fixation | Auth flow writes new session into attacker-known cookie | Better Auth session rotation, origin/CSRF and secure storage |
| CSRF / callback abuse | Forged OAuth/link response | Better Auth CSRF/state/nonce and allowed callback URLs |
| Concurrent binding | Two devices race to link the same subject to different users | DB uniqueness, transaction, loser gets 409 |
| Merge privilege escalation | Moving admin/school roles from source to target | Host domain allowlist, deny sensitive role union |
| Token leakage | App secret in mobile bundle or logs | Server-only secret storage, redaction, scoped credentials |
| Supply chain | Malicious SDK/dependency | Lockfiles, provenance, dependency and Gradle audits |
| Specs handoff forgery | Lens fabricates Snap ticket | Trusted server issuer, audience, signature and atomic consume |

## Hard invariants

1. **Server-verification is mandatory.** Never accept provider profile names, unverified `openUid`, headset device identifiers, or a client-supplied age status as proof. JWT parsing is not signature validation.
2. Do not treat a verified platform identity as automatically having any application permission, subscription, age/parental status, or tenant membership.
3. Provider claims and source identities must be scoped to their issuer, registered app/project and accepted audience. Cross-product SSO requires a separate explicit policy; do not blindly share authentication across unrelated host applications.
4. A user must be authenticated to link providers. A cross-user merge requires two separately proven identities, current target authentication and explicit confirmation.
5. Unlinking the last usable login factor must be prohibited by the host app unless a verified alternate recovery method exists.
6. The Better Auth `user.id` remains the stable app user FK. Delete/retire a source user only after all domain migration and audit gates pass.
7. Revoke previous sessions at critical transitions: recovered compromised account, source account retirement, user-requested global sign-out.

## Verification contracts by provider

### Meta

Verify nonce with Meta's server endpoint using **server-side** app token, app-scoped user ID, single-use semantics and genuine success claim. The SDK `getUserProof()` nonce is good for one use. Confirm the response structure from current Meta documentation and reject non-200, unexpected body, reused nonce, mismatched app, wrong subject or timeout. Limit proof body size and request lifetime; do not log nonce.

### PICO

Server-side authorization code exchange through the developer-approved official service (enabled for the actual PICO app ID, SDK and permissions). Verify subject and app audience; require short code TTL and one-time use; no raw PICO `getUserProfile()` subject fallback. Distinguish `PICO SDK unavailable` from `proof invalid` without revealing exploitable details in public errors.

### Google / Android XR

Use the host Better Auth Google provider to verify ID token signature, issuer, permitted audience, expiry, nonce and subject. Device-native Credential Manager should not become an alternative JWT verifier in JavaScript. Validate emails independently for contact use; never use an unverified address to authorize merges.

### Snap Specs

Lens code cannot access Snapchat OIDC handshakes directly. The trusted Snap Cloud service must verify its authenticated session then mint an audience-limited, short-lived, one-time handoff proof. Consumer must validate signature/issuer/project, replay state and subject; don't trust a client-provided Snap UID.

## Protected endpoints

`/spatial-auth/sign-in`, `/spatial-auth/link` and any future `/merge/*` endpoints require input validation, request size limits, provider-specific rate limits, endpoint-level authorization, correlation IDs and security audit events. The link endpoint requires the active Better Auth session and should require **recent** authentication for high-risk changes. Log protected session user ID in redacted/hashed audit fields only when necessary for investigations.

### Credential storage

- **Client:** only platform-native short-lived proof in volatile memory. Store Better Auth session credentials using supported secure Expo storage and cookies per host app; never local-serialize provider refresh tokens, secret keys or server-issued merge privileges.
- **Server:** keep Meta/PICO secrets in managed secret storage; rotate on compromise. Database-backed session/account records follow Better Auth encryption at rest and access-control practices.
- **Build:** secrets must not appear in Expo config exposed to client, generated JS, APK assets or CI logs. A public **app ID** is not equivalent to an app secret.

## Link and merge audit

Use action names like `provider.link.attempt`, `provider.link.success`, `provider.link.conflict`, `merge.intent.create`, `merge.source.verify`, `merge.preview`, `merge.confirm`, `merge.commit`, `merge.finalization.fail`. Audit identity, actor, session, provider, redacted account mapping, policy version and timestamps. Do not store raw OAuth access tokens, auth codes, user proof nonces, Snap tickets or biometric details.

### Abuse and recovery

A sudden spike in cross-user link attempts, 409 conflicts, replay rejects or reauth failures is suspicious. Rate-limit by session + IP/device fingerprint only where policy permits, and use temporary lockout with a non-disclosing user message. Staff account merge operations require least-privilege roles and are fully audited; administrators must not be able to bypass source ownership proof on behalf of users without a separately approved assisted-recovery policy.

## Privacy and age/entitlements

Provider identity is personally linked data. Define data retention, consent, deletion and exports in host app. Never infer a user is over 18 merely because a provider sign-in succeeded; PICO's reported `unknown` age status is not confirmed adult. Child, education and health applications have extra policy gates. A provider entitlement belongs to its original app/store context and cannot be automatically converted into a transferable purchase.

## Operational controls

**Required monitoring:** verification rejects by provider/error family, provider timeouts, replay, duplicate mapping conflicts, merge transaction failures, pending finalization age, session revocation latency, and invalid migration FK counts. Alerts should avoid PII.

**Incident playbook:** disable affected provider with feature flag; revoke compromised app sessions; rotate leaked credentials; audit mapping changes; roll back code; quarantine suspicious merges; notify users/regulators as required. Existing valid app sessions may be retained or revoked under incident severity policy.

**Release gate:** security reviewer signs off provider verification, DB unique index, native packaging, reauth handling, session persistence, last-factor unlink, replay/expiry tests, no sensitive logs and fail-closed behavior. Document accepted risks and their expiration dates.

## Reporting issues

Do not open a public GitHub issue with active user credentials or exploitable account takeover details. Contact maintainers privately through the repository security policy (once configured). Disclose provider SDK vulnerabilities under the provider's coordinated disclosure rules.

## References

- https://better-auth.com/docs/reference/options
- https://better-auth.com/docs/concepts/users-accounts
- https://developers.meta.com/vr/reference/horizon-platform-sdk-android-kotlin/v0.2.2/horizon_platform_users_users/
- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- https://eng.snap.com/spectacles_supabase
