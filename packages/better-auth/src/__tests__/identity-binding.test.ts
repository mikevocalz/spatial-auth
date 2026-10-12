import { IdentityBindingError, linkVerifiedAccount, resolveVerifiedAccount } from '../identity-binding';
const identity = { providerId: 'meta-horizon', accountId: 'meta-subject-A' };
describe('verified account mapping', () => {
  it('returns an existing Better Auth user unchanged', async () => {
    const create = jest.fn();
    const result = await resolveVerifiedAccount(identity, {
      findOwner: async () => ({ userId: 'canonical-user' }),
      findUser: async id => ({ id }),
      createUserWithAccount: create
    });
    expect(result).toEqual({ user: { id: 'canonical-user' }, created: false, raceRecovered: false });
    expect(create).not.toHaveBeenCalled();
  });
  it('recovers a duplicate insert race only if a real owner now exists', async () => {
    let reads = 0;
    const result = await resolveVerifiedAccount(identity, {
      findOwner: async () => ++reads === 1 ? null : { userId: 'winner' },
      findUser: async id => ({ id }),
      createUserWithAccount: async () => { throw new Error('unique violation'); }
    });
    expect(result.user.id).toBe('winner');
    expect(result.raceRecovered).toBe(true);
  });
  it('rethrows infrastructure errors that are not ownership races', async () => {
    const fail = new Error('network down');
    await expect(resolveVerifiedAccount(identity, {
      findOwner: async () => null, findUser: async () => null,
      createUserWithAccount: async () => { throw fail; }
    })).rejects.toBe(fail);
  });
  it('does not link identities owned by a different app user', async () => {
    const link = jest.fn();
    await expect(linkVerifiedAccount(identity, 'A', {
      findOwner: async () => ({ userId: 'B' }), link
    })).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
    expect(link).not.toHaveBeenCalled();
  });
  it('turns same-user duplicate races into idempotent links', async () => {
    let n = 0;
    const result = await linkVerifiedAccount(identity, 'A', {
      findOwner: async () => ++n === 1 ? null : { userId: 'A' },
      link: async () => { throw new Error('unique violation'); }
    });
    expect(result).toBe('already-linked');
  });
  it('never accepts missing unverified provider subjects', async () => {
    await expect(resolveVerifiedAccount({ providerId: 'pico', accountId: '' }, {
      findOwner: async () => null, findUser: async () => null,
      createUserWithAccount: async () => ({ id: 'bad' })
    })).rejects.toBeInstanceOf(IdentityBindingError);
  });
});
