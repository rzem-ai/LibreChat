import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { TAgentRenewResponse, TSkillRenewResponse } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { RetentionResourceType } from './queries';

export type RenewResourceMutationOptions = {
  onSuccess?: (
    data: TAgentRenewResponse | TSkillRenewResponse,
    variables: string,
    context?: unknown,
  ) => void;
  onMutate?: (variables: string) => void | Promise<unknown>;
  onError?: (error: unknown, variables: string, context?: unknown) => void;
};

export function useResourceRenewMutation(
  resourceType: RetentionResourceType,
  _options?: RenewResourceMutationOptions,
): UseMutationResult<TAgentRenewResponse | TSkillRenewResponse, unknown, string, unknown> {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options || {};
  const mutationKey = resourceType === 'agent' ? MutationKeys.agentRenew : MutationKeys.skillRenew;
  const expiringSoonKey =
    resourceType === 'agent' ? QueryKeys.agentsExpiringSoon : QueryKeys.skillsExpiringSoon;
  return useMutation<TAgentRenewResponse | TSkillRenewResponse, unknown, string, unknown>(
    [mutationKey],
    {
      mutationFn: (id: string) =>
        resourceType === 'agent' ? dataService.renewAgent(id) : dataService.renewSkill(id),
      ...options,
      onSuccess: (data, id, context) => {
        queryClient.invalidateQueries([expiringSoonKey]);
        onSuccess?.(data, id, context);
      },
    },
  );
}
