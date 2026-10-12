# expo-spatial-auth (Expo Modules v2)

Independent Kotlin / TypeScript native bridge for Meta Horizon and Google Android XR, separate from the platform-neutral Better Auth server plugin. Uses Expo Modules v2. The host application enables platform SDKs in the correct Gradle flavor and supplies the Better Auth server and session storage.

Native functions: `getSpatialPlatform()`, `getMetaUserProfile()`, `getMetaUserProof()`, `getGoogleIdToken(webClientId, nonce)`. A native OS session is not a Better Auth session.

**PICO:** do not install or copy the PICO native bridge here. In a PICO app, use `@expo-pico/account` and the injectable `spatial-auth/pico` adapter.

**Snap Specs:** Lens Studio is not an Expo Modules Android runtime; identity must use a trusted Snap Cloud handoff.

See [platform requirements](../../docs/PROVIDERS.md), [configuration](../../README.md), and [device testing](../../docs/TESTING.md). Rebuild the Expo dev client after native changes.

**Status:** staged implementation, Quest 3 and Android XR hardware verification required.
