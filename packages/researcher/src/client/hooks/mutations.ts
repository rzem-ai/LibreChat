import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import type { TResearchJob } from '../../contract/types';
import { ResearchQueryKeys, ResearchMutationKeys, researchService } from '../../contract';

/** Invalidates in `onSettled`: a refused cancel still means the list may be stale. */
export const useCancelResearchJobMutation = (
  options?: UseMutationOptions<TResearchJob, Error, string>,
): UseMutationResult<TResearchJob, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation<TResearchJob, Error, string>(
    [ResearchMutationKeys.cancelResearchJob],
    (jobId: string) => researchService.cancelResearchJob(jobId),
    {
      ...options,
      onSettled: (...args) => {
        queryClient.invalidateQueries([ResearchQueryKeys.researchJobs]);
        options?.onSettled?.(...args);
      },
    },
  );
};
