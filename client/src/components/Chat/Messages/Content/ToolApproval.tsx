import { useContext, useEffect, useMemo } from 'react';
import { Button, TextareaAutosize } from '@librechat/client';
import { MemoryScope, stripAgentIdSuffix } from 'librechat-data-provider';
import { Check, X, Pencil, MessageSquare, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { boundApprovalLabel, buildApprovalPreview } from '~/components/Chat/approval/preview';
import { useComposerPresentsApproval } from '~/components/Chat/approval/state';
import { useApprovalContext, useResumeSubmit } from './ApprovalContext';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import { ChatContext } from '~/Providers/ChatContext';
import { useMemoriesQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn, logger } from '~/utils';

/**
 * The resume route rejects an `edit` whose `editedArguments` isn't a plain object
 * (`findIncompleteDecisions`), so mirror that here — `JSON.parse` alone also accepts
 * `null`/arrays/primitives, which would enable Submit for a value that can only 400.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type DecisionType = Agents.ToolApprovalDecisionType;

const DECISION_ICON: Record<DecisionType, React.ComponentType<{ className?: string }>> = {
  approve: Check,
  reject: X,
  edit: Pencil,
  respond: MessageSquare,
};

const DECISION_LABEL: Record<DecisionType, TranslationKeys> = {
  approve: 'com_ui_approve',
  reject: 'com_ui_reject',
  edit: 'com_ui_edit',
  respond: 'com_ui_respond',
};

/**
 * Chrome shared by the three decision fields. `TextareaAutosize` renders a bare
 * `textarea`, which preflight leaves at `color: inherit`, so a field that names
 * no colour token draws the typed text in whatever colour it inherits — on the
 * dark theme that was near-black over the `surface-primary` fill, about 1.1:1.
 * The value and the placeholder each name their token, and the boundary is
 * `border-xheavy` so the field reads as a control at WCAG 1.4.11's 3:1
 * (`border-light` measures ~1.4:1 against this fill).
 */
const fieldClasses =
  'w-full resize-none rounded-md border border-border-xheavy bg-surface-primary p-2 text-text-primary placeholder:text-text-secondary';

/** Pretty-print tool args as JSON for the `edit` textarea seed. */
function seedArgs(args: string | Record<string, unknown> | undefined): string {
  if (args == null) {
    return '{}';
  }
  if (typeof args === 'string') {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch (e) {
    logger.error('ToolApproval - failed to stringify args', e);
    return '{}';
  }
}

function getMemoryArguments(
  args: string | Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  let parsed: unknown = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args) as unknown;
    } catch {
      return undefined;
    }
  }
  return isPlainObject(parsed) ? parsed : undefined;
}

function getMemoryKey(args: string | Record<string, unknown> | undefined): string | undefined {
  const key = getMemoryArguments(args)?.key;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : undefined;
}

