import type { MCPServerStatus } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '../MCPServerStatusIcon';
import { shouldShowActionButton } from '../mcpServerUtils';

function buildStatusIconProps(
  serverStatus: MCPServerStatus,
  overrides: Partial<MCPServerStatusIconProps> = {},
): MCPServerStatusIconProps {
  return {
    serverName: 'test-server',
    serverStatus,
    onConfigClick: jest.fn(),
    isInitializing: false,
    canCancel: false,
    onCancel: jest.fn(),
    hasCustomUserVars: false,
    ...overrides,
  };
}

describe('shouldShowActionButton', () => {
  it('hides the button for a disconnected OBO server with no custom vars', () => {
    const props = buildStatusIconProps({
      requiresOAuth: false,
      connectionState: 'disconnected',
      configuredObo: true,
    });

    expect(shouldShowActionButton(props)).toBe(false);
  });

  it('shows the button for a disconnected OBO server that still needs custom vars', () => {
    const props = buildStatusIconProps(
      { requiresOAuth: false, connectionState: 'disconnected', configuredObo: true },
      { hasCustomUserVars: true },
    );

    expect(shouldShowActionButton(props)).toBe(true);
  });

  it('shows the button for a disconnected non-OBO server (unchanged behavior)', () => {
    const props = buildStatusIconProps({
      requiresOAuth: false,
      connectionState: 'disconnected',
      configuredObo: false,
    });

    expect(shouldShowActionButton(props)).toBe(true);
  });

  it('shows the button on error regardless of OBO configuration', () => {
    const props = buildStatusIconProps({
      requiresOAuth: false,
      connectionState: 'error',
      configuredObo: true,
    });

    expect(shouldShowActionButton(props)).toBe(true);
  });
});
