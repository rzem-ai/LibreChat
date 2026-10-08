import { requiresToolApproval } from './mcpToolClass';

describe('requiresToolApproval', () => {
  /** Deloitte Custom Change: write and destructive gateway classes require human review. */
  it.each(['W1', 'W2', 'W3', 'D'] as const)('requires approval for %s', (toolClass) => {
    expect(requiresToolApproval(toolClass)).toBe(true);
  });

  /** Deloitte Custom Change: read classes and absent classification preserve the un-gated behavior. */
  it.each(['R1', 'R2', 'R3', undefined] as const)(
    'does not require approval for %s',
    (toolClass) => {
      expect(requiresToolApproval(toolClass)).toBe(false);
    },
  );
});
