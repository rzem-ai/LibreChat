import { logger } from '@librechat/data-schemas';

import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { SubagentCancellationPlan } from '~/agents/subagentThreads';
import type { CheckpointDeletion } from '~/agents/checkpoints/deletion';

export interface PurgeCascadeDeps<TDeleteConvosResult extends { conversationIds: string[] }> {
  checkpointer?: TCheckpointerConfig;
  openCheckpointDeletion: (
    userId: string,
    tenantId: string | undefined,
    rootConversationId: string | undefined,
    cfg?: TCheckpointerConfig,
  ) => Promise<CheckpointDeletion>;
  deleteConvos: (
    userId: string,
    filter: { conversationId: string },
    options: {
      allowEmpty: boolean;
      beforeDelete: (conversationIds: string[]) => Promise<void>;
    },
  ) => Promise<TDeleteConvosResult>;
  deleteToolCalls: (userId: string, conversationId: string) => Promise<unknown>;
  deleteConvoSharedLinksWithCleanup: (userId: string, conversationId: string) => Promise<unknown>;
  planCancellationForConversations: (
    userId: string,
    conversationIds: Iterable<string>,
    tenantId?: string,
  ) => Promise<SubagentCancellationPlan>;
  cancelPlan: (
    plan: SubagentCancellationPlan,
    removedConversationIds?: Iterable<string>,
  ) => Promise<number>;
  retryPostDeleteCancellation: (
    cancellationPlan: SubagentCancellationPlan,
    deletedConversationIds: string[],
  ) => Promise<void>;
  confirmAgentGenerationsDrained: (
    userId: string,
    conversationIds: string[],
    leaseTaskIds: string[],
    tenantId: string | undefined,
  ) => Promise<void>;
  drainDeletedAgentGenerations: (
    userId: string,
    conversationIds: string[],
    leaseTaskIds: string[],
    tenantId: string | undefined,
    deletion: CheckpointDeletion,
  ) => Promise<void>;
  /** RET-09 seam: invoked after the cascade delete is confirmed and before the durable
   * checkpoint-deletion intent is acknowledged. Unbound today; a future Langfuse trace
   * deletion hook plugs in here without touching the cascade itself. */
  traceDeletionHook?: (conversationIds: string[]) => Promise<void>;
}

export interface PurgeCascadeResult<TDeleteConvosResult> {
  deletedConversationIds: string[];
  dbResponse: TDeleteConvosResult;
}

/**
 * Deletes a single conversation root and everything owned by its cascade: subagent
 * thread descendants, in-flight generations, tool calls, shared links and checkpoints.
 * Shared by the `DELETE /` route and the conversation purge sweep worker so both
 * callers run the exact same ordering and failure handling.
 */
export async function purgeConversationCascade<
  TDeleteConvosResult extends { conversationIds: string[] },
>(
  userId: string,
  tenantId: string | undefined,
  conversationIds: string[],
  deps: PurgeCascadeDeps<TDeleteConvosResult>,
): Promise<PurgeCascadeResult<TDeleteConvosResult>> {
  const [rootConversationId] = conversationIds;
  if (!rootConversationId) {
    throw new Error('purgeConversationCascade requires at least one conversation id');
  }

  const checkpointDeletion = await deps.openCheckpointDeletion(
    userId,
    tenantId,
    rootConversationId,
    deps.checkpointer,
  );
  await checkpointDeletion.remember([rootConversationId]);
  const cancellationPlan = await deps.planCancellationForConversations(
    userId,
    checkpointDeletion.conversationIds(),
    tenantId,
  );
  await deps.cancelPlan(cancellationPlan);
  const dbResponse = await deps.deleteConvos(
    userId,
    { conversationId: rootConversationId },
    {
      allowEmpty: true,
      beforeDelete: async (ids) => {
        await checkpointDeletion.remember(ids);
        await deps.confirmAgentGenerationsDrained(userId, ids, [], tenantId);
        await checkpointDeletion.remember(ids);
      },
    },
  );

  let deletedConversationIds = [
    ...new Set([
      ...(dbResponse.conversationIds ?? [rootConversationId]),
      ...checkpointDeletion.conversationIds(),
    ]),
  ];

  /** Root deletion closes new child admission. Replay the plan to catch a task
   * admitted after the first pass but before that fence, extended with the cascade
   * this deletion reported. */
  if (cancellationPlan != null && deletedConversationIds.length > 0) {
    /** Confirm late children stopped before payload cleanup. A failed retry leaves
     * durable deletion intent available even though conversation deletion committed. */
    await deps.retryPostDeleteCancellation(cancellationPlan, deletedConversationIds);
    await deps.drainDeletedAgentGenerations(
      userId,
      deletedConversationIds,
      cancellationPlan.leases
        .filter(
          (lease) =>
            deletedConversationIds.includes(lease.parentConversationId) ||
            deletedConversationIds.includes(lease.conversationId),
        )
        .map((lease) => lease.taskId),
      tenantId,
      checkpointDeletion,
    );
  } else if (deletedConversationIds.length > 0) {
    await deps.drainDeletedAgentGenerations(
      userId,
      deletedConversationIds,
      [],
      tenantId,
      checkpointDeletion,
    );
  }

  deletedConversationIds = [
    ...new Set([...deletedConversationIds, ...checkpointDeletion.conversationIds()]),
  ];

  await checkpointDeletion.cleanup();

  await Promise.all(deletedConversationIds.map((id) => deps.deleteToolCalls(userId, id)));
  await Promise.all(
    deletedConversationIds.map((id) => deps.deleteConvoSharedLinksWithCleanup(userId, id)),
  );

  if (deps.traceDeletionHook) {
    try {
      await deps.traceDeletionHook(deletedConversationIds);
    } catch (error) {
      logger.warn('[purgeConversationCascade] trace deletion hook failed', error);
    }
  }

  await checkpointDeletion.acknowledge();

  return { deletedConversationIds, dbResponse };
}
