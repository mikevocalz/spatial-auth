import { createConnectedAccountsController, getConnectedAccountRows, type AccountSession, type Provider } from '../connected-accounts';
function actions(){
 const links:unknown[]=[];
 return {
   links,
   getAuthenticatedSession:jest.fn(async(): Promise<AccountSession | null> => ({ userId: 'userA', sessionId: 'sessionA' })),
   listAccounts:jest.fn(async()=>[{providerId:'meta-horizon',accountId:'questA'},{providerId:'google',accountId:'googleA'}]),
   linkGoogle:jest.fn(async()=>undefined),
   getPlatformProof:jest.fn(async(provider:string)=>({provider,nonce:'fresh'})),
   linkSpatialProof:jest.fn(async(proof:unknown)=>{links.push(proof)}),
   unlink:jest.fn(async()=>undefined)
 };
}
describe('headless connected accounts',()=>{
 it('renders all platforms from Better Auth account rows',()=>{
   const rows=getConnectedAccountRows([{providerId:'meta-horizon',accountId:'questA'}],{pico:false});
   expect(rows.find(x=>x.provider==='meta-horizon')).toMatchObject({connected:true,canUnlink:false});
   expect(rows.find(x=>x.provider==='pico')).toMatchObject({available:false,connected:false});
 });
 it('links Google through Better Auth instead of spatial proof endpoint',async()=>{
   const x=actions();
   await createConnectedAccountsController(x).connect('google');
   expect(x.linkGoogle).toHaveBeenCalledTimes(1);
   expect(x.getPlatformProof).not.toHaveBeenCalled();
 });
 it('requests fresh platform proof before linking PICO to current Better Auth user',async()=>{
   const x=actions();
   await createConnectedAccountsController(x).connect('pico');
   expect(x.links).toEqual([{provider:'pico',nonce:'fresh'}]);
 });
 it('never removes last login method',async()=>{
   const x=actions();
   x.listAccounts.mockResolvedValueOnce([{providerId:'meta-horizon',accountId:'questA'}]);
   await expect(createConnectedAccountsController(x).disconnect({providerId:'meta-horizon',accountId:'questA'})).rejects.toMatchObject({code:'LAST_SIGN_IN_METHOD'});
   expect(x.unlink).not.toHaveBeenCalled();
 });
 it('requires existing Better Auth login before any link',async()=>{
   const x=actions();
   x.getAuthenticatedSession.mockResolvedValueOnce(null);
   await expect(createConnectedAccountsController(x).connect('pico')).rejects.toMatchObject({code:'SESSION_REQUIRED'});
   expect(x.getPlatformProof).not.toHaveBeenCalled();
 });
 it('returns a deterministic conflict UI code for a provider owned by another user',async()=>{
   const x=actions();
   x.linkSpatialProof.mockRejectedValueOnce({status:409});
   await expect(createConnectedAccountsController(x).connect('meta-horizon')).rejects.toMatchObject({code:'ACCOUNT_CONFLICT'});
 });
});

describe('connected account operation lifecycle', () => {
 it('rejects a second disconnect while the first account mutation is pending', async () => {
   const x = actions();
   let finish!: () => void;
   const pending = new Promise<void>(resolve => { finish = resolve; });
   x.unlink.mockImplementation(async () => { await pending; return undefined; });
   const controller = createConnectedAccountsController(x);
   const first = controller.disconnect({ providerId: 'meta-horizon', accountId: 'questA' });
   await Promise.resolve();
   await Promise.resolve();
   const second = controller.disconnect({ providerId: 'google', accountId: 'googleA' });
   const outcome = second.then(() => 'allowed', error => error.code);
   await Promise.resolve();
   finish();
   await first;
   expect(await outcome).toBe('OPERATION_IN_PROGRESS');
   expect(x.unlink).toHaveBeenCalledTimes(1);
 });
 it('refuses linking if the authenticated user changes during the native proof dialog', async () => {
   const x = actions();
   const session = { userId: 'userA', sessionId: 'sessionA' };
   const getAuthenticatedSession = jest.fn(async () => session);
   x.getPlatformProof.mockImplementation(async provider => {
     session.userId = 'userB';
     session.sessionId = 'sessionB';
     return { provider, nonce: 'fresh' };
   });
   const sessionActions = { ...x, getAuthenticatedSession };
   const controller = createConnectedAccountsController(sessionActions);
   await expect(controller.connect('pico')).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
   expect(x.linkSpatialProof).not.toHaveBeenCalled();
 });
});


