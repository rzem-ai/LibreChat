import { createMemoryWriteAdmission, gateMemoryWrites } from './memoryWriteAdmission';

describe('automatic memory write admission', () => {
  it('blocks writes until the owning run denies admission for a pending approval', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    const deleteMemory = jest.fn().mockResolvedValue({ ok: true });
    const admission = createMemoryWriteAdmission();
    const gated = gateMemoryWrites({ setMemory, deleteMemory }, admission);
    const setMemoryParams = {
      userId: 'user-1',
      key: 'quote',
      value: 'A proposed value',
      tokenCount: 3,
    };
    const deleteMemoryParams = { userId: 'user-1', key: 'quote' };

    const setResult = gated.setMemory(setMemoryParams);
    const deleteResult = gated.deleteMemory(deleteMemoryParams);
    await Promise.resolve();
    expect(setMemory).not.toHaveBeenCalled();
    expect(deleteMemory).not.toHaveBeenCalled();

    admission.resolve(false);

    await expect(setResult).resolves.toEqual({ ok: false });
    await expect(deleteResult).resolves.toEqual({ ok: false });
    expect(setMemory).not.toHaveBeenCalled();
    expect(deleteMemory).not.toHaveBeenCalled();
  });

  it('forwards automatic writes after the owning run completes without a pause', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    const deleteMemory = jest.fn().mockResolvedValue({ ok: true });
    const admission = createMemoryWriteAdmission();
    const gated = gateMemoryWrites({ setMemory, deleteMemory }, admission);
    const setMemoryParams = {
      userId: 'user-1',
      key: 'quote',
      value: 'Approved value',
      tokenCount: 2,
    };
    const deleteMemoryParams = { userId: 'user-1', key: 'quote' };

    admission.resolve(true);

    await expect(gated.setMemory(setMemoryParams)).resolves.toEqual({ ok: true });
    await expect(gated.deleteMemory(deleteMemoryParams)).resolves.toEqual({ ok: true });
    expect(setMemory).toHaveBeenCalledWith(setMemoryParams);
    expect(deleteMemory).toHaveBeenCalledWith(deleteMemoryParams);
  });
});
