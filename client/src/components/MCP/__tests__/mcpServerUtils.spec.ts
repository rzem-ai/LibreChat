// Deloitte Custom Change: tests
import { shouldShowActionButton } from '../mcpServerUtils';
import type { MCPServerStatusIconProps } from '../MCPServerStatusIcon';

const baseProps = (
  overrides: Partial<MCPServerStatusIconProps> = {},
): MCPServerStatusIconProps => ({
  serverName: 'test-server',
  onConfigClick: () => {},
  isInitializing: false,
  canCancel: false,
  onCancel: () => {},
  ...overrides,
});

describe('shouldShowActionButton', () => {
  it('returns false when there is no status information', () => {
    expect(shouldShowActionButton(null)).toBe(false);
    expect(shouldShowActionButton(baseProps())).toBe(false);
  });

  it('shows the connect button for a disconnected non-OBO server', () => {
    expect(
      shouldShowActionButton(
        baseProps({ serverStatus: { connectionState: 'disconnected', requiresOAuth: true } }),
      ),
    ).toBe(true);
  });

  it('shows the connect button for an errored non-OBO server', () => {
    expect(
      shouldShowActionButton(
        baseProps({ serverStatus: { connectionState: 'error', requiresOAuth: false } }),
      ),
    ).toBe(true);
  });

  it('hides the connect button for a disconnected OBO server — the checkbox connects it transparently', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'disconnected', requiresOAuth: true },
          isObo: true,
        }),
      ),
    ).toBe(false);
  });

  it('hides the connect button for an errored OBO server', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'error', requiresOAuth: false },
          isObo: true,
        }),
      ),
    ).toBe(false);
  });

  it('only shows the configure button for connected servers with custom vars', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'connected', requiresOAuth: false },
          hasCustomUserVars: true,
        }),
      ),
    ).toBe(true);
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'connected', requiresOAuth: false },
          hasCustomUserVars: false,
        }),
      ),
    ).toBe(false);
  });
});
