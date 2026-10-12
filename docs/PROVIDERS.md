# Provider integration specifications

**The app's Better Auth user is authoritative.** A native provider credential is a temporary proof of control over a platform identity, not an application user account.

## Feature / readiness matrix

| Provider | Client runtime | Primary API | Credential to backend | Identifier scope | State |
| --- | --- | --- | --- | --- | --- |
| Meta Horizon | Quest 3/3S / Horizon app | Kotlin Horizon Users | One-use UserProof nonce + app-scoped user ID | Meta app-scoped | Initial adapter source staged; device verify required |
| PICO | PICO OS / Expo Android | Existing `@expo-pico/account` | PPS authorization code | PICO openUid subject | Native bridge exists; official server verification outstanding |
| Google Android XR | Android XR / Credential Manager | Google ID credential | OIDC ID token + client-generated nonce | Google issuer + sub | Native bridge staged; Google provider linking required |
| Snap Specs | Lens Studio/Snap Cloud | OS-mediated Snap Cloud session | Host-issued, one-use exchange ticket | Snap project/issuer scoped | Design only; do not enable without trusted bridge |
| Web / iOS | Browser/native app | Better Auth social/email/passkeys | Provider-native callback | Per-provider | Uses host Better Auth implementation |

## Meta Quest 3 / Horizon OS

### Preconditions

- The host app is registered in Meta Developer Dashboard with the correct Horizon App ID and app secret stored **server side**.
- The current Quest build is entitled/configured to call the required Horizon Platform SDK Users APIs; verify Meta data-use permissions/policy.
- Build and package `com.meta.horizon.platform.sdk:core-kotlin` and `users-kotlin` only for Quest/Horizon flavors.
- Initialize `HorizonServiceConnection` for the app, then obtain the currently logged-in user and a fresh one-use proof. Emulator/simulator runtime behavior is not a substitute for the real device test.

### Native-to-server sequence

```text
Quest 3 Meta OS account
 -> HorizonServiceConnection.connect(appId, context)
 -> Users().getLoggedInUser() (app-scoped ID)
 -> Users().getUserProof() (one-use nonce)
 -> POST /spatial-auth/sign-in or /link
 -> server validates nonce with Meta service and confirms user_id
 -> server uses verified app-scoped identity key
 -> Better Auth account row / session
```

Kotlin Users SDK `getLoggedInUser()` can return an app-scoped user ID while the app is offline. That ID is not a backend authentication proof. `getUserProof()` provides the nonce; the server must verify it with Meta's user proof endpoint and Meta app credentials. A successful nonce is for **one check only**; requesting a new proof for each attempt is required. Reject offline "successful" user lookup if the nonce cannot be verified.

Server helper included: `createMetaUserProofVerifier`. Its success is contingent on valid developer credentials and Meta response semantics. Do not use this package's demo proof tests as evidence of device credential security.

**Never:** use an Oculus display name or avatar URL as user ID; accept just `userId` without proof; cache nonce for replays; send Meta app secret to Android; treat Meta entitlement verification as equivalent to user verification.

### Real-world validation

Quest 3/3S physical unit: sign in as account A; retrieve user proof; backend validates A; verify replay fails; switch headset to B; verify it creates/maps a different Better Auth identity; reconnect A; confirm A's previous app records remain. Test Meta Spatial Simulator signed in/out separately because mocked/offline behaviors can differ. Also test Quest user proof under slow network, interrupted popup, expired Meta app permission and cancellation.

Reference: https://developers.meta.com/vr/reference/horizon-platform-sdk-android-kotlin/v0.2.2/horizon_platform_users_users/

## PICO OS

### Reuse the existing code (no duplication)

Source dependency: https://github.com/mikevocalz/expo-pico/tree/main/packages/expo-pico-account

Your existing Expo PICO account package provides `getUserProfile()`, `login()`, `getAccessToken()`, `sendAuthScopesRequest()`, `logout()`, and age/scope helpers. The Kotlin bridge uses PICO Platform Service `PicoSignInClient`. Spatial Auth **must not copy** that bridge, alter PICO launcher Gradle flavors or make `expo-pico` depend on other headset SDKs.

The normal proof request is:

```ts
import { sendAuthScopesRequest } from "@expo-pico/account";

const response = await sendAuthScopesRequest([], "auth-code");
if (!response.authCode) throw new Error("PICO authorization code missing");
// Send response.authCode to Better Auth Spatial Auth server plugin.
```

The standalone package's §getPicoXRProof(picoAccount)§ accepts §@expo-pico/account§ as a host-provided adapter; it is not installed by Spatial Auth itself.

Native platform user ID/profile data are **display-only** until verified by your application's server. Implement `verifyPicoAuthCode` using currently enabled PICO developer services, server-side credentials, official grant/code validation and a verified immutable subject. Different PICO PPS SDK generations use different surfaces; the app's actual configured PPS version governs the exchange. The library does not fabricate an unknown PICO token exchange URL.

