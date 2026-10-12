import { createMetaUserProofVerifier, getMetaXRProof } from '../meta';
const proof = { userId: 'meta-subject', nonce: 'single-use-proof-12345' };
const options = { appId: 'app', appSecret: 'server-only' };
describe('Meta Horizon verification', () => {
  it('verifies the exact Quest user id and one-time nonce', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ is_valid: true }) })) as unknown as typeof fetch;
    expect(await createMetaUserProofVerifier({ ...options, fetcher })(proof)).toEqual({ subject: proof.userId });
    const [url, init] = (fetcher as jest.Mock).mock.calls[0];
    expect(url).toBe('https://graph.oculus.com/user_nonce_validate');
    expect(init.body.get('user_id')).toBe(proof.userId);
    expect(init.body.get('nonce')).toBe(proof.nonce);
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeDefined();
  });
  it.each([false, null, 'true', undefined])('fails closed for invalid response %p', async value => {
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ is_valid: value }) })) as unknown as typeof fetch;
    await expect(createMetaUserProofVerifier({ ...options, fetcher })(proof)).rejects.toThrow('verification failed');
  });
  it('rejects non-200 without reflecting provider error body', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, json: async () => ({ secret: 'dont-expose' }) })) as unknown as typeof fetch;
    await expect(createMetaUserProofVerifier({ ...options, fetcher })(proof)).rejects.not.toThrow('dont-expose');
  });
  it('never sends a client proof when user id missing', async () => {
    const fetcher = jest.fn() as unknown as typeof fetch;
    await expect(createMetaUserProofVerifier({ ...options, fetcher })({ userId: '', nonce: proof.nonce })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not accept unverified user identity without a nonce', () => {
    expect(() => getMetaXRProof({ userId: proof.userId, nonce: '' })).toThrow();
  });
});
