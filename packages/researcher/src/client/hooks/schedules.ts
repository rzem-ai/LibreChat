import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import type {
  TResearchSchedule,
  ResearchDeliveryChannel,
  TResearchSchedulesResponse,
} from '../../contract/types';
import { ResearchQueryKeys, ResearchMutationKeys, researchService } from '../../contract';

export type UpdateResearchScheduleVariables = {
  scheduleId: string;
  channels: ResearchDeliveryChannel[];
};

export const useResearchSchedulesQuery = (
  config?: UseQueryOptions<TResearchSchedulesResponse>,
): QueryObserverResult<TResearchSchedulesResponse> =>
  useQuery<TResearchSchedulesResponse>(
    [ResearchQueryKeys.researchSchedules],
    () => researchService.getResearchSchedules(),
    { refetchOnWindowFocus: true, ...config },
  );

/** Refreshes the list in `onSettled`, so a refused save shows the stored channels again. */
export const useUpdateResearchScheduleMutation = (
  options?: UseMutationOptions<TResearchSchedule, Error, UpdateResearchScheduleVariables>,
): UseMutationResult<TResearchSchedule, Error, UpdateResearchScheduleVariables> => {
  const queryClient = useQueryClient();
  return useMutation<TResearchSchedule, Error, UpdateResearchScheduleVariables>(
    [ResearchMutationKeys.updateResearchSchedule],
    ({ scheduleId, channels }) => researchService.updateResearchSchedule(scheduleId, { channels }),
    {
      ...options,
      onSettled: (...args) => {
        queryClient.invalidateQueries([ResearchQueryKeys.researchSchedules]);
        options?.onSettled?.(...args);
      },
    },
  );
};