function getMemoryValue(args: string | Record<string, unknown> | undefined): string | undefined {
  const value = getMemoryArguments(args)?.value;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Renders approve / reject / edit / respond controls for a paused tool call,
 * scoped to the decisions the server allows. Records its decision in the
 * batch {@link useApprovalContext}; the lead card additionally renders the
 * single submit button covering every paused call in the action. When the
 * composer panel presents a non-memory action, a thread card steps back to a
 * request summary; host memory approvals stay detailed and inline.
 */
export default function ToolApproval({
  approval,
  toolCallId,
  args,
  toolName,
  surface = 'thread',
}: {
  approval: NonNullable<Agents.ToolCall['approval']>;
  toolCallId: string;
  args: string | Record<string, unknown> | undefined;
  toolName?: string;
  /** The composer panel owns one batch submit; thread cards keep the lead button. */
  surface?: 'thread' | 'composer';
}) {
  const localize = useLocalize();
  const { actionId, allowed_decisions: allowedDecisions, description } = approval;
  const conversation = useContext(ChatContext)?.conversation;
  const conversationId = conversation?.conversationId;
  const conversationAgentId = conversation?.agent_id;
  const agentsMap = useAgentsMapContext();
  const memoryAgentId =
    conversationAgentId == null ? undefined : stripAgentIdSuffix(conversationAgentId);
  const conversationAgent = memoryAgentId == null ? undefined : agentsMap?.[memoryAgentId];
  const memoryPartitionKnown = conversationAgentId == null || conversationAgent != null;
  const memoryPartitionAgentId =
    conversationAgent?.memory_scope === MemoryScope.agent ? memoryAgentId : undefined;
  const composerPresents = useComposerPresentsApproval(conversationId, actionId);
  const deferToComposer = surface === 'thread' && composerPresents;
  const isMemoryTool = toolName === 'set_memory' || toolName === 'delete_memory';
  const isSetMemory = toolName === 'set_memory';
  const {
    data: memoriesData,
    isFetchedAfterMount,
    isError: memoriesError,
  } = useMemoriesQuery({
    enabled: isSetMemory,
    refetchOnMount: 'always',
  });
  const memoryKey = useMemo(() => getMemoryKey(args), [args]);
  const safeMemoryKey = memoryKey == null ? undefined : boundApprovalLabel(memoryKey, 1024).label;
  const displayMemoryKey = safeMemoryKey?.replace(/_/g, ' ');
  const memoryValue = useMemo(() => getMemoryValue(args), [args]);
  const safeMemoryValue =
    memoryValue == null ? undefined : boundApprovalLabel(memoryValue, 16 * 1024);
  const memoriesAreFresh = isFetchedAfterMount && !memoriesError && memoriesData != null;
  const matchingMemory =
    memoriesAreFresh && memoryPartitionKnown && memoryKey != null
      ? memoriesData?.memories.find(
          (memory) =>
            memory.key === memoryKey && (memory.agentId ?? '') === (memoryPartitionAgentId ?? ''),
        )
      : undefined;
  let memoryWriteKind: 'unknown' | 'create' | 'update' = 'unknown';
  if (memoriesAreFresh && memoryPartitionKnown && memoryKey != null) {
    memoryWriteKind = matchingMemory ? 'update' : 'create';
  }
  const memoryPreview = useMemo(() => {
    if (!isMemoryTool) {
      return null;
    }
    return buildApprovalPreview({
      name: toolName ?? 'memory',
      arguments: args ?? {},
      tool_call_id: toolCallId,
    });
  }, [args, isMemoryTool, toolCallId, toolName]);
  const {
    registerToolCall,
    unregisterToolCall,
    setDecision,
    getDecision,
    getDecisionDraft,
    setDecisionDraft,
    isReady,
    getStatus,
    getLeadToolCallId,
    getRegisteredCount,
  } = useApprovalContext();
  const { submitToolApproval } = useResumeSubmit();

  const retainedDecision = getDecision(actionId, toolCallId);
  const initialDecision =
    retainedDecision != null && allowedDecisions.includes(retainedDecision.decision)
      ? retainedDecision
      : undefined;
  const initialEditText =
    initialDecision?.decision === 'edit'
      ? (JSON.stringify(initialDecision.editedArguments, null, 2) ?? '{}')
      : seedArgs(args);
  const decisionDraft = getDecisionDraft(actionId, toolCallId) ?? {
    active: initialDecision?.decision ?? null,
    editText: initialEditText,
    responseText:
      initialDecision?.decision === 'respond' ? (initialDecision.responseText ?? '') : '',
    reason: initialDecision?.decision === 'reject' ? (initialDecision.reason ?? '') : '',
  };
  const { active, editText, responseText, reason } = decisionDraft;
  const updateDecisionDraft = (updates: Partial<typeof decisionDraft>) =>
    setDecisionDraft(actionId, toolCallId, { ...decisionDraft, ...updates });

  useEffect(() => {
    registerToolCall(actionId, toolCallId);
    // Drop the registration when this card unmounts (e.g. the tool resolved and the
    // card was replaced) so a stale entry can't keep the batch's `isReady` false.
    return () => unregisterToolCall(actionId, toolCallId);
  }, [registerToolCall, unregisterToolCall, actionId, toolCallId]);

  const status = getStatus(actionId);
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';
  const safeDescription =
    description == null ? undefined : boundApprovalLabel(description, 1024).label;
  let memoryApprovalTitle: TranslationKeys;
  let memoryApprovalDescription: TranslationKeys;
  if (!isSetMemory) {
    memoryApprovalTitle = 'com_ui_memory_approval_delete_title';
    memoryApprovalDescription = 'com_ui_memory_approval_delete_description';
  } else if (memoryWriteKind === 'create') {
    memoryApprovalTitle = 'com_ui_memory_approval_create_title';
    memoryApprovalDescription = 'com_ui_memory_approval_create_description';
  } else if (memoryWriteKind === 'update') {
    memoryApprovalTitle = 'com_ui_memory_approval_update_title';
    memoryApprovalDescription = 'com_ui_memory_approval_update_description';
  } else {
    memoryApprovalTitle = 'com_ui_memory_approval_set_title';
    memoryApprovalDescription = 'com_ui_memory_approval_set_description';
  }

  let memoryContentPreview: React.ReactNode;
  if (toolName === 'delete_memory' && displayMemoryKey != null) {
    memoryContentPreview = (
      <div className="rounded-lg border border-status-error-border bg-status-error-subtle p-3">
        <p className="text-xs text-status-error">{localize('com_ui_memory_delete_if_approved')}</p>
        <p className="mt-1 break-words font-mono text-sm text-text-destructive">
          <del className="text-text-destructive line-through decoration-2">{displayMemoryKey}</del>
        </p>
      </div>
    );
  } else if (toolName === 'set_memory' && displayMemoryKey != null) {
    memoryContentPreview = (
      <div className="space-y-2 rounded-lg border border-border-light bg-surface-tertiary p-3">
        <div>
          <p className="text-xs font-medium text-text-secondary">
            {localize('com_ui_memory_topic')}
          </p>
          <p className="break-words text-sm font-medium text-text-primary">{displayMemoryKey}</p>
        </div>
        {safeMemoryValue != null && (
          <div>
            <p className="text-xs font-medium text-text-secondary">
              {localize('com_ui_memory_information_to_remember')}
            </p>
            <p className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-sm text-text-primary">
              {safeMemoryValue.label}
            </p>
            {safeMemoryValue.truncated && (
              <p className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_memory_value_preview_truncated')}
              </p>
            )}
          </div>
        )}
      </div>
    );
  } else {
    memoryContentPreview = (
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-light bg-surface-tertiary p-3 font-mono text-xs text-text-primary">
        {memoryPreview?.body || localize('com_ui_no_arguments')}
      </pre>
    );
  }

  /** Recompute and store this card's decision whenever inputs change. A null
   *  resolution (e.g. invalid edit JSON) clears it so submit stays disabled. */
  useEffect(() => {
    if (locked) {
      return;
    }
    if (active == null) {
      setDecision(actionId, toolCallId, null);
      return;
    }
    if (active === 'approve') {
      setDecision(actionId, toolCallId, { tool_call_id: toolCallId, decision: 'approve' });
      return;
    }
    if (active === 'reject') {
      setDecision(actionId, toolCallId, {
        tool_call_id: toolCallId,
        decision: 'reject',
        reason: reason.trim() || undefined,
      });
      return;
    }
    if (active === 'respond') {
      const trimmed = responseText.trim();
      setDecision(
        actionId,
        toolCallId,
        trimmed.length > 0
          ? { tool_call_id: toolCallId, decision: 'respond', responseText: trimmed }
          : null,
      );
      return;
    }
    if (active === 'edit') {
      try {
        const parsed = JSON.parse(editText) as unknown;
        setDecision(
          actionId,
          toolCallId,
          isPlainObject(parsed)
            ? { tool_call_id: toolCallId, decision: 'edit', editedArguments: parsed }
            : null,
        );
      } catch {
        setDecision(actionId, toolCallId, null);
      }
    }
  }, [active, editText, responseText, reason, locked, setDecision, actionId, toolCallId]);

  const editIsValid = useMemo(() => {
    if (active !== 'edit') {
      return true;
    }
    try {
      return isPlainObject(JSON.parse(editText));
    } catch {
      return false;
    }
  }, [active, editText]);

  const isLead = getLeadToolCallId(actionId) === toolCallId;
  const count = getRegisteredCount(actionId);
  const ready = isReady(actionId);

  const submitLabel = useMemo(() => {
    if (status === 'submitting') {
      return localize('com_ui_submitting');
    }
    if (count > 1) {
      return localize('com_ui_submit_decisions', { 0: count });
    }
    return localize('com_ui_submit');
  }, [status, count, localize]);

  if (status === 'submitted') {
    return null;
  }

  const descriptionNode = safeDescription != null && safeDescription.length > 0 && (
    <p className="text-sm text-text-secondary">{safeDescription}</p>
  );

  if (deferToComposer) {
    return (
      <div
        className="my-2 flex w-full flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-3"
        data-testid="tool-approval"
        data-tool-call-id={toolCallId}
      >
        {descriptionNode}
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <ShieldQuestion className="size-4 shrink-0" aria-hidden="true" />
          {localize('com_ui_approval_review_in_composer')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="my-2 flex w-full flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-3"
      data-testid="tool-approval"
      data-tool-call-id={toolCallId}
    >
      {descriptionNode}
      {memoryPreview != null && (
        <>
          <div className="rounded-lg border border-border-light bg-surface-tertiary p-3">
            <p className="text-sm font-medium text-text-primary">{localize(memoryApprovalTitle)}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {localize(memoryApprovalDescription)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-secondary">
              {localize(
                toolName === 'delete_memory'
                  ? 'com_ui_memory_delete_target'
                  : 'com_ui_memory_proposed',
              )}
            </p>
            {memoryContentPreview}
          </div>
          <details className="rounded-lg border border-border-light bg-surface-tertiary p-2 text-xs text-text-secondary">
            <summary className="cursor-pointer select-none font-medium">
              {localize('com_ui_memory_view_technical_details')}
            </summary>
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-secondary p-3 font-mono text-xs text-text-primary">
              {memoryPreview.body || localize('com_ui_no_arguments')}
            </pre>
            {memoryPreview.truncated && (
              <p className="mt-1">{localize('com_ui_preview_truncated')}</p>
            )}
          </details>
          {toolName === 'set_memory' && (
            <p
              className="flex items-start gap-1.5 rounded-lg border border-border-light bg-surface-tertiary p-2 text-xs text-text-warning"
              role="note"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {localize('com_ui_memory_sensitive_data_warning')}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {allowedDecisions.map((decision) => {
          const Icon = DECISION_ICON[decision];
          return (
            <Button
              key={decision}
              size="sm"
              variant={active === decision ? 'default' : 'outline'}
              disabled={locked}
              aria-pressed={active === decision}
              onClick={() => updateDecisionDraft({ active: active === decision ? null : decision })}
              className="inline-flex items-center gap-1.5"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {localize(DECISION_LABEL[decision])}
            </Button>
          );
        })}
      </div>

      {active === 'edit' && (
        <div className="flex flex-col gap-1">
          <TextareaAutosize
            value={editText}
            disabled={locked}
            onChange={(e) => updateDecisionDraft({ editText: e.target.value })}
            minRows={3}
            maxRows={16}
            className={cn(fieldClasses, 'font-mono text-xs', !editIsValid && 'border-red-500')}
            aria-label={localize('com_ui_edit')}
          />
          {!editIsValid && (
            <span className="text-xs text-text-warning">{localize('com_ui_invalid_json')}</span>
          )}
        </div>
      )}

      {active === 'respond' && (
        <TextareaAutosize
          value={responseText}
          disabled={locked}
          onChange={(e) => updateDecisionDraft({ responseText: e.target.value })}
          minRows={2}
          maxRows={12}
          placeholder={localize('com_ui_tool_response_placeholder')}
          className={cn(fieldClasses, 'text-sm')}
          aria-label={localize('com_ui_respond')}
        />
      )}

      {active === 'reject' && (
        <TextareaAutosize
          value={reason}
          disabled={locked}
          onChange={(e) => updateDecisionDraft({ reason: e.target.value })}
          minRows={1}
          maxRows={6}
          placeholder={localize('com_ui_reject_reason_placeholder')}
          className={cn(fieldClasses, 'text-sm')}
          aria-label={localize('com_ui_reject')}
        />
      )}

      {surface === 'thread' && isLead && (
        <div className="mt-1 flex items-center gap-3">
          <Button
            size="sm"
            variant="submit"
            disabled={!ready || locked}
            onClick={() => submitToolApproval(actionId)}
          >
            {submitLabel}
          </Button>
          {status === 'expired' && (
            <span className="flex items-center text-xs text-text-warning">
              <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_ui_approval_expired')}
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center text-xs text-text-warning">
              <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_ui_approval_error')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
