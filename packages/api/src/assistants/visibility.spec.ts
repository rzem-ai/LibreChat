// Deloitte Custom Change: covers the visibility precedence used by private Azure avatar access.
import { getAssistantVisibility } from './visibility';

describe('getAssistantVisibility', () => {
  const base = { assistantId: 'asst_1', userId: 'user-1' };

  it.each([
    [{ privateAssistants: true }, 'user-1', 'allowed'],
    [{ privateAssistants: true }, 'user-2', 'author'],
    [{ supportedIds: ['asst_1'] }, undefined, 'allowed'],
    [{ supportedIds: ['asst_2'] }, undefined, 'denied'],
    [{ excludedIds: ['asst_1'] }, undefined, 'denied'],
    [{}, undefined, 'allowed'],
  ])('returns %s visibility for the configured policy', (config, authorId, expected) => {
    expect(getAssistantVisibility({ ...base, config, authorId })).toBe(expected);
  });
});
