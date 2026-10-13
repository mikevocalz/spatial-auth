/**
 * Framework-neutral Connected Accounts controller. Consuming apps render with
 * their own Expo/Web semantic UI. Better Auth listAccounts is authoritative.
 */
export type Provider = 'google' | 'meta-horizon' | 'pico' | 'snap-specs';
export type AccountRecord = {
  providerId: string;
  accountId: string;
};
export type ConnectedRow = {
  provider: Provider;
  connected: boolean;
  available: boolean;
  canUnlink: boolean;
};
const PROVIDERS: Provider[] = ['google','meta-horizon','pico','snap-specs'];
export function getConnectedAccountRows(accounts: AccountRecord[], available: Partial<Record<Provider, boolean>> = {}): ConnectedRow[] {
  const unique = new Set(accounts.map(a => JSON.stringify([a.providerId, a.accountId])));
  const activeCount = unique.size;
  return PROVIDERS.map(provider => {
    const connected = accounts.some(a => a.providerId === provider);
    return {
      provider,
      connected,
      available: available[provider] ?? true,
      canUnlink: connected && activeCount > 1
    };
  });
}
export class ConnectedAccountsError extends Error {
  constructor(public readonly code: 'SESSION_REQUIRED'|'SESSION_CHANGED'|'OPERATION_IN_PROGRESS'|'ACCOUNT_CONFLICT'|'LAST_SIGN_IN_METHOD'|'UNSUPPORTED_PROVIDER') {
    super(code);
    this.name = 'ConnectedAccountsError';
  }
}
/** Identifies a Better Auth session, never a bearer credential or provider identity. */
export type AccountSession = Readonly<{ userId: string; sessionId: string }>;
export interface AccountActions {
  getAuthenticatedSession(): Promise<AccountSession | null>;
  listAccounts(): Promise<AccountRecord[]>;
  /** Mutation adapters must reject a changed session before sending the request. */
  linkGoogle(expectedSession: AccountSession): Promise<void>;
  /** Must obtain a NEW, platform-issued proof, never a cached profile UID. */
  getPlatformProof(provider: 'meta-horizon'|'pico'|'snap-specs'): Promise<unknown>;
  /** The server still authorizes the actual Better Auth session, never these IDs. */
  linkSpatialProof(proof: unknown, expectedSession: AccountSession): Promise<void>;
  unlink(account: AccountRecord, expectedSession: AccountSession): Promise<void>;
}
export function createConnectedAccountsController(actions: AccountActions) {
  let inProgress = false;

  async function run(action: () => Promise<void>): Promise<void> {
    if (inProgress) throw new ConnectedAccountsError('OPERATION_IN_PROGRESS');
    inProgress = true;
    try {
      await action();
    } finally {
      inProgress = false;
    }
  }

  async function requireSession(): Promise<AccountSession> {
    const session = await actions.getAuthenticatedSession();
    if (!session || typeof session.userId !== 'string' || !session.userId.trim() ||
        typeof session.sessionId !== 'string' || !session.sessionId.trim()) {
      throw new ConnectedAccountsError('SESSION_REQUIRED');
    }
    return Object.freeze({ userId: session.userId, sessionId: session.sessionId });
  }

  async function requireSameSession(expected: AccountSession): Promise<void> {
    const current = await requireSession();
    if (current.userId !== expected.userId || current.sessionId !== expected.sessionId) {
      throw new ConnectedAccountsError('SESSION_CHANGED');
    }
  }

  return {
    connect(provider: Provider): Promise<void> {
      return run(async () => {
        if (!PROVIDERS.includes(provider)) throw new ConnectedAccountsError('UNSUPPORTED_PROVIDER');
        const session = await requireSession();
        try {
          if (provider === 'google') {
            await actions.linkGoogle(session);
            return;
          }
          const proof = await actions.getPlatformProof(provider);
          if (!proof) throw new ConnectedAccountsError('UNSUPPORTED_PROVIDER');
          await requireSameSession(session);
          await actions.linkSpatialProof(proof, session);
        } catch (error) {
          if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
            throw new ConnectedAccountsError('ACCOUNT_CONFLICT');
          }
          throw error;
        }
      });
    },
    disconnect(account: AccountRecord): Promise<void> {
      return run(async () => {
        const target = Object.freeze({ providerId: account.providerId, accountId: account.accountId });
        const session = await requireSession();
        const accounts = await actions.listAccounts();
        // Match the exact row so a replaced provider identity cannot be removed.
        if (!accounts.some(a => a.providerId === target.providerId && a.accountId === target.accountId)) {
          throw new ConnectedAccountsError('UNSUPPORTED_PROVIDER');
        }
        if (new Set(accounts.map(a => JSON.stringify([a.providerId, a.accountId]))).size <= 1) {
          throw new ConnectedAccountsError('LAST_SIGN_IN_METHOD');
        }
        await requireSameSession(session);
        await actions.unlink(target, session);
      });
    }
  };
}
