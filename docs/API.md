# API contracts and host-app integration

**Version status:** draft 0.1.x. Confirm API compatibility against the current generated Better Auth plugin types before publishing. Documentation explicitly marks **implemented** versus **proposed** operations.

## 1. Package entry points

| Entry | Purpose |
| --- | --- |
| `spatial-auth/server` | `spatialAuth(options)` registers spatial sign-in and link endpoints with Better Auth |
| `spatial-auth/meta` | `getMetaXRProof(...)` proof conversion and `createMetaUserProofVerifier(...)` server helper |
| `spatial-auth/pico` | `getPicoXRProof(scopes?)` uses existing `@expo-pico/account` auth-code request |
| `spatial-auth/snap` | `getSnapSpecsProof(ticket)` creates typed handoff proof from a trusted ticket |
| `spatial-auth/types` | Shared proof and verification types |
| `expo-spatial-auth` | `getSpatialPlatform`, `getMetaUserProfile`, `getMetaUserProof`, `getGoogleIdToken` |

Server code must not import the native Expo package. Expo device code must not import `spatial-auth/server` or Meta server-secret verifier.

## 2. Better Auth plugin configuration

```ts
import { betterAuth } from "better-auth";
import { spatialAuth } from "spatial-auth/server";
import { createMetaUserProofVerifier } from "spatial-auth/meta";

export const auth = betterAuth({
  database: yourExistingBetterAuthAdapter,
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    spatialAuth({
      verifyMetaUserProof: createMetaUserProofVerifier({
        appId: process.env.META_APP_ID!,
        appSecret: process.env.META_APP_SECRET!,
      }),
      verifyPicoAuthCode: async (authCode) => {
        // Implement via official PICO developer service; this is a placeholder.
        return await hostPicoVerifier(authCode);
      },
      verifySnapSpecsTicket: async (ticket) => {
        // Implement via host-controlled Snap Cloud service; optional.
        return await hostSnapTicketConsumer(ticket);
      }
    })
  ]
});
```

**Integration note:** `hostPicoVerifier` and `hostSnapTicketConsumer` above are app-owned functions; **not provided** by this repository. Do not enable their providers in production until these functions are implemented and audited.

## 3. Provider evidence types

```ts
type XRProof =
  | { provider: "meta-horizon"; userId: string; nonce: string }
  | { provider: "pico"; authCode: string }
  | { provider: "snap-specs"; ticket: string };

type VerifiedXRIdentity = {
  subject: string;      // immutable server-verified provider user identifier
  name?: string;        // profile only, not an auth assertion
  image?: string | null;
};

type XRVerification = {
  verifyMetaUserProof?: (input: { userId: string; nonce: string }) =>
    Promise<VerifiedXRIdentity>;
  verifyPicoAuthCode?: (authCode: string) => Promise<VerifiedXRIdentity>;
  verifySnapSpecsTicket?: (ticket: string) => Promise<VerifiedXRIdentity>;
};
```

Use the provider's audience/app/project scope when deriving the unique account key. A valid `subject` is not automatically globally unique across independent Meta apps.

## 4. Implemented HTTP endpoints

These are Better Auth plugin paths. Depending on Better Auth mounting, the public URLs are commonly prefixed by `/api/auth`.

### POST `/spatial-auth/sign-in`

Request (example):

```json
{
  "provider": "meta-horizon",
  "userId": "123456789",
  "nonce": "fresh-meta-platform-user-proof"
}
```

Server: parse strict input -> call the configured server-only verifier -> resolve `account(providerId,accountId)` -> find/create Better Auth user -> establish Better Auth session. The response includes the app user id and a session token. Host native/session transport must handle token securely.

Success shape (illustrative of current implementation):

```json
{
  "token": "better-auth-session-token",
  "user": { "id": "app-user-id", "name": "Display Name" }
}
```

This response is not evidence of real headset compatibility until actual proof verification is exercised. Client must **not** write token to insecure shared storage.

### POST `/spatial-auth/link`

Requires: current authenticated Better Auth session plus new provider proof. With same request body as above, successful response is:

```json
{ "linked": true, "alreadyLinked": false }
```

Repeated link to identical same-user identity should return:

```json
{ "linked": true, "alreadyLinked": true }
```

If the provider identity is already associated with a different user:

```json
{
  "message": "This spatial identity belongs to another account. Verify both accounts before requesting a merge."
}
```

HTTP status: 409 Conflict. No account data is moved or deleted. Frontend offers reviewed merge rather than repeating the link mutation.

## 5. Standard Better Auth account actions

