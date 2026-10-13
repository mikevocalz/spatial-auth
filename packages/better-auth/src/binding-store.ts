import { randomUUID } from 'node:crypto';
import type { AuthContext, User } from 'better-auth';
import { APIError } from 'better-auth/api';
import { runWithTransaction } from '@better-auth/core/context';
import type { AccountOwner, BindingStore, LinkStore, VerifiedSubject } from './identity-binding';
import type { VerifiedXRIdentity, XRVerification } from './types';

/** An adapter's schema check alone does not establish database uniqueness. */
export async function requireBindingDatabase(context: AuthContext, options: XRVerification): Promise<void> {
  if (typeof context.adapter.options?.adapterConfig.transaction !== 'function' ||
      typeof options.verifyAccountBindingConstraints !== 'function') {
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Spatial identity requires transactions and a unique-account constraint check' });
  }
  try {
    await context.explicitSchemaCheck?.();
    if (await options.verifyAccountBindingConstraints() !== true) throw new Error('Unique account constraint is missing');
  } catch {
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Spatial identity database schema is not ready' });
  }
}

export function createBindingStore(
  context: AuthContext,
  verified: VerifiedXRIdentity
): BindingStore<User> & LinkStore {
  async function link(identity: VerifiedSubject, userId: string): Promise<void> {
    const account = await context.internalAdapter.linkAccount({ ...identity, userId });
    if (!account || account.userId !== userId || account.providerId !== identity.providerId ||
        account.accountId !== identity.accountId) {
      throw new APIError('FORBIDDEN', { message: 'Spatial account binding was rejected' });
    }
  }
  return {
    async findOwner(identity) {
      const accounts = await context.adapter.findMany<AccountOwner>({
        model: 'account',
        where: [
          { field: 'providerId', value: identity.providerId },
          { field: 'accountId', value: identity.accountId },
        ],
        limit: 2,
      });
      if (accounts.length > 1) {
        throw new APIError('CONFLICT', { message: 'Spatial identity has ambiguous account ownership' });
      }
      return accounts[0] ?? null;
    },
    findUser: userId => context.internalAdapter.findUserById(userId),
    createUserWithAccount: async identity => await runWithTransaction(context.adapter, async () => {
      const user = await context.internalAdapter.createUser({
        name: verified.name?.trim() || 'Spatial user',
        email: `xr-${randomUUID()}@accounts.invalid`,
        emailVerified: false,
        image: verified.image || null,
      }, { method: 'spatial-auth' });
      if (!user) throw new APIError('FORBIDDEN', { message: 'Spatial user creation was rejected' });
      await link(identity, user.id);
      return user;
    }),
    link: async (identity, userId) => await runWithTransaction(context.adapter, () => link(identity, userId)),
  };
}
