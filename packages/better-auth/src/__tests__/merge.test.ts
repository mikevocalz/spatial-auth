import { createMergeCoordinator, type StoredMergeIntent, type MergeTransaction } from '../merge';
const now=100000;
const intent:StoredMergeIntent={id:'intent',targetUserId:'userA',sourceUserId:'userB',
state:'confirmed',expiresAt:110000,targetReauthenticatedAt:99000,sourceProofVerifiedAt:99500,
confirmedAt:99800,idempotencyKey:'idempotency'};
const input={intentId:'intent',idempotencyKey:'idempotency',currentBetterAuthUserId:'userA'};
function mockStore(patch:Partial<StoredMergeIntent>={}){
  const calls:string[]=[];
  const tx:MergeTransaction={
    getIntentForUpdate:async()=>({...intent,...patch}),
    assertEligible:async()=>{calls.push('eligible')},
    transferAllowedDomainRecords:async()=>{calls.push('domain')},
    transferVerifiedProviderBindings:async()=>{calls.push('provider')},
    commitAndQueueSessionRevocation:async()=>{calls.push('commit-outbox')}
  };
  return {calls,tx,store:{withTransaction:async<T>(fn:(x:MergeTransaction)=>Promise<T>):Promise<T>=>fn(tx)}};
}
describe('existing Better Auth user merge',()=>{
  it.each([NaN, Infinity, -Infinity, 999, 1000.5, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid proof-age policy (%s)', invalid => {
    const x = mockStore();
    expect(() => createMergeCoordinator(x.store, { maxProofAgeMs: invalid })).toThrow('Invalid merge reauthentication policy');
    expect(() => createMergeCoordinator(x.store, { maxTargetAuthAgeMs: invalid })).toThrow('Invalid merge reauthentication policy');
    expect(x.calls).toEqual([]);
  });
  it('accepts the minimum proof and reauthentication ages, including the boundary', async () => {
    const x = mockStore({ sourceProofVerifiedAt: now - 1000 });
    await expect(createMergeCoordinator(x.store, {
      now: () => now, maxProofAgeMs: 1000, maxTargetAuthAgeMs: 1000,
    }).confirm(input)).resolves.toEqual({ status: 'committed', targetUserId: 'userA' });
    expect(x.calls).toEqual(['eligible', 'domain', 'provider', 'commit-outbox']);
  });
  it.each([
    ['expiresAt', 'EXPIRED'],
    ['confirmedAt', 'NOT_CONFIRMED'],
    ['sourceProofVerifiedAt', 'PROOF_STALE'],
    ['targetReauthenticatedAt', 'PROOF_STALE'],
  ] as const)('rejects malformed %s before any transfer', async (field, code) => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const x = mockStore({ [field]: invalid });
      await expect(createMergeCoordinator(x.store, { now: () => now }).confirm(input)).rejects.toMatchObject({ code });
      expect(x.calls).toEqual([]);
    }
  });
  it.each([NaN, Infinity, -Infinity])('fails closed when the clock returns %s', async invalid => {
    const x = mockStore();
    await expect(createMergeCoordinator(x.store, { now: () => invalid }).confirm(input)).rejects.toMatchObject({ code: 'PROOF_STALE' });
    expect(x.calls).toEqual([]);
  });
  it('requires transaction and ordered host domain handlers',async()=>{
    const x=mockStore();
    const out=await createMergeCoordinator(x.store,{now:()=>now}).confirm(input);
    expect(out).toEqual({status:'committed',targetUserId:'userA'});
    expect(x.calls).toEqual(['eligible','domain','provider','commit-outbox']);
  });
  it('refuses a different signed in Better Auth user',async()=>{
    const x=mockStore();
    await expect(createMergeCoordinator(x.store,{now:()=>now}).confirm({...input,currentBetterAuthUserId:'attacker'})).rejects.toMatchObject({code:'NOT_AUTHORIZED'});
    expect(x.calls).toEqual([]);
  });
  it('rejects stale proof and requires explicit user confirmed intent',async()=>{
    const x=mockStore({sourceProofVerifiedAt:1000});
    await expect(createMergeCoordinator(x.store,{now:()=>now,maxProofAgeMs:1000}).confirm(input)).rejects.toMatchObject({code:'PROOF_STALE'});
    expect(x.calls).toEqual([]);
    const y=mockStore({confirmedAt:now+10});
    await expect(createMergeCoordinator(y.store,{now:()=>now}).confirm(input)).rejects.toMatchObject({code:'NOT_CONFIRMED'});
  });
  it('is idempotent after commit and never reruns domain transfers',async()=>{
    const x=mockStore({state:'committed'});
    expect(await createMergeCoordinator(x.store,{now:()=>now}).confirm(input)).toEqual({
      status:'already-committed',targetUserId:'userA'
    });
    expect(x.calls).toEqual([]);
  });
  it('does not continue when a domain transfer fails',async()=>{
    const x=mockStore();
    x.tx.transferAllowedDomainRecords=async()=>{throw new Error('domain conflict')};
    await expect(createMergeCoordinator(x.store,{now:()=>now}).confirm(input)).rejects.toThrow('domain conflict');
    expect(x.calls).toEqual(['eligible']);
  });
});
