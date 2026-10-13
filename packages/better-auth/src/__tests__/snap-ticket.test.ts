import { createSnapHandoffVerifier } from '../snap-ticket';
const now=()=>100000;
const valid={subject:'snap-project-user-A',issuer:'https://trusted.snap.example',
projectId:'specs-project-A',audience:'better-auth-app',issuedAt:99000,expiresAt:101000,consumed:true as const};
const base={issuer:valid.issuer,projectId:valid.projectId,audience:valid.audience,now};
describe('Snap Cloud one-time handoff',()=>{
  it.each([NaN, Infinity, -Infinity, 999, 1000.5, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid ticket lifetime (%s)', invalid => {
    expect(() => createSnapHandoffVerifier({ ...base, maximumLifetimeMs: invalid,
      provider: { consumeAndVerify: async () => valid }
    })).toThrow('not configured');
  });
  it('accepts the minimum lifetime with a ticket exactly that long', async () => {
    const verify = createSnapHandoffVerifier({ ...base, maximumLifetimeMs: 1000,
      provider: { consumeAndVerify: async () => ({ ...valid, issuedAt: now() }) }
    });
    await expect(verify('opaque-snap-handoff-ticket-123')).resolves.toEqual({ subject: valid.subject });
  });
  it.each([NaN, Infinity, -Infinity])('rejects tickets when the clock returns %s', async invalid => {
    const verify = createSnapHandoffVerifier({ ...base, now: () => invalid,
      provider: { consumeAndVerify: async () => valid }
    });
    await expect(verify('opaque-snap-handoff-ticket-123')).rejects.toThrow('rejected');
  });
  it('accepts only a verified consumed ticket',async()=>{
    const verify=createSnapHandoffVerifier({...base,provider:{consumeAndVerify:async()=>valid}});
    await expect(verify('opaque-snap-handoff-ticket-123')).resolves.toEqual({subject:'snap-project-user-A'});
  });
  it.each([
    {...valid,projectId:'other-project'},
    {...valid,issuer:'https://other.snap.example'},
    {...valid,audience:'other-app'},
    {...valid,expiresAt:99999},
    {...valid,consumed:false as true},
    {...valid,issuedAt:100001},
  ])('rejects mismatched app/issuer/expired/unconsumed tickets',async invalid=>{
    const verify=createSnapHandoffVerifier({...base,provider:{consumeAndVerify:async()=>invalid}});
    await expect(verify('opaque-snap-handoff-ticket-123')).rejects.toThrow('rejected');
  });
  it('does not accept arbitrary Lens user ids',async()=>{
    const consumeAndVerify=jest.fn();
    await expect(createSnapHandoffVerifier({...base,provider:{consumeAndVerify}})('snapuid')).rejects.toThrow();
    expect(consumeAndVerify).not.toHaveBeenCalled();
  });
  it('fails closed when the trusted service is unavailable',async()=>{
    await expect(createSnapHandoffVerifier({...base,provider:{consumeAndVerify:async()=>{throw new Error('raw secret');}}})('opaque-snap-handoff-ticket-123')).rejects.toThrow('Snap handoff identity rejected');
  });
});
