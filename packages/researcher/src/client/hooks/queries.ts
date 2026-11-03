import { useEffect, useRef } from 'react';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  TResearchStatus,
  ResearchJobStatus,
  TResearchJobsResponse,
} from '../../contract/types';
import { researchJobTypeForAgent, ResearchQueryKeys, researchService } from '../../contract';

const LIVE: ReadonlySet<ResearchJobStatus> = new Set([
  'submitted',
  'briefing',
  'researching',
  'drafting',
  'verifying',
]);

/** Polls every 10s while any job is live, and not at all once every job has finished. */
export function researchRefetchInterval(data: TResearchJobsResponse | undefined): number | false {
  return data?.jobs.some((job) => LIVE.has(job.status)) ? 10_000 : false;
}

/** Research on or off for this deployment; read once per session. */
export const useResearchStatusQuery = (
  config?: UseQueryOptions<TResearchStatus>,
): QueryObserverResult<TResearchStatus> =>
  useQuery<TResearchStatus>(
    [ResearchQueryKeys.researchStatus],
    () => researchService.getResearchStatus(),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useResearchJobsQuery = (
  config?: UseQueryOptions<TResearchJobsResponse>,
): QueryObserverResult<TResearchJobsResponse> =>
  useQuery<TResearchJobsResponse>(
    [ResearchQueryKeys.researchJobs],
    () => researchService.getResearchJobs(),
    {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: researchRefetchInterval,
      ...config,
    },
  );

/**
 * Keeps an open research conversation in step with its job. Loading the jobs list once the
 * conversation exists puts a just-submitted job in the Research panel, which shares this
 * query; when the job finishes, the server-written report message is fetched into the
 * conversation. Idle (no request) for ordinary agents and unsaved conversations.
 */
export function useResearchConversationSync(conversationId?: string, agentId?: string): void {
  const queryClient = useQueryClient();
  const enabled =
    researchJobTypeForAgent(agentId) != null &&
    conversationId != null &&
    conversationId !== Constants.NEW_CONVO;
  const { data } = useResearchJobsQuery({ enabled });
  const status = data?.jobs.find((job) => job.conversationId === conversationId)?.status;
  const previous = useRef<ResearchJobStatus | undefined>(undefined);

  useEffect(() => {
    const wasLive = previous.current != null && LIVE.has(previous.current);
    previous.current = status;
    if (enabled && wasLive && status != null && !LIVE.has(status)) {
      queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
    }
  }, [enabled, status, conversationId, queryClient]);
}
