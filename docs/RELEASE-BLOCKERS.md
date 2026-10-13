# Release blockers: do not confuse CI with device validation

This PR adds structural gates: workspace package exports, source isolation, no direct PICO SDK dependency, and static Gradle source assertions. These checks cannot validate Kotlin classloading, actual headset users, one-time provider proofs, developer app permissions, Android XR system picker, Snap Cloud alpha, or a real two-user data merge.

**Before publishing:** run configured Expo Android build matrix for Quest and Android XR; on PICO validate via a consuming `expo-pico` app with the PICO SDK in its own repo. Inspect APK manifests/runtime dependency trees, generated package entry points and bundled secrets.

Require identity and database security review, real provider credentials in test environment, E2E replay/collision tests, audited migration, feature gating for unsupported adapters, and signed release provenance.
