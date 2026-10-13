# expo-spatial-auth (Expo Modules v2)

Independent Kotlin / TypeScript native bridge for Meta Horizon and Google Android XR, separate from the platform-neutral Better Auth server plugin. Uses Expo Modules v2. The host application enables platform SDKs in the correct Gradle flavor and supplies the Better Auth server and session storage.

Native functions: `getSpatialPlatform()`, `getMetaUserProfile()`, `getMetaUserProof()`, `getGoogleIdToken(webClientId, nonce)`. A native OS session is not a Better Auth session.

**PICO:** do not install or copy the PICO native bridge here. In a PICO app, use `@expo-pico/account` and the injectable `spatial-auth/pico` adapter.

**Snap Specs:** Lens Studio is not an Expo Modules Android runtime; identity must use a trusted Snap Cloud handoff.

See [platform requirements](../../docs/PROVIDERS.md), [configuration](../../README.md), and [device testing](../../docs/TESTING.md). Rebuild the Expo dev client after native changes.

**Status:** staged implementation, Quest 3 and Android XR hardware verification required.

## Config-plugin regeneration

The plugin owns a marked Gradle block. Reapplying it updates the selected provider SDKs and Google flavor; setting both providers to false removes that block. Unrelated Gradle content is preserved. The exact legacy block is migrated automatically. Unrecognized edits or incomplete blocks fail with an actionable error rather than silently retaining old SDKs or deleting custom configuration. Kotlin DSL is not supported; the plugin rejects it when a change is required.

Run `npm test --workspace=expo-spatial-auth` from the repository root for behavioral tests through the installed Expo config-mod wrapper. These tests verify generated text and plugin loading, not Android compilation, APK dependencies or device behavior. The consuming app still owns its flavor definitions and runtime validation.
