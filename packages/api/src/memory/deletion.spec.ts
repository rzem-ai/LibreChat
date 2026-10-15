import { Types } from 'mongoose';
import type { DeleteClaimedMemoryDeps } from './deletion';
import { deleteClaimedMemory } from './deletion';

describe('deleteClaimedMemory', () => {
  const memoryId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const purgeClaimId = 'claim-1';

  function makeDeps(overrides: Partial<DeleteClaimedMemoryDeps> = {}): DeleteClaimedMemoryDeps {
    return {
      confirmMemoryPurgeEligible: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId(memoryId) }),
      deleteMemoryById: jest.fn().mockResolvedValue({ ok: true }),
      ...overrides,
    };
  }

  it('deletes the memory once the fence re-check confirms it is still eligible', async () => {
    const deps = makeDeps();

    const result = await deleteClaimedMemory(memoryId, { purgeClaimId, userId }, deps);

    expect(result).toBe(true);
    expect(deps.confirmMemoryPurgeEligible).toHaveBeenCalledWith(
      memoryId,
      purgeClaimId,
      expect.any(Date),
    );
    expect(deps.deleteMemoryById).toHaveBeenCalledWith(memoryId, userId);
  });

  it('aborts without deleting when the fence re-check finds the memory no longer eligible', async () => {
    const deps = makeDeps({ confirmMemoryPurgeEligible: jest.fn().mockResolvedValue(null) });

    const result = await deleteClaimedMemory(memoryId, { purgeClaimId, userId }, deps);

    expect(result).toBe(false);
    expect(deps.deleteMemoryById).not.toHaveBeenCalled();
  });
});
