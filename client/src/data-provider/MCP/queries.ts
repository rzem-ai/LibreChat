import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/**
 * Hook for fetching all accessible MCP servers with permission metadata
 */
export const useMCPServersQuery = <TData = t.MCPServersListResponse>(
  config?: UseQueryOptions<t.MCPServersListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPServersListResponse, unknown, TData>(
    [QueryKeys.mcpServers],
    () => dataService.getMCPServers(),
    {
      staleTime: 30 * 1000, // 30 seconds — short enough to pick up servers that finish initializing after first load
      refetchOnWindowFocus: true,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for fetching MCP-specific tools
 * @param config - React Query configuration
 * @returns MCP servers with their tools
 */
export const useMCPToolsQuery = <TData = t.MCPServersResponse>(
  config?: UseQueryOptions<t.MCPServersResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPServersResponse, unknown, TData>(
    [QueryKeys.mcpTools],
    () => dataService.getMCPTools(),
    {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      staleTime: 5 * 60 * 1000,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      ...config,
    },
  );
};

/**
 * Deloitte Custom Change: MCP Gateway toolset metadata (user-friendly description,
 * use cases, access, limitations) for the connector tooltip.
 */
export const useMCPToolsetsQuery = <TData = t.MCPToolsetsResponse>(
  config?: UseQueryOptions<t.MCPToolsetsResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPToolsetsResponse, unknown, TData>(
    [QueryKeys.mcpToolsets],
    () => dataService.getMCPToolsets(),
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes, matches the backend cache TTL
      ...config,
    },
  );
};