**Google sign-in** uses Better Auth's built-in Google provider, not `/spatial-auth/sign-in`.

```ts
// Link while the user has an active Better Auth app session:
await authClient.linkSocial({
  provider: "google",
  callbackURL: "/settings/connected-accounts",
});

// Refresh provider listing:
const { data: accounts } = await authClient.listAccounts();
```

A verified ID token from Android Credential Manager may be provided through the corresponding Better Auth ID-token flow, subject to the installed Better Auth version's API and nonce verification. Do not invent an `android-xr` provider ID. An email collision with a separate app user requires conflict resolution, not silent merge.

Do not unlink the last functioning sign-in method. Maintain platform-specific cancellation and retry states.

## 6. Expo Modules v2 API

```ts
import {
  getSpatialPlatform,
  getMetaUserProfile,
  getMetaUserProof,
  getGoogleIdToken,
} from "expo-spatial-auth";

const platform = getSpatialPlatform(); // meta-horizon | pico | android | unknown
const profile = await getMetaUserProfile(); // display-only
const proof = await getMetaUserProof(); // { userId, nonce, ... }
const google = await getGoogleIdToken(WEB_CLIENT_ID, serverIssuedNonce);
```

`getMetaUserProof` is only for Quest/Horizon builds with an initialized SDK; it must throw on unsupported platforms. `getGoogleIdToken` launches Credential Manager on a supported Android foreground Activity and needs a web OAuth client ID plus unique nonce. The PICO SDK must be used through `@expo-pico/account` rather than this module.

On the web, standard Better Auth flows are the supported path. A web shim returns unsupported errors for native Meta proof requests.

## 7. Link and merge API UX contract

A multi-platform app should implement a UI abstraction similar to:

```ts
type ConnectedAccountRow = {
  provider: "google" | "meta-horizon" | "pico" | "snap-specs";
  connected: boolean;
  label?: string;
};

type IdentityConflict = {
  code: "ACCOUNT_ALREADY_LINKED";
  canReviewMerge: boolean;
};
```

The UI must refresh linked accounts from Better Auth after mutation, handle cancellation without changing session, and not show "merged" when only an identity link occurred.

### Proposed host merge interface — not implemented

```ts
type MergePreview = {
  intentId: string;
  expiresAt: string;
  targetUserId: string;
  // Avoid exposing source app identity until independent ownership verified.
  eligibleDomains: Array<{ domain: string; recordCount: number }>;
  conflicts: Array<{ domain: string; decisionRequired: boolean }>;
};

interface HostMergeCoordinator {
  verifyBothUsers(): Promise<void>;
  createPreview(): Promise<MergePreview>;
  confirmAndTransfer(intentId: string, idempotencyKey: string): Promise<void>;
  revokeSourceSessions(): Promise<void>;
}
```

The host implementation must be **transactional and domain-aware**. Merely exposing these type names does not register an endpoint or implement safe migration. See [Account Linking and Merging](ACCOUNT-LINKING-AND-MERGING.md).

## 8. Error classification

| HTTP | Code / classification | Client behavior |
| --- | --- | --- |
| 400 | `INVALID_PROOF_INPUT` | Reject malformed shape; safe generic feedback |
| 401 | `PLATFORM_PROOF_INVALID` / `EXPIRED` / `REPLAYED` | Request fresh platform proof |
| 401 | `SESSION_REQUIRED` | Sign into Better Auth first for linking |
| 403 | `PROVIDER_NOT_CONFIGURED` / `MERGE_NOT_ALLOWED` | Disable feature, show safe explanation |
| 409 | `ACCOUNT_ALREADY_LINKED` | Offer secure conflict resolution |
| 429 | `RATE_LIMITED` | Backoff; no automatic rapid proof retries |
| 503 | `PROVIDER_UNAVAILABLE` | Retry only with fresh proof |
| 500 | `SESSION_CREATE_FAILED` | No claim that auth succeeded |

**Note:** error codes are the target unified taxonomy, not all emitted as machine-readable codes in current alpha implementation. Track implementation separately to avoid overstating compatibility.

## 9. Integration checklist

- [ ] Better Auth server with durable account/session database and migrations
- [ ] Strict provider namespace + unique composite key
- [ ] Correct provider verifier and credentials, server only
- [ ] Expo native dev client and correct Gradle flavor
- [ ] Secure session storage and rehydration/revocation
- [ ] Explicit Settings link/unlink
- [ ] 409 conflict with safe review UI
- [ ] Host-owned verified and transactional merge service if two users exist
- [ ] Real device test matrix and release sign-off
