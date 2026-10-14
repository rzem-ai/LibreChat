import { useToastContext } from '@librechat/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { TAgentRenewResponse, TSkillRenewResponse } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { RetentionResourceType } from './queries';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const RENEW_FAILED_KEYS: Record<RetentionResourceType, TranslationKeys> = {
  agent: 'com_agents_expiring_soon_renew_failed',
  skill: 'com_skills_expiring_soon_renew_failed',
};

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
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { onSuccess, onError, ...options } = _options || {};
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
      onError: (error, id, context) => {
        showToast({ message: localize(RENEW_FAILED_KEYS[resourceType]), status: 'error' });
        onError?.(error, id, context);
      },
    },
  );
}
