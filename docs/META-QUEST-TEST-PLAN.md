# Quest 3 platform proof hardening

This PR hardens the **server** proof validation transport; no claim of validated hardware is made. Meta Horizon SDK `getLoggedInUser` is profile lookup and `getUserProof` is the one-use proof to submit with the claimed app-scoped user ID.

**Device gates:** Meta developer app enabled, Horizon service connection, two separate signed-in Quest users, a fresh nonce for each request, actual Meta `user_nonce_validate` response, proof replay rejection, logout/restart persistence, lost connectivity, app permissions/DUC. Test Quest 3 and simulator independently. Production review must confirm the exact current Meta endpoint payload and token policy.

Never import server verifier into Expo or accept device user ID alone. Failure must never fall back to client-supplied user info.
