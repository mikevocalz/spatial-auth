import { getPicoXRProof, type PicoAccountClient } from '../pico';

describe('PICO proof adapter', () => {
  const makeClient = () => ({
    isAccountAvailable: jest.fn(() => true),
    sendAuthScopesRequest: jest.fn(async () => ({ authCode: 'verified-code-123' })),
  });

  it('returns auth code for server verification, not an unverified ID', async () => {
    const client = makeClient();
    expect(await getPicoXRProof(client, ['profile'])).toEqual({
      provider: 'pico',
      authCode: 'verified-code-123',
    });
    expect(client.sendAuthScopesRequest).toHaveBeenCalledWith(['profile'], 'auth-code');
  });

  it('fails closed on unavailable PICO native module', async () => {
    const client = makeClient();
    client.isAccountAvailable.mockReturnValueOnce(false);
    await expect(getPicoXRProof(client)).rejects.toThrow(/unavailable/);
  });

  it('rejects empty codes', async () => {
    const client: PicoAccountClient = {
      isAccountAvailable: () => true,
      sendAuthScopesRequest: async () => ({ authCode: '' }),
    };
    await expect(getPicoXRProof(client)).rejects.toThrow(/authorization code/);
  });
});
