# Connected Accounts headless UI contract

The consuming app is already authenticated with **Better Auth**. Settings → Connected Accounts reads `authClient.listAccounts()`, not the PICO platform-only `getAccountLinkStatus()`.

Every row has platform name, connected state and availability, and optional Connect/Disconnect. `createConnectedAccountsController` is deliberately UI-framework-neutral, allowing the host's existing semantic UI and XR gaze/pinch responsive layouts.

Connect Google with Better Auth's `linkSocial` or installed supported ID token linking. Connect Meta, PICO or Specs only after acquiring **fresh**, verified platform proof, then POST it to `/spatial-auth/link` under the user's current Better Auth session. Do not treat link as switching active users.

Disconnect must refuse the last working sign-in method. The view model does not replace server-side protection; the Better Auth host must enforce no-last-factor removal under concurrent calls.

A 409 means the device identity belongs to another Better Auth user: display a neutral account conflict and a **review merge** option only after the dual-user merge coordinator is configured with authenticated user control and domain transfer policies. Never automatically merge by email/display name.

Accessibility: large XR focus targets, screen reader descriptions for linked/unlinked, explicit button labels, native platform dialogs, keyboard/touch/gaze/pinch alternatives and a persisted return to Settings after device sign-in.
