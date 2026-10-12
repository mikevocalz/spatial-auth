# Spatial Auth

**One Better Auth user, many spatial devices.**

Spatial Auth connects verified headset and spatial-platform identities to an application's **existing Better Auth user and session system**. A person can begin on a PICO headset, use the same app on Meta Quest 3, and later connect Google in Account Settings without losing app progress or creating a parallel identity database.

**Status: early development / draft. Not production-ready.** A native platform account is not, on its own, an application session. Real Meta validation, PICO server authorization-code exchange, Google ID token verification, secure Expo session persistence, Specs handoff, and destructive account-merge workflows have separate verification gates. Do not represent a stubbed verifier as deployed authentication.

## What Spatial Auth is

- A **Better Auth server plugin**: signed platform proofs become Better Auth `account` associations and Better Auth sessions. Better Auth remains the sole authority for app user IDs, sessions, auth policies, and provider links.
- An **Expo Modules v2 native adapter** for the device APIs exposed by Meta Horizon OS / Quest and Google Android XR. It does not use Nitro or implement a second session system.
- A **PICO adapter** that consumes the separate, existing `@expo-pico/account` Expo package. Spatial Auth never copies PICO's native SDK implementation.
- A **Snap Specs integration contract** for trusted Snap Cloud/Mobile Kit identity handoff, since ordinary Lens code is not handed an unrestricted wearer login token.
- A documented **link vs merge** model: add a new verified provider to an existing Better Auth user, or independently prove ownership of two existing app users before consolidating their data.

Not a VR rendering engine, not a password vault, not a replacement for Better Auth, not a replacement for device OS sign-in, and not a service that silently combines accounts on matching display names or email addresses.

## Status by platform

| Platform | Native proof | Better Auth path | Readiness |
| --- | --- | --- | --- |
| Meta Quest 3 / 3S / Horizon OS | `Users.getLoggedInUser` + one-use `Users.getUserProof` | `/spatial-auth/sign-in` or `/spatial-auth/link` | Kotlin adapter staged; backend/app credentials & Quest tests required |
| PICO OS | `@expo-pico/account.sendAuthScopesRequest([], 'auth-code')` | Same endpoints, PICO server verifier required | Native dependency exists outside this repo; S2S exchange not wired |
| Google Android XR | Google Credential Manager ID token | **Existing Better Auth Google provider** | Kotlin bridge staged; real Android XR/nonce tests required |
| Snap Specs | Server-issued, one-use Snap Cloud identity handoff | `/spatial-auth/sign-in` or `/spatial-auth/link` | Contract only; Snap backend integration required |
| Standard web / iOS / Android | Existing OAuth / email / passkeys | Existing Better Auth routes | Consuming app supplies its existing implementation |

**Do not assume identical capabilities on every platform.** Meta's app-scoped IDs, PICO's openUid, Google OIDC subject, and Snap's project-scoped identities are separate namespaces.

## Architecture

```text
Meta Quest account --(one-time UserProof)---\
PICO OS account ----(authorization code)---\
Snap Specs --------(verified ticket)-------+--> Spatial Auth server plugin
                                           |          |
Google Android XR --(Google ID token)------+     Better Auth
                      via Google provider             |
                                                     user.id
                                             +--------+--------+
                                             | account table   |
                                             | session table   |
                                             +--------+--------+
                                                     |
                                            App data and entitlements
```

The application MUST continue to use Better Auth for every login, session, user authorization, and identity association. Platform SDK logins authenticate the **device account**, then the backend verifies a proof and issues the **app** session. Existing user data is keyed to the canonical Better Auth `user.id`, not a Quest/PICO ID.

## Repository layout

```text
packages/
  better-auth/             spatial-auth/server, pico, meta, snap
  expo-spatial-auth/       Expo Modules v2 Kotlin + TypeScript + config plugin
docs/
  ARCHITECTURE.md         Trust boundaries, domain ownership, schema
  ACCOUNT-LINKING-AND-MERGING.md
  PROVIDERS.md            Provider requirements and proof details
  SECURITY.md             Threat model, replay, sessions and privacy
  IMPLEMENTATION-PLAN.md  Milestones, engineering ownership and gates
  TESTING.md              Unit, integration, device and migration matrix
  API.md                  Public contracts and example host integration
.github/workflows/        CI checks
```

## Install / develop

Prerequisites: Node 22+, TypeScript, a running **Better Auth application**, Expo SDK 58-compatible Android build environment for native adapters, and active developer app credentials for each platform being enabled.

```bash
git clone https://github.com/mikevocalz/spatial-auth.git
cd spatial-auth
npm install
npm run build
npm run typecheck
npm test
```

This repo does not supply an app database or magically configure the calling app's Better Auth endpoint. Native Expo changes require prebuild/rebuilding a development client. Never add server secrets to an Expo bundle.

### Server: Better Auth as the only source of truth