If verification cannot be completed with the approved service, PICO linking/sign-in must remain disabled with clear `PROVIDER_NOT_CONFIGURED` errors. Do not "temporarily" compare `openUid` from the headset as a bypass.

### Device coverage

PICO 4 / 4 Ultra OS5 and supported OS6 / Swan hardware need separate runtime validation. Confirm SDK resolved from Maven, the user can cancel and reauthorize, codes expire and cannot be reused, permissions/scopes are granted, and a sign-out does not silently delete the Better Auth account. Check PICO age status separately; `unknown` is not adult.

## Google Android XR

Google is not a standalone spatial provider in Better Auth: its verified provider ID remains **`google`**. Android XR simply supplies the native selection interface via Credential Manager.

```text
Android XR Credential Manager -> Google ID Token
 -> host Better Auth Google social provider
 -> verify JWT signature, issuer, audience, time, nonce and email claims
 -> existing Google association or explicit link under canonical user.id
```

- Configure the Google Auth Platform OAuth web client ID and consent requirements in the host application.
- Request an ID credential with `GetGoogleIdOption` / `GetSignInWithGoogleOption` and a cryptographically random nonce. Reuse that nonce only for the matching server verification.
- Handle `NoCredentialException` by offering a suitable explicit sign-in control, not claiming the device lacks a Google account.
- For sign-in, use Better Auth's documented Google ID token sign-in flow supported by the installed Better Auth version; for account Settings, use `authClient.linkSocial({ provider: 'google', idToken: { token, nonce } })` if supported.
- Provider subject (`sub`) is the stable key. Email is profile/communication data and may change; matching email should never blindly overwrite existing app accounts.
- Prompt for user consent and use only the scopes required for sign-in; Drive/Calendar permissions belong to separate authorization APIs.

The installed Expo SDK's Kotlin compiler compatibility must be verified against Credential Manager/Google ID library metadata. A dependency that is "latest" but compiled with an unsupported Kotlin metadata version **cannot** ship. Current staged pins reflect compatibility work and must be reevaluated with CI and actual Android XR build tooling.

References:
- https://developer.android.com/identity/sign-in/credential-manager-siwg
- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation

## Snap Specs / Lens Studio

Snap Cloud uses an OS-mediated project-scoped OIDC/Supabase authentication bridge. In a Lens, the platform handles Snapchat credential exchange; Lens JavaScript does **not** receive the raw wearer identity token. Therefore an Expo Modules v2 Kotlin adapter cannot be a substitute for the Specs runtime.

Recommended host architecture:

```text
Snap wearer launches authorized Lens
 -> Snap OS authenticates to Snap Cloud project
 -> Lens receives project-scoped Snap Cloud authenticated session
 -> trusted Edge Function verifies session server-side
 -> Edge Function mints short-lived, one-use Spatial Auth handoff ticket
 -> host Better Auth Spatial Auth backend consumes ticket server-side
 -> verified (issuer/project/subject) links to canonical Better Auth user
```

The ticket MUST be bound to target Better Auth client/session intent, audience, issue/expiry times, replay-prevention record, immutable Snap subject and originating Snap Cloud project. Use a protected authenticated Edge Function to mint and consume; do not accept a client-generated ticket or assert that Snap Cloud exposes wearer token to Lens JS.

**Status:** Snap Cloud alpha access, API review, handoff implementation and real Specs tests are required. The repo currently defines a ticket *contract*, not a functioning Snap identity provider.

Reference: https://eng.snap.com/spectacles_supabase

## Provider key compatibility

Different platforms may return IDs that look numeric or similar. They are never comparable across providers. Use a namespace like `meta-horizon:<app-id>:<subject>` conceptually where cross-app uniqueness is required, without logging raw app secrets or leaking personal IDs. Changing provider IDs after release requires a one-time DB migration and compatibility aliases; never break older linked accounts silently.

## Failure matrix

| Condition | Expected behavior |
| --- | --- |
| PICO SDK unavailable | Disable PICO action and show platform-specific diagnostics |
| Meta nonce already consumed | Request new nonce; 401 and no account write |
| Meta server outage | Fail closed for new sign-ins; do not switch to claimed user ID |
| Google ID token audience mismatch | Reject and record redacted auth failure |
| Snap ticket expired/replayed | Reject; no fallback to Snap display name |
| Provider subject owned by another Better Auth user | 409 Conflict; offer reviewed merge |
| User cancels native login UI | No mutation; return to prior signed-in state |
| XR user signs in while already authenticated as different user | Explicit switch/relink choice, never silent session replacement |

## Provider compliance and release

Every adapter maintainer must track vendor SDK versions, developer permissions, data-use policies, test account setup, build flavor isolation, on-device screenshots/log evidence and a rollback plan. Provider-specific approval cannot be assumed based on successful TypeScript builds.
