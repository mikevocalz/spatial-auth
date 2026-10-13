# Connected Accounts headless UI contract

The consuming app is already authenticated with **Better Auth**. Settings → Connected Accounts reads `authClient.listAccounts()`, not the PICO platform-only `getAccountLinkStatus()`.

Every row has platform name, connected state and availability, and optional Connect/Disconnect. `createConnectedAccountsController` is deliberately UI-framework-neutral, allowing the host's existing semantic UI and XR gaze/pinch responsive layouts.

Connect Google with Better Auth's `linkSocial` or installed supported ID token linking. Connect Meta, PICO or Specs only after acquiring **fresh**, verified platform proof, then POST it to `/spatial-auth/link` under the user's current Better Auth session. Do not treat link as switching active users.

Disconnect must refuse the last working sign-in method. The view model does not replace server-side protection; the Better Auth host must enforce no-last-factor removal under concurrent calls.

A 409 means the device identity belongs to another Better Auth user: display a neutral account conflict and a **review merge** option only after the dual-user merge coordinator is configured with authenticated user control and domain transfer policies. Never automatically merge by email/display name.

Accessibility: large XR focus targets, screen reader descriptions for linked/unlinked, explicit button labels, native platform dialogs, keyboard/touch/gaze/pinch alternatives and a persisted return to Settings after device sign-in.

## Session-bound controller operations

`AccountActions.getAuthenticatedSession()` replaces the earlier boolean `isAuthenticated()` callback. Read the current Better Auth session and return `{ userId, sessionId }`, or `null` when signed out. These IDs identify the operation; they are not credentials and never authorize a server request.

The controller captures a read-only snapshot and rejects a user/session change after native proof acquisition or account-list loading. `linkGoogle`, `linkSpatialProof`, and `unlink` receive that expected session. The host mutation adapter must check it immediately before dispatch and bind the request to that same authenticated session. If an adapter opens its own Google/native dialog, it must repeat the check after the dialog. Do not send a request with whatever user's credentials happen to be active later. The server still validates the actual Better Auth session and its freshness; client IDs cannot replace that validation.

One controller instance permits one operation at a time. Keep one instance per settings/session flow and disable account actions while its promise is pending. Concurrent calls receive `OPERATION_IN_PROGRESS`; success, rejection, or cancellation releases the guard. On `SESSION_CHANGED` or `SESSION_REQUIRED`, discard the acquired proof and refresh the account screen. A later attempt must obtain a new proof. The controller also snapshots an unlink row so a UI update cannot change the selected account during a pending request.

This prevents local duplicate actions, not cross-tab/device races. The server must enforce exact account ownership and no-last-sign-in-method removal transactionally. `canUnlink` is a display hint based on listed account rows, not proof that another credential still works. Secure session persistence, the concrete transport adapters, and rendered UI/device acceptance remain host responsibilities.
