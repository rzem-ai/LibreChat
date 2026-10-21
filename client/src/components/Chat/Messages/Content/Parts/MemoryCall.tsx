import { useContext, useMemo } from 'react';
import { Brain } from 'lucide-react';
import { MemoryScope, Tools, stripAgentIdSuffix } from 'librechat-data-provider';
import type { PartMetadata, TAttachment, MemoryArtifact } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import { toolPanelSpacingClassName } from '../disclosure';
import { ChatContext } from '~/Providers/ChatContext';
import { useMemoriesQuery } from '~/data-provider';
import useToolCallState from './useToolCallState';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import MemoryInfo from '../MemoryInfo';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
// Deloitte Custom Change: Memory HITL approval UX integration.

type MemoryToolName = 'set_memory' | 'delete_memory';

export function isMemoryFailureOutput(toolName: MemoryToolName, output: string): boolean {
  const trimmed = output.trim();
  if (!trimmed) {
    return false;
  }
  return toolName === 'set_memory'
    ? !/^(?:Memory set for key|Memory saved\b)/i.test(trimmed)
    : !/^Memory deleted(?: for key|\.)/i.test(trimmed);
}

export default function MemoryCall({
  toolName,
  isSubmitting,
  runStepStatus,
  runStepDurationMs,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  hideAttachments = false,
  onExpand,
}: {
  toolName: MemoryToolName;
  initialProgress: number;
  isSubmitting: boolean;
  runStepStatus?: PartMetadata['runStepStatus'];
  runStepDurationMs?: PartMetadata['runStepDurationMs'];
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const isSave = toolName === 'set_memory';
  const memoryKey = useMemo(() => parseJsonField(args, 'key'), [args]);
  const memoryValue = useMemo(() => parseJsonField(args, 'value'), [args]);
  const conversationAgentId = useContext(ChatContext)?.conversation?.agent_id;
  const memoryAgentId =
    conversationAgentId == null ? undefined : stripAgentIdSuffix(conversationAgentId);
  const agentsMap = useAgentsMapContext();
  const agent = memoryAgentId == null ? undefined : agentsMap?.[memoryAgentId];
  // Deloitte Custom Change: Track memory partition state for HITL create/update classification.
  const memoryPartitionKnown = conversationAgentId == null || agent != null;
  const memoryPartitionAgentId =
    agent?.memory_scope === MemoryScope.agent ? memoryAgentId : undefined;
  const {
    data: memoriesData,
    isFetchedAfterMount,
    isError,
  } = useMemoriesQuery({
    enabled: isSave,
    refetchOnMount: 'always',
  });
  // Deloitte Custom Change: Find existing memory to determine update vs create for HITL.
  const existingMemory =
    isSave && isFetchedAfterMount && !isError && memoryPartitionKnown && memoryKey != null
      ? memoriesData?.memories.find(
          (memory) =>
            memory.key === memoryKey && (memory.agentId ?? '') === (memoryPartitionAgentId ?? ''),
        )
      : undefined;
  // Deloitte Custom Change: Differentiate update vs create in progress text for memory HITL.
  let inProgressText: string;
  if (isSave) {
    if (existingMemory) {
      inProgressText = localize('com_ui_memory_approval_update_title');
    } else {
      inProgressText = localize('com_ui_memory_saving');
    }
  } else {
    inProgressText = localize('com_ui_memory_approval_delete_title');
  }
  const hasPanel = !!memoryKey || !!memoryValue;
  const memoryErrors = useMemo(() => {
    const errors: MemoryArtifact[] = [];
    for (const attachment of attachments ?? []) {
      const artifact = attachment[Tools.memory];
      if (artifact?.type === 'error') {
        errors.push(artifact);
      }
    }
    return errors;
  }, [attachments]);
  const memoryFailed = isMemoryFailureOutput(toolName, output) || memoryErrors.length > 0;

  const { showCode, toggleCode, expandStyle, expandRef, phase } = useToolCallState({
    initialProgress,
    isSubmitting,
    output,
    hasInput: hasPanel || memoryFailed || runStepStatus === 'failed',
    onExpand,
    runStepStatus,
    extraError: memoryFailed,
  });
  let finishedText = localize(isSave ? 'com_ui_memory_saved' : 'com_ui_memory_removed');
  if (phase === 'cancelled') {
    finishedText = localize('com_ui_cancelled');
  } else if (phase === 'failed') {
    finishedText = localize('com_ui_memory');
  }

  return (
    <>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          phase={phase}
          onClick={toggleCode}
          inProgressText={inProgressText}
          finishedText={finishedText}
          durationMs={runStepDurationMs}
          subtitle={memoryKey || undefined}
          icon={
            <Brain
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                phase === 'running' && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={hasPanel || phase === 'failed'}
          isExpanded={showCode}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {(hasPanel || phase === 'failed') && (
            <div
              className={cn(
                toolPanelSpacingClassName,
                'overflow-hidden rounded-lg border border-border-light bg-surface-secondary p-3',
              )}
            >
              {phase === 'failed' ? (
                <>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-status-error">
                    {output}
                  </pre>
                  <MemoryInfo memoryArtifacts={memoryErrors} />
                </>
              ) : (
                <>
                  {memoryKey && (
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-secondary">
                      {memoryKey}
                    </div>
                  )}
                  {isSave && memoryValue && (
                    <div className="whitespace-pre-wrap text-sm text-text-primary">
                      {memoryValue}
                    </div>
                  )}
                  {/* Only a completed delete actually removed anything. The
                      panel opens as soon as the key streams in, and the phase
                      can still land on cancelled, so an ungated confirmation
                      claimed the memory was gone while the header said
                      Cancelled. The key above already shows what was tried. */}
                  {!isSave && phase === 'completed' && (
                    <div className="text-sm italic text-text-secondary">
                      {localize('com_ui_memory_deleted')}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </>
  );
}
