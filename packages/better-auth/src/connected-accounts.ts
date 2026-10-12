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
  const unique = new Set(accounts.map(a => a.providerId + ':' + a.accountId));
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
  constructor(public readonly code: 'SESSION_REQUIRED'|'ACCOUNT_CONFLICT'|'LAST_SIGN_IN_METHOD'|'UNSUPPORTED_PROVIDER') {
    super(code);
    this.name = 'ConnectedAccountsError';
  }
}
export interface AccountActions {
  isAuthenticated(): Promise<boolean>;
  listAccounts(): Promise<AccountRecord[]>;
  linkGoogle(): Promise<void>;
  /** Must obtain a NEW, platform-issued proof, never a cached profile UID. */
  getPlatformProof(provider: 'meta-horizon'|'pico'|'snap-specs'): Promise<unknown>;
  /** Must call Better Auth /spatial-auth/link on the same authenticated session. */
  linkSpatialProof(proof: unknown): Promise<void>;
  unlink(account: AccountRecord): Promise<void>;
}
export function createConnectedAccountsController(actions: AccountActions) {
  return {
    async connect(provider: Provider): Promise<void> {
      if (!await actions.isAuthenticated()) throw new ConnectedAccountsError('SESSION_REQUIRED');
      if (provider === 'google') return actions.linkGoogle();
      const proof = await actions.getPlatformProof(provider);
      if (!proof) throw new ConnectedAccountsError('UNSUPPORTED_PROVIDER');
      try {
        await actions.linkSpatialProof(proof);
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
          throw new ConnectedAccountsError('ACCOUNT_CONFLICT');
        }
        throw error;
      }
    },
    async disconnect(account: AccountRecord): Promise<void> {
      if (!await actions.isAuthenticated()) throw new ConnectedAccountsError('SESSION_REQUIRED');
      const accounts = await actions.listAccounts();
      // Account row matches exactly. Do not unlink a provider ID that has
      // already been replaced by a different source identity.
      if (!accounts.some(a => a.providerId===account.providerId && a.accountId===account.accountId)) {
        throw new ConnectedAccountsError('UNSUPPORTED_PROVIDER');
      }
      if (new Set(accounts.map(a => a.providerId+':'+a.accountId)).size <= 1) {
        throw new ConnectedAccountsError('LAST_SIGN_IN_METHOD');
      }
      await actions.unlink(account);
    }
  };
}
