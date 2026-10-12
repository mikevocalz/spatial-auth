import { obtainAndroidXRGoogleCredential } from '../google';
describe('Google Android XR credentials', () => {
  it('uses the configured OAuth web client ID and exact server nonce', async () => {
    const client = { getGoogleIdToken: jest.fn(async () => ({ idToken: 'signed-id-token' })) };
    const out = await obtainAndroidXRGoogleCredential(client, {
      webClientId: 'google-web-client-id',
      serverChallengeNonce: 'server-generated-nonce-abcdef'
    });
    expect(out).toEqual({
      provider: 'google', nonce: 'server-generated-nonce-abcdef', idToken: 'signed-id-token'
    });
    expect(client.getGoogleIdToken).toHaveBeenCalledWith('google-web-client-id','server-generated-nonce-abcdef');
  });
  it('fails before native UI without a server-issued challenge', async () => {
    const client={getGoogleIdToken:jest.fn()};
    await expect(obtainAndroidXRGoogleCredential(client,{webClientId:'x',serverChallengeNonce:''})).rejects.toThrow();
    expect(client.getGoogleIdToken).not.toHaveBeenCalled();
  });
  it('rejects a native result without token', async () => {
    await expect(obtainAndroidXRGoogleCredential({
      getGoogleIdToken: async ()=>({idToken:''})
    }, {webClientId:'google',serverChallengeNonce:'abcdef1234567890'})).rejects.toThrow();
  });
});
