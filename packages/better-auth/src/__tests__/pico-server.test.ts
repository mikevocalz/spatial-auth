import { createPicoServerVerifier } from '../pico-server';
const options = {
  expectedAppId: 'pico-app-123',
  now: () => 1000,
  exchangeAndConsume: jest.fn(async () => ({
    openUid: 'pico-openuid-001',
    appId: 'pico-app-123',
    codeConsumed: true as const,
    expiresAt: 2000
  }))
};
describe('PICO backend verification contract', () => {
  beforeEach(() => options.exchangeAndConsume.mockClear());
  it('accepts only an attested, consumed code scoped to this app', async () => {
    expect(await createPicoServerVerifier(options)('pico-auth-code')).toEqual({
      subject: 'pico-openuid-001', name: undefined
    });
    expect(options.exchangeAndConsume).toHaveBeenCalledWith({
      authCode: 'pico-auth-code', expectedAppId: 'pico-app-123'
    });
  });
  it('rejects incorrect app scope or expired code', async () => {
    await expect(createPicoServerVerifier({ ...options, exchangeAndConsume: async () => ({
      openUid: 'someone', appId: 'another-app', codeConsumed: true, expiresAt: 2000
    }) })('pico-auth-code')).rejects.toThrow('rejected');
    await expect(createPicoServerVerifier({ ...options, exchangeAndConsume: async () => ({
      openUid: 'someone', appId: 'pico-app-123', codeConsumed: true, expiresAt: 999
    }) })('pico-auth-code')).rejects.toThrow('rejected');
  });
  it('rejects failed proof consumption without attempting profile fallback', async () => {
    await expect(createPicoServerVerifier({ ...options, exchangeAndConsume: async () => ({
      openUid: 'someone', appId: 'pico-app-123', codeConsumed: false as true, expiresAt: 2000
    }) })('pico-auth-code')).rejects.toThrow('rejected');
  });
  it('does not exchange blank codes', async () => {
    await expect(createPicoServerVerifier(options)('')).rejects.toThrow('Invalid');
    expect(options.exchangeAndConsume).not.toHaveBeenCalled();
  });
});
