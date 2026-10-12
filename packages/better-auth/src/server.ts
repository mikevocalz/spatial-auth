import { randomUUID } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { VerifiedXRIdentity, XRVerification } from './types';

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
  if (!subject || !subject.trim() || subject.length > 256) {
    throw new APIError('UNAUTHORIZED', { message: 'XR platform identity could not be verified' });
  }
  return { providerId: accountKey(proof.provider), accountId: subject, verified };
}

type AccountOwner = { userId: string };

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
    rateLimit: [
      { pathMatcher: (path) => path === '/spatial-auth/sign-in', window: 60, max: 10 },
      { pathMatcher: (path) => path === '/spatial-auth/link', window: 60, max: 10 },
    ],
    endpoints: {
      xrSignIn: createAuthEndpoint(
        '/spatial-auth/sign-in',
        { method: 'POST', body: proofSchema },
        async (ctx) => {
          const { providerId, accountId, verified } = await verify(ctx.body, options);
          const owner = await ctx.context.adapter.findOne<AccountOwner>({
            model: 'account',
            where: [
              { field: 'providerId', value: providerId },
              { field: 'accountId', value: accountId },
            ],
          });

          let user;
          if (owner) {
            user = await ctx.context.internalAdapter.findUserById(owner.userId);
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Linked user not found' });
            }
          } else {
            // XR accounts generally do not expose verified email addresses.
            // The placeholder is deliberately non-deliverable and NEVER email-verified.
            // An atomic user+account write avoids orphan users after failed provisioning.
            const created = await ctx.context.internalAdapter.createOAuthUser(
              {
                name: verified.name?.trim() || 'Spatial user',
                email: `xr-${randomUUID()}@accounts.invalid`,
                emailVerified: false,
                image: verified.image || null,
              },
              { providerId, accountId }
            );
            user = created.user;
          }

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
          const current = await getSessionFromCtx(ctx, { disableRefresh: true });
          if (!current?.user?.id) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Sign in before connecting a headset account',
            });
          }
          const { providerId, accountId } = await verify(ctx.body, options);
          const owner = await ctx.context.adapter.findOne<AccountOwner>({
            model: 'account',
            where: [
              { field: 'providerId', value: providerId },
              { field: 'accountId', value: accountId },
            ],
          });
          if (owner) {
            if (owner.userId !== current.user.id) {
              throw new APIError('CONFLICT', {
                message:
                  'This spatial identity belongs to another account. Verify both accounts before requesting a merge.',
              });
            }
            return ctx.json({ linked: true, alreadyLinked: true });
          }

          await ctx.context.internalAdapter.linkAccount({
            userId: current.user.id,
            providerId,
            accountId,
          });
          return ctx.json({ linked: true, alreadyLinked: false });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
