import { logger } from '@librechat/data-schemas';
import type { SubagentCancellationPlan } from '~/agents/subagentThreads';
import type { CheckpointDeletion } from '~/agents/checkpoints/deletion';
import type { PurgeCascadeDeps } from './purgeCascade';
import { purgeConversationCascade } from './purgeCascade';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

type DeleteConvosResult = { conversationIds: string[]; n: number };

function createFakeCheckpointDeletion(initialIds: string[] = []): CheckpointDeletion & {
  rememberedBatches: string[][];
} {
  const ids = new Set(initialIds);
  const rememberedBatches: string[][] = [];
  return {
    rememberedBatches,
    conversationIds: () => [...ids],
    remember: jest.fn(async (conversationIds: readonly string[]) => {
      rememberedBatches.push([...conversationIds]);
      conversationIds.forEach((id) => ids.add(id));
    }),
    cleanup: jest.fn().mockResolvedValue(undefined),
    acknowledge: jest.fn().mockResolvedValue(undefined),
  };
}

function createDeps(
  overrides: Partial<PurgeCascadeDeps<DeleteConvosResult>> = {},
): PurgeCascadeDeps<DeleteConvosResult> & {
  checkpointDeletion: ReturnType<typeof createFakeCheckpointDeletion>;
} {
  const checkpointDeletion = createFakeCheckpointDeletion();
  const cancellationPlan: SubagentCancellationPlan = {
    userId: 'user-1',
    tenantId: undefined,
    conversationIds: ['root-convo'],
    scopes: [],
    leases: [{ conversationId: 'child-1', parentConversationId: 'root-convo', taskId: 'task-1' }],
  };

  const deps: PurgeCascadeDeps<DeleteConvosResult> & {
    checkpointDeletion: ReturnType<typeof createFakeCheckpointDeletion>;
  } = {
    checkpointDeletion,
    openCheckpointDeletion: jest.fn().mockResolvedValue(checkpointDeletion),
    deleteConvos: jest.fn(async (_userId, _filter, options) => {
      await options.beforeDelete(['root-convo']);
      return { conversationIds: ['root-convo'], n: 1 };
    }),
    deleteToolCalls: jest.fn().mockResolvedValue(undefined),
    deleteConvoSharedLinksWithCleanup: jest.fn().mockResolvedValue(undefined),
    planCancellationForConversations: jest.fn().mockResolvedValue(cancellationPlan),
    cancelPlan: jest.fn().mockResolvedValue(1),
    retryPostDeleteCancellation: jest.fn().mockResolvedValue(undefined),
    confirmAgentGenerationsDrained: jest.fn().mockResolvedValue(undefined),
    drainDeletedAgentGenerations: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return deps;
}

describe('purgeConversationCascade', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws when given no conversation ids', async () => {
    const deps = createDeps();

    await expect(purgeConversationCascade('user-1', undefined, [], deps)).rejects.toThrow(
      'purgeConversationCascade requires at least one conversation id',
    );
    expect(deps.openCheckpointDeletion).not.toHaveBeenCalled();
  });

  it('runs the full cascade in order and returns the deduped deleted ids', async () => {
    const deps = createDeps();

    const result = await purgeConversationCascade('user-1', 'tenant-1', ['root-convo'], deps);

    expect(deps.openCheckpointDeletion).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'root-convo',
      deps.checkpointer,
    );
    expect(deps.checkpointDeletion.rememberedBatches[0]).toEqual(['root-convo']);
    expect(deps.planCancellationForConversations).toHaveBeenCalledWith(
      'user-1',
      ['root-convo'],
      'tenant-1',
    );
    expect(deps.cancelPlan).toHaveBeenCalledWith(
      expect.objectContaining({ conversationIds: ['root-convo'] }),
    );
    expect(deps.deleteConvos).toHaveBeenCalledWith(
      'user-1',
      { conversationId: 'root-convo' },
      expect.objectContaining({ allowEmpty: true }),
    );
    expect(deps.confirmAgentGenerationsDrained).toHaveBeenCalledWith(
      'user-1',
      ['root-convo'],
      [],
      'tenant-1',
    );
    expect(deps.retryPostDeleteCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationIds: ['root-convo'] }),
      ['root-convo'],
    );
    expect(deps.drainDeletedAgentGenerations).toHaveBeenCalledWith(
      'user-1',
      ['root-convo'],
      ['task-1'],
      'tenant-1',
      deps.checkpointDeletion,
    );
    expect(deps.checkpointDeletion.cleanup).toHaveBeenCalled();
    expect(deps.deleteToolCalls).toHaveBeenCalledWith('user-1', 'root-convo');
    expect(deps.deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith('user-1', 'root-convo');
    expect(deps.checkpointDeletion.acknowledge).toHaveBeenCalled();

    expect(result).toEqual({
      deletedConversationIds: ['root-convo'],
      dbResponse: { conversationIds: ['root-convo'], n: 1 },
    });
  });

  it('only forwards leases belonging to a deleted conversation to the agent-generation drain', async () => {
    const deps = createDeps();
    const cancellationPlan: SubagentCancellationPlan = {
      userId: 'user-1',
      tenantId: undefined,
      conversationIds: ['root-convo'],
      scopes: [],
      leases: [
        { conversationId: 'root-convo', parentConversationId: 'root-convo', taskId: 'task-kept' },
        {
          conversationId: 'other-convo',
          parentConversationId: 'other-convo',
          taskId: 'task-dropped',
        },
      ],
    };
    deps.planCancellationForConversations = jest.fn().mockResolvedValue(cancellationPlan);

    await purgeConversationCascade('user-1', undefined, ['root-convo'], deps);

    expect(deps.drainDeletedAgentGenerations).toHaveBeenCalledWith(
      'user-1',
      ['root-convo'],
      ['task-kept'],
      undefined,
      deps.checkpointDeletion,
    );
  });

  it('drains with no leases when there is no cancellation plan', async () => {
    const deps = createDeps({
      planCancellationForConversations: jest.fn().mockResolvedValue(null),
    });

    await purgeConversationCascade('user-1', undefined, ['root-convo'], deps);

    expect(deps.retryPostDeleteCancellation).not.toHaveBeenCalled();
    expect(deps.drainDeletedAgentGenerations).toHaveBeenCalledWith(
      'user-1',
      ['root-convo'],
      [],
      undefined,
      deps.checkpointDeletion,
    );
  });

  it('includes conversation ids the checkpoint deletion discovered beyond the root', async () => {
    const deps = createDeps();
    deps.deleteConvos = jest.fn(async (_userId, _filter, options) => {
      await options.beforeDelete(['root-convo', 'child-convo']);
      return { conversationIds: ['root-convo', 'child-convo'], n: 2 };
    });

    const result = await purgeConversationCascade('user-1', undefined, ['root-convo'], deps);

    expect(result.deletedConversationIds.sort()).toEqual(['child-convo', 'root-convo']);
    expect(deps.deleteToolCalls).toHaveBeenCalledWith('user-1', 'child-convo');
    expect(deps.deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith('user-1', 'child-convo');
  });

  it('propagates a deleteConvos failure without acknowledging the checkpoint deletion', async () => {
    const deps = createDeps();
    const error = new Error('db unavailable');
    deps.deleteConvos = jest.fn().mockRejectedValue(error);

    await expect(
      purgeConversationCascade('user-1', undefined, ['root-convo'], deps),
    ).rejects.toThrow(error);

    expect(deps.checkpointDeletion.cleanup).not.toHaveBeenCalled();
    expect(deps.checkpointDeletion.acknowledge).not.toHaveBeenCalled();
  });

  it('logs and swallows a trace deletion hook failure, still acknowledging the deletion', async () => {
    const hookError = new Error('langfuse unavailable');
    const traceDeletionHook = jest.fn().mockRejectedValue(hookError);
    const deps = createDeps({ traceDeletionHook });

    const result = await purgeConversationCascade('user-1', undefined, ['root-convo'], deps);

    expect(traceDeletionHook).toHaveBeenCalledWith(result.deletedConversationIds);
    expect(logger.warn).toHaveBeenCalledWith(
      '[purgeConversationCascade] trace deletion hook failed',
      hookError,
    );
    expect(deps.checkpointDeletion.acknowledge).toHaveBeenCalled();
  });

  it('calls the trace deletion hook with the final deleted ids before acknowledging', async () => {
    const callOrder: string[] = [];
    const traceDeletionHook = jest.fn(async () => {
      callOrder.push('traceDeletionHook');
    });
    const deps = createDeps({ traceDeletionHook });
    (deps.checkpointDeletion.acknowledge as jest.Mock).mockImplementation(async () => {
      callOrder.push('acknowledge');
    });

    await purgeConversationCascade('user-1', undefined, ['root-convo'], deps);

    expect(callOrder).toEqual(['traceDeletionHook', 'acknowledge']);
  });
});
