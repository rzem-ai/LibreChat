import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';

export function useMCPConnectionStatus({ enabled }: { enabled?: boolean } = {}) {
  const { data, isLoading } = useMCPConnectionStatusQuery({
    enabled,
  });

  return {
    connectionStatus: data?.connectionStatus,
    // Deloitte Custom Change: Exposes loading state so callers can avoid acting on a
    // not-yet-populated connectionStatus.
    isConnectionStatusLoading: isLoading,
  };
}
