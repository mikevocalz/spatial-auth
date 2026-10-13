import type { BetterAuthPlugin, User, ValidateUserInfoAction } from 'better-auth';
import { APIError, createAuthEndpoint, formCsrfMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { VerifiedXRIdentity, XRVerification } from './types';
import { createBindingStore, requireBindingDatabase } from './binding-store';
import { IdentityBindingError, linkVerifiedAccount, resolveVerifiedAccount } from './identity-binding';

const proofSchema = z.discriminatedUnion('provider', [
  z
    .object({
      provider: z.literal('pico'),
      authCode: z.string().min(8).max(8192),
    })
    .strict(),
  z
    .object({
      provider: z.literal('meta-horizon'),
      userId: z.string().min(1).max(256),
      nonce: z.string().min(8).max(8192),
    })
    .strict(),
  z.object({ provider: z.literal('snap-specs'), ticket: z.string().min(24).max(8192) }).strict(),
]);

type Proof = z.infer<typeof proofSchema>;

function accountKey(provider: Proof['provider']) {
  return provider;
}

/** Never substitute an SDK user id, name, or user-supplied claim for server verification. */
async function verify(proof: Proof, options: XRVerification) {
  let verified: VerifiedXRIdentity | undefined;
  try {
    if (proof.provider === 'pico') {
      if (!options.verifyPicoAuthCode) {
        throw new APIError('FORBIDDEN', {
          message: 'PICO identity verification is not configured',
        });
      }
      verified = await options.verifyPicoAuthCode(proof.authCode);
    } else if (proof.provider === 'snap-specs') {
      if (!options.verifySnapSpecsTicket) {
        throw new APIError('FORBIDDEN', {
          message: 'Snap Specs handoff verification is not configured',
        });
      }
      verified = await options.verifySnapSpecsTicket(proof.ticket);
    } else {
      if (!options.verifyMetaUserProof) {
        throw new APIError('FORBIDDEN', {
          message: 'Meta identity verification is not configured',
        });
      }
      verified = await options.verifyMetaUserProof({ userId: proof.userId, nonce: proof.nonce });
    }
  } catch {
    // No provider credentials, codes, or upstream error text enter the response.
    throw new APIError('UNAUTHORIZED', { message: 'Spatial identity could not be verified' });
  }
  const subject = verified?.subject;
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 256) {
    throw new APIError('UNAUTHORIZED', { message: 'XR platform identity could not be verified' });
  }
  return { providerId: accountKey(proof.provider), accountId: subject, verified };
}

type EndpointContext = Parameters<typeof getAuthoritativeSessionFromCtx>[0];

async function requireFreshLinkSession(ctx: EndpointContext) {
  const current = await getAuthoritativeSessionFromCtx(ctx);
  if (!current?.user?.id || !current.session) {
    throw new APIError('UNAUTHORIZED', { message: 'Sign in before connecting a headset account' });
  }
  const createdAt = new Date(current.session.createdAt).getTime();
  const now = Date.now();
  const hostFreshAge = ctx.context.sessionConfig.freshAge;
  const maxAgeMs = hostFreshAge > 0 ? Math.min(hostFreshAge * 1000, 300_000) : 300_000;
  if (!Number.isFinite(hostFreshAge) || hostFreshAge < 0 || !Number.isFinite(createdAt) ||
      createdAt > now || now - createdAt >= maxAgeMs) {
    throw new APIError('FORBIDDEN', { code: 'SESSION_NOT_FRESH', message: 'Reauthenticate before connecting a headset account' });
  }
  return current;
}

async function checkUserPolicy(ctx: EndpointContext, user: Partial<User>, action: ValidateUserInfoAction) {
  const validate = ctx.context.options.user?.validateUserInfo;
  if (!validate) return;
  try {
    const result = await validate({ user, source: { method: 'spatial-auth', action } }, ctx);
    if (result?.error) throw new Error('User policy rejected');
  } catch {
    throw new APIError('FORBIDDEN', { message: 'Spatial identity is not allowed by the application' });
  }
}

/**
 * Better Auth plugin for device-bound spatial identities.
 *
 * Every identity is ALWAYS verified by trusted backend callbacks.
 * This intentionally does not implement OAuth token exchange based on undocumented
 * PICO endpoints. Configure a real verifier or the request fails closed.
 */
export function spatialAuth(options: XRVerification) {
  return {
    id: 'spatial-auth',
    schema: {
      account: { fields: {}, indexes: [{ fields: ['providerId', 'accountId'], unique: true }] },
    },
    rateLimit: [
      { pathMatcher: (path) => path === '/spatial-auth/sign-in', window: 60, max: 10 },
      { pathMatcher: (path) => path === '/spatial-auth/link', window: 60, max: 10 },
    ],
    endpoints: {
      xrSignIn: createAuthEndpoint(
        '/spatial-auth/sign-in',
        { method: 'POST', body: proofSchema, use: [formCsrfMiddleware] },
        async (ctx) => {
          await requireBindingDatabase(ctx.context, options);
          const { providerId, accountId, verified } = await verify(ctx.body, options);
          const { user, created } = await resolveVerifiedAccount(
            { providerId, accountId }, createBindingStore(ctx.context, verified)
          );
          if (!created) await checkUserPolicy(ctx, user, 'sign-in');

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Unable to create session' });
          }
          await setSessionCookie(ctx, { session, user });
          // Mobile clients should use the Better Auth Expo client integration to
          // persist sessions securely; never put platform credentials into cookies.
          return ctx.json({ token: session.token, user: { id: user.id, name: user.name } });
        }
      ),
      xrLink: createAuthEndpoint(
        '/spatial-auth/link',
        { method: 'POST', body: proofSchema },
        async (ctx) => {
          const current = await requireFreshLinkSession(ctx);
          if (ctx.context.options.account?.accountLinking?.enabled === false) {
            throw new APIError('FORBIDDEN', { message: 'Account linking is disabled by the application' });
          }
          await requireBindingDatabase(ctx.context, options);
          const { providerId, accountId, verified } = await verify(ctx.body, options);
          await checkUserPolicy(ctx, current.user, 'link-account');
          const fresh = await requireFreshLinkSession(ctx);
          if (fresh.user.id !== current.user.id || fresh.session.id !== current.session.id) {
            throw new APIError('UNAUTHORIZED', { message: 'The authenticated session changed during linking' });
          }
          try {
            const result = await linkVerifiedAccount(
              { providerId, accountId }, current.user.id, createBindingStore(ctx.context, verified)
            );
            return ctx.json({ linked: true, alreadyLinked: result === 'already-linked' });
          } catch (error) {
            if (error instanceof IdentityBindingError && error.code === 'ACCOUNT_CONFLICT') {
              throw new APIError('CONFLICT', {
                message: 'This spatial identity belongs to another account. Verify both accounts before requesting a merge.',
              });
            }
            throw error;
          }
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