```ts
import { betterAuth } from "better-auth";
import { spatialAuth } from "spatial-auth/server";
import { createMetaUserProofVerifier } from "spatial-auth/meta";

export const auth = betterAuth({
  // Existing app database/adapter remains authoritative.
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      allowUnlinkingAll: false
    }
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    }
  },
  plugins: [
    spatialAuth({
      verifyMetaUserProof: createMetaUserProofVerifier({
        appId: process.env.META_APP_ID!,
        appSecret: process.env.META_APP_SECRET!
      }),
      verifyPicoAuthCode: async code => {
        // REQUIRED app-provided server-to-server verification.
        // Replace with official PICO integration; not bundled here.
        const user = await yourVerifiedPicoCodeExchange(code);
        return { subject: user.openUid, name: user.displayName };
      }
    })
  ]
});
```

The placeholders `yourVerifiedPicoCodeExchange` and any Snap handoff callback must be implemented by the host app before those providers can be enabled. Do not use `getUserProfile().userId` alone as identity proof.

### Client: sign in on Quest 3

```ts
import { getMetaUserProof } from "expo-spatial-auth";

const { userId, nonce } = await getMetaUserProof();
// Uses the host app's Better Auth base URL and supported client transport:
await authClient.$fetch("/spatial-auth/sign-in", {
  method: "POST",
  body: { provider: "meta-horizon", userId, nonce }
});
```

### Client: sign in on PICO

```ts
import { getPicoXRProof } from "spatial-auth/pico";

const proof = await getPicoXRProof();
await authClient.$fetch("/spatial-auth/sign-in", {
  method: "POST",
  body: proof
});
```

Both examples need secure native Better Auth session storage/configuration in the **consuming app**. The platform proof is short-lived, used once, and never stored as the app session.

### In Account Settings: connect Google or another headset

When a user is already authenticated, use explicit linking. Google's normal Better Auth flow is:

```ts
await authClient.linkSocial({
  provider: "google",
  callbackURL: "/settings/connected-accounts"
});
const { data: accounts } = await authClient.listAccounts();
```

To connect PICO or Quest to an existing Better Auth session, obtain a **fresh** platform proof and send it to `/spatial-auth/link` rather than `/sign-in`. Linking does not move unrelated app data between two existing users.

## The account collision rule

**One provider identity may map to exactly one Better Auth user.** If a Quest account is already connected to user B while user A is currently signed in, `/link` responds with **409 Conflict**. Nothing is silently reassigned.

A real **merge of two existing Better Auth users** is a separate verified workflow. It requires recent authentication of both users, a preview of content/entitlements and conflict policy, explicit confirmation, a transactional transfer of domain records, source-session revocation, audit logging, and tested recovery. Spatial Auth must not delete a source user before all app-specific records are safely reconciled. See [Account Linking and Merging](docs/ACCOUNT-LINKING-AND-MERGING.md).

## Production requirements

- Verify platform proofs **server-to-server**, including issuer/client/app scope, freshness, one-time use, and stable subject.
- Store `account(providerId, accountId)` under a database uniqueness constraint; use a transaction or equivalent duplicate-safe write path.
- Use a secure Better Auth session transport for Expo (e.g., Better Auth Expo integration), and validate restart/sign-out/session revocation.
- Enforce permissions/entitlements at the app backend; native headset login is not an entitlement or age guarantee.
- Test PICO and Quest identity collision, Google linking, unlink-last-method prevention, concurrent logins, proof replay, and cross-device data consistency.
- Review and document privacy, data retention, account deletion and parental/age policies for the host app.

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Domains, boundaries, data schema, session model, error taxonomy |
| [Account Linking & Merging](docs/ACCOUNT-LINKING-AND-MERGING.md) | Full user journeys, dual-user migrations, conflict/rollback policies |
| [Provider Integrations](docs/PROVIDERS.md) | Meta, PICO, Android XR, Specs; approvals, API data flow and limitations |
| [Security](docs/SECURITY.md) | Attack scenarios, verifier requirements, replay and audit |
| [API Contracts](docs/API.md) | Request/response shapes, adapters, linking, errors |
| [Testing & Release](docs/TESTING.md) | CI, device coverage, failure injection, go/no-go |
| [Implementation Plan](docs/IMPLEMENTATION-PLAN.md) | Engineer roster, work packages, milestones, skill stack |

## References

- [Better Auth: Users & Accounts](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth: account linking options](https://better-auth.com/docs/reference/options)
- [Meta Horizon Kotlin Users SDK](https://developers.meta.com/vr/reference/horizon-platform-sdk-android-kotlin/v0.2.2/horizon_platform_users_users/)
- [Android Credential Manager](https://developer.android.com/identity/sign-in/credential-manager)
- [PICO native bridge](https://github.com/mikevocalz/expo-pico/tree/main/packages/expo-pico-account)

## Project scope and licensing

Open-source MIT-licensed project. Provider SDK licenses, developer enrollment and store policies remain governed by their respective vendors. Contributions require tests and current references, not invented platform endpoints. Never merge or publish as production-ready based solely on mocks.
