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

  it('shows the button for a disconnected OBO server that still requires interactive OAuth', () => {
    // A server can be configured for both OBO and OAuth at once; requiresOAuth is the
    // authoritative "needs user action" flag, so silent-connect must not suppress Connect
    // here — the auto-connect effect can't complete this one on its own.
    const props = buildStatusIconProps({
      requiresOAuth: true,
      connectionState: 'disconnected',
      configuredObo: true,
    });

    expect(shouldShowActionButton(props)).toBe(true);
  });

  it('shows the button for a disconnected OBO server when hasCustomUserVars is undefined (not yet resolved to a boolean)', () => {
    // isSilentlyConnectableOboServer requires `hasCustomUserVars === false` via strict
    // equality, so an unresolved `undefined` must fail closed (button shown) rather than
    // being treated the same as a confirmed `false`. Regression test for the bug where
    // MCPConfigDialog computed this prop as `fieldsSchema && Object.keys(fieldsSchema).length > 0`,
    // which evaluates to a falsy non-boolean (`undefined`/`null`) instead of `false` when
    // `fieldsSchema` itself was falsy.
    const props = buildStatusIconProps(
      { requiresOAuth: false, connectionState: 'disconnected', configuredObo: true },
      { hasCustomUserVars: undefined },
    );

    expect(shouldShowActionButton(props)).toBe(true);
  });
});
