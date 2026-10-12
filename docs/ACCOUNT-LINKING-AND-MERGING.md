# Account linking and existing-user merges

This document defines the product behavior and backend contract for an **application already using Better Auth**. It distinguishes **adding a new login method to a single Better Auth user** from **merging two independent Better Auth users**. Treating them as the same operation risks account takeover, data loss, and mistaken transfers.

## 1. Acceptance scenarios

### Scenario A — Existing Google user puts on Meta Quest 3

The user opens the app on a Quest 3, chooses "Use Meta account", and the Meta SDK returns the Quest wearer account plus a one-use `UserProof`. When Meta proof verifies and the Meta identity has not yet been linked to a different app account, the app must offer sign-in or authenticated linking as appropriate. If the user's Better Auth Google session is already active on the device, **link** the verified Meta identity to that same `user.id`. If the app has no authenticated Google session, do **not** infer an association merely from a Meta display name or unverified email.

### Scenario B — Existing Better Auth user connects PICO in Settings

On a trusted signed-in app session, Settings → Connected Accounts → "Connect PICO" requests a fresh PICO authorization code. The backend exchanges and verifies it; if unclaimed, it inserts `account(providerId='pico', accountId=<verified-openUid>, userId=<current-user>)`. The app user ID never changes, and all app records remain attached to it. The PICO device account remains owned by PICO.

### Scenario C — New Quest user later connects Google

The verified Meta sign-in creates Better Auth user A when no mapping exists. While signed in as A, "Connect Google" uses Better Auth `linkSocial` or verified Google ID token linking. The new Google provider account maps to user A. Do not create a separate Google-created user B during an explicit linking flow. If Google is already associated with B, display an account conflict and begin the dual-owner flow.

### Scenario D — PICO created user A and Quest created user B

The application has TWO Better Auth user rows with different saved objects/progress. The user signs into A and proves current ownership of B through a fresh, valid Meta proof. The app surfaces **Review merge** with a source/target preview, clear conflict rules, and explicit confirmation. A transactional domain migration moves eligible app records from B into A; only then are safe provider associations re-pointed or reconciled, B's sessions revoked and B retired under the host policy. This is NOT performed by the normal `/link` endpoint.

### Scenario E — Different humans share one physical headset

Do not treat device possession or a stale cached OS profile as proof of the same human. Every link/merge obtains a fresh platform proof for the currently selected headset account and reauthenticates the target Better Auth user. Any identity mismatch denies the merge.

## 2. UI flow and user copy

Account Settings should show `Connected Accounts` with independent Meta, PICO, Google and (where supported) Specs rows. Each row exposes: provider name, masked or user-safe label, connection status, last verified timestamp if backed by server evidence, and a Connect/Disconnect action. "Connect" must explicitly name the provider; never auto-link in the background.

A conflicting account presents: **"This headset account is already connected to another app profile. You can keep these profiles separate or review a secure merge."** The primary button is "Review merge" and the secondary is "Cancel". Never say merge succeeded until server confirmation. Show both profiles' data counts, likely conflicts and the profile that will remain the primary account.

Critical UX details: large XR touch/gaze targets; no dependence on hover; native auth dialogues use platform-specific behavior; any QR/mobile cross-device handoff is short-lived, bound to the original session, and cancelable. A headset sign-out should not be mislabeled as "Delete your app profile".

## 3. One-account linking protocol

```text
Client (currently authenticated as user A)
    | get fresh Meta/PICO proof
    v
POST /api/auth/spatial-auth/link
    | verify Better Auth session A (recent auth for security-sensitive link)
    | verify platform evidence server-side -> (provider, subject)
    | read account row under unique key
    +-- none: insert account row with userId=A; return LINKED
    +-- owner==A: return ALREADY_LINKED (idempotent)
    +-- owner==B: return 409 ACCOUNT_ALREADY_LINKED; no mutation
    +-- verifier fails: 401; no mutation
```