describe('connected account session and recovery guards', () => {
 it.each([
   { userId: 'userA', sessionId: 'rotated-session' },
   null,
 ])('rejects a rotated or missing session after proof acquisition (%j)', async session => {
   const x = actions();
   x.getAuthenticatedSession.mockResolvedValueOnce({ userId: 'userA', sessionId: 'sessionA' }).mockResolvedValueOnce(session);
   await expect(createConnectedAccountsController(x).connect('pico')).rejects.toMatchObject({
     code: session ? 'SESSION_CHANGED' : 'SESSION_REQUIRED',
   });
   expect(x.linkSpatialProof).not.toHaveBeenCalled();
 });
 it('rejects a changed session while loading the account list', async () => {
   const x = actions();
   x.getAuthenticatedSession.mockResolvedValueOnce({ userId: 'userA', sessionId: 'sessionA' })
     .mockResolvedValueOnce({ userId: 'userB', sessionId: 'sessionB' });
   await expect(createConnectedAccountsController(x).disconnect({ providerId: 'google', accountId: 'googleA' }))
     .rejects.toMatchObject({ code: 'SESSION_CHANGED' });
   expect(x.unlink).not.toHaveBeenCalled();
 });
 it('passes the expected session to all mutation adapters', async () => {
   const x = actions();
   const expected = { userId: 'userA', sessionId: 'sessionA' };
   const controller = createConnectedAccountsController(x);
   await controller.connect('google');
   expect(x.linkGoogle).toHaveBeenCalledWith(expected);
   await controller.connect('pico');
   expect(x.linkSpatialProof).toHaveBeenCalledWith({ provider: 'pico', nonce: 'fresh' }, expected);
   await controller.disconnect({ providerId: 'google', accountId: 'googleA' });
   expect(x.unlink).toHaveBeenCalledWith({ providerId: 'google', accountId: 'googleA' }, expected);
 });
 it('does not allow a mutable UI row to change the pending unlink target', async () => {
   const x = actions();
   const account = { providerId: 'google', accountId: 'googleA' };
   x.listAccounts.mockImplementation(async () => {
     account.providerId = 'meta-horizon';
     account.accountId = 'questA';
     return [{ providerId: 'google', accountId: 'googleA' }, { providerId: 'meta-horizon', accountId: 'questA' }];
   });
   await createConnectedAccountsController(x).disconnect(account);
   expect(x.unlink).toHaveBeenCalledWith({ providerId: 'google', accountId: 'googleA' }, expect.anything());
 });
 it('releases its operation guard after a native cancellation', async () => {
   const x = actions();
   x.getPlatformProof.mockRejectedValueOnce(new Error('cancelled'));
   const controller = createConnectedAccountsController(x);
   await expect(controller.connect('pico')).rejects.toThrow('cancelled');
   await controller.connect('google');
   expect(x.linkGoogle).toHaveBeenCalledTimes(1);
 });
 it('rejects a disconnect while a native connect dialog is open', async () => {
   const x = actions();
   let release!: () => void;
   const pending = new Promise<void>(resolve => { release = resolve; });
   x.getPlatformProof.mockImplementation(async provider => { await pending; return { provider, nonce: 'fresh' }; });
   const controller = createConnectedAccountsController(x);
   const first = controller.connect('pico');
   await expect(controller.disconnect({ providerId: 'google', accountId: 'googleA' }))
     .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
   release();
   await first;
   expect(x.unlink).not.toHaveBeenCalled();
 });
 it('normalizes Google ownership conflicts and permits a later retry', async () => {
   const x = actions();
   x.linkGoogle.mockRejectedValueOnce({ status: 409 });
   const controller = createConnectedAccountsController(x);
   await expect(controller.connect('google')).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
   await controller.connect('google');
   expect(x.linkGoogle).toHaveBeenCalledTimes(2);
 });
 it('rejects unsupported runtime provider values before obtaining a proof', async () => {
   const x = actions();
   await expect(createConnectedAccountsController(x).connect('unknown' as Provider))
     .rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER' });
   expect(x.getPlatformProof).not.toHaveBeenCalled();
 });
 it('refuses malformed session identifiers', async () => {
   const x = actions();
   x.getAuthenticatedSession.mockResolvedValueOnce({ userId: 'userA', sessionId: '' });
   await expect(createConnectedAccountsController(x).connect('google')).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
   expect(x.linkGoogle).not.toHaveBeenCalled();
 });
 it('does not count duplicate rows as separate sign-in methods', async () => {
   const x = actions();
   x.listAccounts.mockResolvedValueOnce([{ providerId: 'google', accountId: 'googleA' }, { providerId: 'google', accountId: 'googleA' }]);
   await expect(createConnectedAccountsController(x).disconnect({ providerId: 'google', accountId: 'googleA' }))
     .rejects.toMatchObject({ code: 'LAST_SIGN_IN_METHOD' });
   expect(x.unlink).not.toHaveBeenCalled();
 });
 it('counts distinct account pairs without delimiter collisions', () => {
   const rows = getConnectedAccountRows([{ providerId: 'pico', accountId: 'a:b' }, { providerId: 'pico:a', accountId: 'b' }]);
   expect(rows.find(row => row.provider === 'pico')).toMatchObject({ canUnlink: true });
 });
});
