import { getSelectAllState } from '../useMCPServerManager';
import type { MCPServerDefinition } from '../useMCPServerManager';

function makeConnector(serverName: string): MCPServerDefinition {
  return { serverName, effectivePermissions: 1 } as MCPServerDefinition;
}

describe('getSelectAllState', () => {
  it('reports neither selected when there are no selectable connectors', () => {
    expect(getSelectAllState([], [])).toEqual({ allSelected: false, someSelected: false });
  });

  it('reports neither selected when nothing is selected', () => {
    const connectors = [makeConnector('connector-a'), makeConnector('connector-b')];
    expect(getSelectAllState(connectors, [])).toEqual({ allSelected: false, someSelected: false });
  });

  it('reports someSelected when only a subset is selected', () => {
    const connectors = [makeConnector('connector-a'), makeConnector('connector-b')];
    expect(getSelectAllState(connectors, ['connector-a'])).toEqual({
      allSelected: false,
      someSelected: true,
    });
  });

  it('reports allSelected when every selectable connector is selected', () => {
    const connectors = [makeConnector('connector-a'), makeConnector('connector-b')];
    expect(getSelectAllState(connectors, ['connector-a', 'connector-b'])).toEqual({
      allSelected: true,
      someSelected: false,
    });
  });

  it('is not fooled by a stale/duplicate selected entry into reporting all selected', () => {
    // A naive `selectedNames.length >= connectors.length` check would treat this as "all
    // selected" (2 entries >= 2 connectors), even though 'connector-b' is never selected.
    const connectors = [makeConnector('connector-a'), makeConnector('connector-b')];
    expect(getSelectAllState(connectors, ['connector-a', 'connector-a'])).toEqual({
      allSelected: false,
      someSelected: true,
    });
  });

  it('ignores selected names that are not among the selectable connectors', () => {
    const connectors = [makeConnector('connector-a')];
    expect(getSelectAllState(connectors, ['connector-a', 'some-other-connector'])).toEqual({
      allSelected: true,
      someSelected: false,
    });
  });
});