Use `SameSite` and CSRF defenses appropriate to the host transport. After successful linking, refresh the list of Better Auth linked accounts from the backend, not PICO `getAccountLinkStatus` (which cannot know the host app's associations).

## 4. Merge of two Better Auth users (separate privileged workflow)

### Preconditions

Both users must be established Better Auth users, not assumed equal from email or aliases. The acting user controls the chosen **target** session, and independently demonstrates control of the **source** account with a fresh credential accepted by that source's provider. The app verifies session freshness and may require MFA if configured. The source account cannot be under legal hold, blocked for fraud, in a conflicting organization role, or otherwise forbidden by host policy.

**Choosing a target is an explicit product decision.** In most cases the canonical Better Auth `user.id` that already owns valuable memberships/organization data should remain. Do not choose on timestamp alone.

### Phases

1. **Discover:** current Better Auth user A signs in. Linking a second credential reports that it belongs to B. Response reveals minimal non-sensitive context only.
2. **Prove control:** recent authentication of A and a separate fresh, one-use proof for B. The server resolves B from the provider account row and binds it to a merge intent; client-supplied `sourceUserId` is ignored as authority.
3. **Check eligibility:** resolve policy gates for organization roles, school/student data, purchases, subscriptions, fraud holds, legal and privacy constraints, provider-specific ownership.
4. **Inventory:** enumerate merge-relevant tables; collect counts and conflict categories. Read user-visible draft data via purpose-limited service; avoid leaking private data from B before ownership verification.
5. **Preview:** show source and target, canonical destination, what moves, what remains isolated, what cannot transfer, and irreversible effects.
6. **Confirm:** require explicit click/gaze confirmation and re-check auth freshness. Bind decision to a short TTL merge intent and idempotency key.
7. **Lock:** application database transaction acquires row/advisory locks for source/target and unique account mappings. Re-read all state and reject stale/conflicting changes.
8. **Transfer:** domain handlers deterministically move or reconcile eligible records into A; preserve original provenance and audit. Process relationships in FK-safe order. Do not duplicate marketplace purchase rows or elevate roles.
9. **Reassociate:** transfer provider account row(s) only if the provider uniqueness invariant and host consent policies permit. Reverify source association in the same transaction.
10. **Finalize:** mark intent complete and commit. Revoke B sessions and refresh A's linked account list; emit reliable outbox events for post-commit work. Delete/disable B only after references are reconciled and any legal retention policy is satisfied.
11. **Recover:** for transient failure, retry idempotently from stored checkpoint; for validation conflict, abort with no mutation. Generate a reconciliation report and notify the user of the actual outcome.

### Suggested merge state machine

```text
CREATED -> TARGET_REAUTHENTICATED -> SOURCE_VERIFIED
-> INVENTORIED -> PREVIEWED -> USER_CONFIRMED
-> MIGRATING -> COMMITTED -> FINALIZED

CREATED / ... / PREVIEWED -> CANCELLED / EXPIRED
MIGRATING -> RETRYABLE_FAILURE / QUARANTINED
Other invalid transitions -> DENIED (no data mutation)
```

Keep `sourceVerifiedAt`, proof digest, chosen target and policy version in a protected server-side merge intent. Consume proof once; no client-supplied timestamp counts as freshness. After `COMMITTED`, a retry must not duplicate records, reissue charges or repeat external side effects.

## 5. Policy table for app-owned records

| Data domain | Default merge rule | Reason / required decision |
| --- | --- | --- |
| Local preferences | Prefer target, let user optionally choose | Conflicts are low-risk, but retain user intent |
| Saved places/items | Set union by stable ID, deduplicate | Preserve bookmarks |
| Lessons/mastery/stats | Domain-aware union with timestamps/provenance; never simply sum scores | Avoid corrupted progress or duplicated completions |
| User-generated media | Transfer owned media and ACL references if permitted | Storage metadata and access policies must follow |
| Chat and private messages | Keep isolated unless explicit product/legal consent | Other participants' privacy |
| Quest/PICO entitlements | Preserve original store/source owner; may be non-transferable | Store licensing / refunds |
| Subscriptions/billing | No automatic monetary entitlement or processor ownership transfer | Compliance, payouts, disputes |
| Marketplace orders/tickets | Reconcile with merchant/organizer policies; avoid duplicate tickets | Financial integrity |
| School/tenant records | Domain-owner approval required | FERPA / child / organization boundaries |
| Admin/moderator roles | Never union blindly | Privilege escalation |
| Age verification/parent consent | Re-run verification where required | Platform checks may not be equivalent |

The library cannot implement all domain handlers. It supplies verified identity and account-linking primitives; the **host app** implements policy, migrations, audit and recovery. No merge endpoint should be enabled without a real handler and transactional plan.

## 6. Transaction blueprint

For a Postgres-backed host application (adapt migration to the actual Better Auth DB adapter):

```sql
-- Example constraints; inspect the real Better Auth account schema first.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  account_provider_subject_unique
ON account ("providerId", "accountId");
```

Do not run this until duplicate preflight checks and migration-specific review. In the actual transfer transaction, lock A and B in deterministic ID order, verify the merge intent and consumed provider proof, and update domain tables under strict rules. External API side effects must run from an outbox **after commit**, not in the transaction body. If the transaction fails, neither provider ownership nor domain records may be left half moved.

### Race conditions

- Two headset sign-ins for the same new Meta account must not create two canonical users: unique index plus race-safe reload.
- A PICO identity linked concurrently to A and B must have exactly one winner; the loser gets 409.
- A delayed merge confirmation after B changed its login methods must revalidate all owner associations and fail closed.
- A restart during external file transfer must recover from a durable checkpoint and not mark the intent committed prematurely.
- A session cookie surviving B's retirement must be revoked.

## 7. API and error expectations

| Action | Required auth | Outcome |
| --- | --- | --- |
| `/spatial-auth/sign-in` | New valid provider proof | Existing or new Better Auth user session |
| `/spatial-auth/link` | Current Better Auth session + new provider proof | Account row points to current user, else 409 |
| Google `linkSocial` | Current Better Auth session | Explicit Google OAuth/ID-token link |
| `/merge/prepare` (future host integration) | Recent target auth + verified source control | Expiring merge intent and redacted inventory |
| `/merge/confirm` (future host integration) | Target auth, intent, explicit user confirmation | Transactional host migration result |

**Important:** `/merge/prepare` and `/merge/confirm` are **design contracts**, not currently registered endpoints. Any integration must implement and test them without bypassing provider verification or Better Auth authorization.

## 8. Rollback and account deletion

Prefer reversible migration operations until commit; retain an encrypted, access-restricted migration audit/inventory for policy-approved retention. If a post-commit worker fails, mark `FINALIZATION_PENDING` and retry. Do not attempt a blind reverse merge when other participants or external purchases are involved. For user-requested account deletion, use the host app's established Better Auth/data-erasure policies, including legal exceptions.

## 9. Required tests

- A+Meta link, A+PICO link, Meta->Google link; same-user repeat is idempotent.
- Meta(B) on A returns 409; B data remains untouched.
- Two-account merge only after independent proof + explicit confirm.
- Expired/replayed Meta proof, PICO code, invalid Snap ticket, Google wrong audience/nonce.
- Duplicate concurrent creation, role escalation attempt, self-merge, stale merge intent.
- Source user has purchase, active membership, private chat, or legal restriction.
- DB transaction fault at each write step; no mixed ownership.
- Roll forward after worker crash, no duplicate billing; session revoke and restart.
- Two users sharing a headset; mixed Meta app-scoped IDs; cross-tenant boundary.

See [Security](SECURITY.md), [Testing](TESTING.md) and [Architecture](ARCHITECTURE.md).
