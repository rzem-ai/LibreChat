import { renderHook } from '@testing-library/react';
import type { MCPServersListResponse } from 'librechat-data-provider';
import { useMCPServerMaps } from '../useMCPIconMap';

let mockServers: MCPServersListResponse | undefined;
let mockDark: boolean;

jest.mock('~/data-provider', () => ({
  useMCPServersQuery: () => ({ data: mockServers }),
}));

jest.mock('@librechat/client', () => ({
  useTheme: () => ({ theme: 'light' }),
  useMediaQuery: () => false,
  isDark: () => mockDark,
}));

describe('useMCPServerMaps', () => {
  beforeEach(() => {
    mockDark = false;
  });

  it('keys the title and icon maps by normalized server name, not the raw configured name', () => {
    mockServers = {
      'KX Connector': {
        type: 'http',
        url: 'https://kx.example.com',
        serverName: 'KX Connector',
        title: 'KX',
        iconPath: '/kx-icon.png',
      },
    };

    const { result } = renderHook(() => useMCPServerMaps());

    expect(result.current.titleMap.get('KX Connector')).toBeUndefined();
    expect(result.current.titleMap.get('KX_Connector')).toBe('KX');
    expect(result.current.iconMap.get('KX_Connector')).toBe('/kx-icon.png');
  });

  it('selects the light or dark icon path based on the active theme', () => {
    mockServers = {
      kx: {
        type: 'http',
        url: 'https://kx.example.com',
        serverName: 'kx',
        title: 'KX',
        iconPathLight: '/kx-light.png',
        iconPathDark: '/kx-dark.png',
      },
    };

    const { result: lightResult } = renderHook(() => useMCPServerMaps());
    expect(lightResult.current.iconMap.get('kx')).toBe('/kx-light.png');

    mockDark = true;
    const { result: darkResult } = renderHook(() => useMCPServerMaps());
    expect(darkResult.current.iconMap.get('kx')).toBe('/kx-dark.png');
  });

  it('omits servers with no title or icon configured from the respective map', () => {
    mockServers = {
      bare: {
        type: 'http',
        url: 'https://bare.example.com',
        serverName: 'bare',
      },
    };

    const { result } = renderHook(() => useMCPServerMaps());

    expect(result.current.titleMap.has('bare')).toBe(false);
    expect(result.current.iconMap.has('bare')).toBe(false);
  });
});
