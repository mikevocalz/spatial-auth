import { getSnapSpecsProof } from '../snap';

describe('Snap Specs handoff', () => {
  it('requires a backend-issued ticket rather than a user id', () => {
    expect(getSnapSpecsProof('opaque-one-use-ticket-123456789')).toEqual({
      provider: 'snap-specs',
      ticket: 'opaque-one-use-ticket-123456789',
    });
    expect(() => getSnapSpecsProof('snap-user-id')).toThrow(/ticket/);
  });
});
