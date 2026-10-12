jest.mock('@expo-pico/account', () => ({
  isAccountAvailable: jest.fn(() => true),
  sendAuthScopesRequest: jest.fn(async () => ({ authCode: 'verified-code-123' })),
}));
import { getPicoXRProof } from '../pico';
import { isAccountAvailable, sendAuthScopesRequest } from '@expo-pico/account';

describe('PICO proof adapter', () => {
  it('returns the auth code for backend verification, not an unverified user id', async () => {
    expect(await getPicoXRProof(['profile'])).toEqual({
      provider: 'pico',
      authCode: 'verified-code-123',
    });
    expect(sendAuthScopesRequest).toHaveBeenCalledWith(['profile'], 'auth-code');
  });
  it('fails closed without a PICO account module', async () => {
    (isAccountAvailable as jest.Mock).mockReturnValueOnce(false);
    await expect(getPicoXRProof()).rejects.toThrow(/unavailable/);
  });
  it('rejects an empty authorization code', async () => {
    (sendAuthScopesRequest as jest.Mock).mockResolvedValueOnce({ authCode: '' });
    await expect(getPicoXRProof()).rejects.toThrow(/authorization code/);
  });
});
