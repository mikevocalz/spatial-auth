# Android XR Google sign-in / account linking

Google on Android XR does **not** create a separate platform ID in the application's Better Auth account table. The canonical account provider remains `google`. Spatial Auth obtains a Google ID token from native Credential Manager, and the **host Better Auth Google provider** validates its signature, issuer, web client audience, expiration, subject and server challenge nonce.

Use `obtainAndroidXRGoogleCredential(client, { webClientId, serverChallengeNonce })` for the native proof transport. The server issues unpredictable, one-time nonce challenges and binds them to the session/flow. This client helper intentionally **does not decode, trust or verify** the ID token; do not use its return value for authorization until Better Auth verification succeeds.

**Sign-in:** use the installed Better Auth version's supported Google ID token flow. **Link:** start from an already authenticated Better Auth user and use the documented account-linking endpoint/flow; verify that no second app user is created. On an identity owned by another user, preserve the 409 and require the separately verified merge flow.

Outstanding: actual Android XR Credential Manager UX tests, build with supported Google ID Kotlin metadata, platform account picker and cancellation, real server JWT/nonce validation, Expo session rehydration. Follow `docs/PROVIDERS.md`, `docs/ACCOUNT-LINKING-AND-MERGING.md`.
