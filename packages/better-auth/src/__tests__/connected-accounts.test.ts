import { createConnectedAccountsController, getConnectedAccountRows } from '../connected-accounts';
function actions(){
 const links:unknown[]=[];
 return {
   links,
   isAuthenticated:jest.fn(async()=>true),
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
   x.isAuthenticated.mockResolvedValueOnce(false);
   await expect(createConnectedAccountsController(x).connect('pico')).rejects.toMatchObject({code:'SESSION_REQUIRED'});
   expect(x.getPlatformProof).not.toHaveBeenCalled();
 });
 it('returns a deterministic conflict UI code for a provider owned by another user',async()=>{
   const x=actions();
   x.linkSpatialProof.mockRejectedValueOnce({status:409});
   await expect(createConnectedAccountsController(x).connect('meta-horizon')).rejects.toMatchObject({code:'ACCOUNT_CONFLICT'});
 });
});
