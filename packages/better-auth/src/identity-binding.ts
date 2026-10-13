/**
 * Server-only identity mapping. A verified platform subject must never be
 * inferred from an email, display name, device ID, or client-supplied UID.
 *
 * The consuming Better Auth DB MUST enforce UNIQUE(providerId, accountId).
 * Without the database constraint no application helper can prevent races.
 */
export interface VerifiedSubject {
  providerId: string;
  accountId: string;
}
export interface AccountOwner {
  userId: string;
}
export type Resolution<User> = {
  user: User;
  created: boolean;
  raceRecovered: boolean;
};
export interface BindingStore<User extends { id: string }> {
  findOwner(identity: VerifiedSubject): Promise<AccountOwner | null>;
  findUser(userId: string): Promise<User | null>;
  /** Must create the app user and its provider account in one transaction. */
  createUserWithAccount(identity: VerifiedSubject): Promise<User>;
}
export class IdentityBindingError extends Error {
  constructor(public readonly code: 'INVALID_SUBJECT' | 'ORPHANED_ACCOUNT' | 'ACCOUNT_CONFLICT') {
    super(code);
    this.name = 'IdentityBindingError';
  }
}
function assertSubject(id: VerifiedSubject): void {
  if (!id.providerId?.trim() || !id.accountId?.trim() || id.providerId.length > 128 || id.accountId.length > 256) {
    throw new IdentityBindingError('INVALID_SUBJECT');
  }
}
async function requireUser<User extends { id: string }>(
  owner: AccountOwner,
  store: BindingStore<User>
): Promise<User> {
  const user = await store.findUser(owner.userId);
  if (!user) throw new IdentityBindingError('ORPHANED_ACCOUNT');
  return user;
}
export async function resolveVerifiedAccount<User extends { id: string }>(
  identity: VerifiedSubject,
  store: BindingStore<User>
): Promise<Resolution<User>> {
  assertSubject(identity);
  const owner = await store.findOwner(identity);
  if (owner) return { user: await requireUser(owner, store), created: false, raceRecovered: false };

  try {
    const user = await store.createUserWithAccount(identity);
    return { user, created: true, raceRecovered: false };
  } catch (originalError) {
    // Only a successful database ownership lookup may rescue a duplicate-insert
    // race. Never suppress an unrelated database/network error.
    const winner = await store.findOwner(identity);
    if (!winner) throw originalError;
    return { user: await requireUser(winner, store), created: false, raceRecovered: true };
  }
}
export interface LinkStore {
  findOwner(identity: VerifiedSubject): Promise<AccountOwner | null>;
  /** Atomic insert guarded by UNIQUE(providerId, accountId). */
  link(identity: VerifiedSubject, userId: string): Promise<void>;
}
export async function linkVerifiedAccount(
  identity: VerifiedSubject,
  authenticatedUserId: string,
  store: LinkStore
): Promise<'linked' | 'already-linked'> {
  assertSubject(identity);
  if (!authenticatedUserId?.trim()) throw new IdentityBindingError('ACCOUNT_CONFLICT');
  const owner = await store.findOwner(identity);
  if (owner) {
    if (owner.userId !== authenticatedUserId) throw new IdentityBindingError('ACCOUNT_CONFLICT');
    return 'already-linked';
  }
  try {
    await store.link(identity, authenticatedUserId);
    return 'linked';
  } catch (originalError) {
    const actualOwner = await store.findOwner(identity);
    if (!actualOwner) throw originalError;
    if (actualOwner.userId !== authenticatedUserId) throw new IdentityBindingError('ACCOUNT_CONFLICT');
    return 'already-linked';
  }
}
