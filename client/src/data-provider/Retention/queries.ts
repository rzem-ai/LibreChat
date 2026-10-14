import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { Agent, TSkill } from 'librechat-data-provider';
import store from '~/store';

export type RetentionResourceType = 'agent' | 'skill';

const EXPIRING_SOON_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function useGetResourcesExpiringSoonQuery(
  resourceType: RetentionResourceType,
  config?: UseQueryOptions<Agent[] | TSkill[], unknown>,
): QueryObserverResult<Agent[] | TSkill[], unknown> {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  const queryKey =
    resourceType === 'agent' ? QueryKeys.agentsExpiringSoon : QueryKeys.skillsExpiringSoon;
  return useQuery<Agent[] | TSkill[], unknown>(
    [queryKey],
    async () => {
      if (resourceType === 'agent') {
        return (await dataService.getAgentsExpiringSoon()).agents;
      }
      return (await dataService.getSkillsExpiringSoon()).skills;
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: EXPIRING_SOON_REFETCH_INTERVAL_MS,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
}
