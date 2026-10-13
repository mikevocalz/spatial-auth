# Specs identity handoff

Snap Specs runs Lens Studio/Snap Cloud, not Expo Android. Do **not** attempt to call Meta Quest or PICO native bridge APIs inside a Lens. Snap OS mediates the wearer account and does not expose unrestricted identity tokens to Lens JavaScript.

The host's trusted Snap Cloud service must verify the authenticated project session and create a one-use, short-expiry ticket scoped to a Snap issuer/project and this Better Auth application's audience. A server-side consumer must cryptographically verify the ticket or retrieve it via a trusted authenticated service, atomically consume it, and return an immutable Snap project-scoped subject.

`createSnapHandoffVerifier` accepts a **host-provided verifier/atomic consumer** and validates its attestation, project/audience and expiry. This does not implement or claim Snap Cloud alpha APIs. The consuming app must keep Specs disabled until official access, real Lens test identities, and replay/failure E2E evidence exist.
