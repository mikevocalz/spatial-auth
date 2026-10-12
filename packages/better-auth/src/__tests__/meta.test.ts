import { createMetaUserProofVerifier, getMetaXRProof } from '../meta';

describe('Meta user-proof adapter', () => {
  it('sends proof to the official server-to-server validation endpoint', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({ is_valid: true }),
    })) as unknown as typeof fetch;
    const verify = createMetaUserProofVerifier({ appId: 'app', appSecret: 'secret', fetcher });
    expect(await verify({ userId: '123', nonce: 'one-use-proof' })).toEqual({ subject: '123' });
    const [url, options] = (fetcher as jest.Mock).mock.calls[0];
    expect(url).toBe('https://graph.oculus.com/user_nonce_validate');
    expect(options.body.get('user_id')).toBe('123');
    expect(options.body.get('nonce')).toBe('one-use-proof');
  });
  it('refuses invalid proofs', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({ is_valid: false }),
    })) as unknown as typeof fetch;
    const verify = createMetaUserProofVerifier({ appId: 'app', appSecret: 'secret', fetcher });
    await expect(verify({ userId: '123', nonce: 'not-valid' })).rejects.toThrow(
      /verification failed/
    );
  });
  it('requires both identity components', () => {
    expect(() => getMetaXRProof({ userId: '', nonce: '123' })).toThrow();
  });
});
