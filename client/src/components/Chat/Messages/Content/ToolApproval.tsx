import { useContext, useEffect, useMemo, useState } from 'react';
import { MemoryScope, stripAgentIdSuffix } from 'librechat-data-provider';
import { Button, Input, Label, Textarea, TextareaAutosize } from '@librechat/client';
import {
  Check,
  X,
  Pencil,
  MessageSquare,
  ShieldQuestion,
  TriangleAlert,
  ChevronDown,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
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

/**
 * [Deloitte Custom Change] Parse the JSON arguments used by inline memory tools.
 * @param args - Serialized or structured arguments received with the paused tool call.
 * @returns A plain argument object, or `undefined` when the input is malformed.
 */
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

/**
 * [Deloitte Custom Change] Read and normalize the memory key from tool arguments.
 * @param args - Serialized or structured memory-tool arguments.
 * @returns The trimmed non-empty memory key, or `undefined` when absent.
 */
function getMemoryKey(args: string | Record<string, unknown> | undefined): string | undefined {
  const key = getMemoryArguments(args)?.key;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : undefined;
}

/**
 * [Deloitte Custom Change] Read the proposed value from set-memory arguments.
 * @param args - Serialized or structured memory-tool arguments.
 * @returns The proposed string value, or `undefined` when absent.
 */
function getMemoryValue(args: string | Record<string, unknown> | undefined): string | undefined {
  const value = getMemoryArguments(args)?.value;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Renders approve / reject / edit / respond controls for a paused tool call,
 * scoped to the decisions the server allows. Records its decision in the
 * batch {@link useApprovalContext}; the final card additionally renders the
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
  /** The composer panel owns one batch submit; the final thread card owns its button. */
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
    enabled: isMemoryTool,
    refetchOnMount: 'always',
  });
  const memoryKey = useMemo(() => getMemoryKey(args), [args]);
  const memoryValue = useMemo(() => getMemoryValue(args), [args]);
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
    getDecisions,
    getSubmitToolCallId,
    getRegisteredCount,
    pendingAction,
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
  const [memoryEditing, setMemoryEditing] = useState(false);
  const [memoryEditName, setMemoryEditName] = useState('');
  const [memoryEditContent, setMemoryEditContent] = useState('');

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
  if (!isSetMemory) {
    memoryApprovalTitle = 'com_ui_memory_approval_delete_title';
  } else if (memoryWriteKind === 'create') {
    memoryApprovalTitle = 'com_ui_memory_approval_create_title';
  } else if (memoryWriteKind === 'update') {
    memoryApprovalTitle = 'com_ui_memory_approval_update_title';
  } else {
    memoryApprovalTitle = 'com_ui_memory_approval_set_title';
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
        const validMemoryEdit =
          !isSetMemory ||
          (isPlainObject(parsed) &&
            typeof parsed.key === 'string' &&
            /^[a-z0-9_]+$/.test(parsed.key) &&
            typeof parsed.value === 'string');
        setDecision(
          actionId,
          toolCallId,
          isPlainObject(parsed) && validMemoryEdit
            ? { tool_call_id: toolCallId, decision: 'edit', editedArguments: parsed }
            : null,
        );
      } catch {
        setDecision(actionId, toolCallId, null);
      }
    }
  }, [
    active,
    editText,
    responseText,
    reason,
    locked,
    setDecision,
    actionId,
    toolCallId,
    isSetMemory,
  ]);

  const editIsValid = useMemo(() => {
    if (active !== 'edit') {
      return true;
    }
    try {
      const parsed = JSON.parse(editText) as unknown;
      return (
        isPlainObject(parsed) &&
        (!isSetMemory ||
          (typeof parsed.key === 'string' &&
            /^[a-z0-9_]+$/.test(parsed.key) &&
            typeof parsed.value === 'string'))
      );
    } catch {
      return false;
    }
  }, [active, editText, isSetMemory]);

  const memoryEditFields = useMemo(
    () => (isSetMemory && active === 'edit' ? getMemoryArguments(editText) : undefined),
    [active, editText, isSetMemory],
  );
  const currentMemoryValue =
    matchingMemory?.contentFilterBlocked === true ? undefined : matchingMemory?.value;
  const safeCurrentMemoryValue =
    currentMemoryValue == null ? undefined : boundApprovalLabel(currentMemoryValue, 16 * 1024);
  const editedMemoryKey =
    typeof memoryEditFields?.key === 'string' ? memoryEditFields.key : memoryKey;
  const editedMemoryValue =
    typeof memoryEditFields?.value === 'string' ? memoryEditFields.value : memoryValue;
  const safeEditedMemoryKey =
    editedMemoryKey == null ? undefined : boundApprovalLabel(editedMemoryKey, 1024).label;
  const displayMemoryKey = safeEditedMemoryKey?.replace(/_/g, ' ');
  const safeEditedMemoryValue =
    editedMemoryValue == null ? undefined : boundApprovalLabel(editedMemoryValue, 16 * 1024);
  const memoryValuePreview =
    toolName === 'delete_memory'
      ? (safeCurrentMemoryValue?.label ??
        (matchingMemory?.contentFilterBlocked === true
          ? localize('com_ui_memory_current_information_unavailable')
          : localize('com_ui_memory_delete_if_approved')))
      : (safeEditedMemoryValue?.label ?? memoryPreview?.body ?? localize('com_ui_no_arguments'));
  const normalizedMemoryEditName = memoryEditName.trim().toLowerCase().replace(/\s+/g, '_');
  const memoryEditValid =
    /^[a-z0-9_]+$/.test(normalizedMemoryEditName) && memoryEditContent.trim().length > 0;

  const openMemoryEdit = () => {
    setMemoryEditName((displayMemoryKey ?? '').replace(/_/g, ' '));
    setMemoryEditContent(editedMemoryValue ?? '');
    setMemoryEditing(true);
  };

  const saveMemoryEdit = () => {
    if (!memoryEditValid) {
      return;
    }
    const current = getMemoryArguments(args) ?? {};
    const next = {
      ...current,
      key: normalizedMemoryEditName,
      value: memoryEditContent,
    };
    updateDecisionDraft({ active: 'edit', editText: JSON.stringify(next, null, 2) });
    setMemoryEditing(false);
  };

  const isSubmitCard = getSubmitToolCallId(actionId) === toolCallId;
  const count = getRegisteredCount(actionId);
  const selectedCount = getDecisions(actionId).length;
  const ready = isReady(actionId);
  const memoryRequests =
    pendingAction?.payload.type === 'tool_approval'
      ? pendingAction.payload.action_requests.filter((request) => request.name === 'set_memory')
      : [];
  const memoryBatchIsOnlySaves =
    pendingAction?.payload.type === 'tool_approval' &&
    pendingAction.payload.action_requests.length === memoryRequests.length;
  const showMemoryIntro =
    isSetMemory &&
    (pendingAction == null ||
      (memoryBatchIsOnlySaves && memoryRequests[0]?.tool_call_id === toolCallId));
  const memoryIntroCount = memoryRequests.length || 1;
  const memoryDecisionSelected = isMemoryTool && active != null;
  let selectedMemoryActionLabel: string;
  if (active === 'edit') {
    selectedMemoryActionLabel = localize('com_ui_memory_edit_ready');
  } else if (toolName === 'delete_memory') {
    selectedMemoryActionLabel = localize(
      active === 'approve' ? 'com_ui_memory_will_be_deleted' : 'com_ui_keep_memory',
    );
  } else if (active === 'approve') {
    if (toolName === 'set_memory') {
      selectedMemoryActionLabel = localize('com_ui_memory_will_be_updated');
    } else {
      selectedMemoryActionLabel = localize('com_ui_memory_will_be_updated');
    }
  } else {
    selectedMemoryActionLabel = localize('com_ui_reject');
  }
  let approvedMemoryColorClass: string | undefined;
  if (active === 'approve' && toolName === 'delete_memory') {
    approvedMemoryColorClass = 'text-status-error';
  } else if (active === 'approve' && isSetMemory) {
    approvedMemoryColorClass = 'text-status-success';
  }

  const submitLabel = useMemo(() => {
    if (status === 'submitting') {
      return localize('com_ui_submitting');
    }
    if (
      count > 1 &&
      pendingAction?.payload.type === 'tool_approval' &&
      pendingAction.payload.action_requests.some(
        (request) => request.name === 'set_memory' || request.name === 'delete_memory',
      )
    ) {
      return localize('com_ui_confirm_changes');
    }
    if (count === 1) {
      return localize('com_ui_submit');
    }
    return localize('com_ui_submit_decisions_progress', { 0: selectedCount, 1: count });
  }, [status, selectedCount, count, localize, pendingAction]);

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
      className={cn(
        'my-2 flex w-full flex-col gap-3',
        memoryPreview == null && 'rounded-lg border border-border-light bg-surface-secondary p-3',
      )}
      data-testid="tool-approval"
      data-tool-call-id={toolCallId}
    >
      {descriptionNode}
      {memoryPreview != null && (
        <>
          <div className="flex flex-col gap-3 border-l border-border-light py-1 pl-4">
            {showMemoryIntro && memoryIntroCount > 1 && (
              <p className="text-base font-semibold text-text-primary">
                {localize('com_ui_memory_batch_title')} ·{' '}
                {localize('com_ui_items_count', { 0: memoryIntroCount })}
              </p>
            )}
            {showMemoryIntro && (
              <p className="text-sm text-text-secondary">
                {localize(
                  memoryIntroCount > 1
                    ? 'com_ui_memory_approval_intro_plural'
                    : 'com_ui_memory_approval_intro',
                  { 0: memoryIntroCount },
                )}
              </p>
            )}
            <p className="text-base font-semibold text-text-primary">
              {localize(memoryApprovalTitle)}
            </p>
            {toolName === 'delete_memory' && (
              <p className="text-sm text-text-secondary">
                {localize('com_ui_memory_approval_delete_intro')}
              </p>
            )}
            {memoryDecisionSelected ? (
              <div className="flex min-h-8 items-center gap-3">
                {(() => {
                  if (toolName === 'delete_memory' && active === 'approve') {
                    return (
                      <Trash2 className="size-4 shrink-0 text-status-error" aria-hidden="true" />
                    );
                  }
                  if (toolName === 'delete_memory' && active === 'reject') {
                    return <X className="size-4 shrink-0 text-text-primary" aria-hidden="true" />;
                  }
                  if (active === 'approve') {
                    return (
                      <CheckCircle2
                        className="size-4 shrink-0 text-status-success"
                        aria-hidden="true"
                      />
                    );
                  }
                  if (active === 'reject') {
                    return <X className="size-4 shrink-0 text-text-primary" aria-hidden="true" />;
                  }
                  const dotClass =
                    toolName === 'delete_memory' && active != null && String(active) === 'reject'
                      ? 'bg-text-warning'
                      : 'bg-border-medium';
                  return (
                    <span
                      className={cn('size-2 shrink-0 rounded-full', dotClass)}
                      aria-hidden="true"
                    />
                  );
                })()}
                <span
                  className={cn(
                    'text-sm font-semibold',
                    approvedMemoryColorClass ?? 'text-text-primary',
                  )}
                >
                  {localize(memoryApprovalTitle)}
                </span>
                {displayMemoryKey != null && (
                  <span className="text-sm text-text-secondary">{displayMemoryKey}</span>
                )}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    approvedMemoryColorClass ?? 'text-text-secondary',
                  )}
                >
                  · {selectedMemoryActionLabel}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 underline underline-offset-2"
                  onClick={() => updateDecisionDraft({ active: null })}
                >
                  {localize('com_ui_undo')}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={localize('com_ui_expand')}
                  onClick={() => updateDecisionDraft({ active: null })}
                  className="size-7 shrink-0"
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  'rounded-lg border p-3',
                  memoryEditing
                    ? 'border-border-xheavy bg-surface-primary'
                    : 'border-border-light bg-surface-primary',
                )}
              >
                {memoryEditing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`memory-name-${toolCallId}`}>{localize('com_ui_name')}</Label>
                      <Input
                        id={`memory-name-${toolCallId}`}
                        value={memoryEditName}
                        disabled={locked}
                        onChange={(event) => setMemoryEditName(event.target.value)}
                        // autoFocus removed for accessibility
                      />
                      {!/^[a-z0-9_]+$/.test(normalizedMemoryEditName) && (
                        <span className="text-xs text-text-warning">
                          {localize('com_ui_invalid_memory_name')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`memory-content-${toolCallId}`}>
                        {localize('com_ui_content')}
                      </Label>
                      <Textarea
                        id={`memory-content-${toolCallId}`}
                        value={memoryEditContent}
                        disabled={locked}
                        onChange={(event) => setMemoryEditContent(event.target.value)}
                        className="min-h-24 resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={locked}
                        onClick={() => setMemoryEditing(false)}
                      >
                        {localize('com_ui_cancel')}
                      </Button>
                      <Button
                        type="button"
                        variant="submit"
                        size="sm"
                        disabled={locked || !memoryEditValid}
                        onClick={saveMemoryEdit}
                      >
                        {localize('com_ui_save_changes')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="break-words text-base font-semibold leading-[22px] text-text-primary">
                        {displayMemoryKey ?? localize('com_ui_memory_proposed')}
                      </p>
                      <p className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-base leading-6 text-text-primary">
                        {memoryValuePreview}
                      </p>
                    </div>
                    {isSetMemory && allowedDecisions.includes('edit') && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={locked}
                        aria-label={localize('com_ui_memory_approval_edit_title')}
                        onClick={openMemoryEdit}
                        className="size-8 shrink-0 rounded-md text-text-primary"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {!memoryDecisionSelected && (
              <>
                {memoryPreview.truncated && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {localize('com_ui_preview_truncated')}
                  </p>
                )}
                {(isSetMemory
                  ? safeEditedMemoryValue?.truncated
                  : safeCurrentMemoryValue?.truncated) && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {localize('com_ui_memory_value_preview_truncated')}
                  </p>
                )}
              </>
            )}
            {toolName === 'set_memory' ? (
              <p className="flex items-start gap-1.5 text-xs text-text-warning" role="note">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {localize('com_ui_memory_sensitive_data_warning')}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 px-1 text-xs text-text-warning" role="note">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {localize('com_ui_memory_delete_warning')}
              </p>
            )}
          </div>
        </>
      )}
      {!memoryDecisionSelected && (
        <div className="flex flex-wrap gap-2" data-testid="tool-approval-decisions">
          {(isMemoryTool ? (['reject', 'approve'] as DecisionType[]) : allowedDecisions).map(
            (decision) => {
              const Icon =
                toolName === 'delete_memory' && decision === 'approve'
                  ? Trash2
                  : DECISION_ICON[decision];
              let decisionLabel: TranslationKeys;
              if (toolName === 'delete_memory') {
                if (decision === 'approve') {
                  decisionLabel = 'com_ui_delete_memory';
                } else {
                  decisionLabel = 'com_ui_keep_memory';
                }
              } else {
                decisionLabel = DECISION_LABEL[decision];
              }
              return (
                <Button
                  key={decision}
                  size="sm"
                  variant={(() => {
                    if (toolName === 'delete_memory' && decision === 'approve') {
                      return 'destructive';
                    }
                    if (active === decision) {
                      return 'default';
                    }
                    return 'outline';
                  })()}
                  disabled={locked}
                  aria-pressed={active === decision}
                  onClick={() =>
                    updateDecisionDraft({ active: active === decision ? null : decision })
                  }
                  className="inline-flex items-center gap-1.5"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {localize(decisionLabel)}
                </Button>
              );
            },
          )}
        </div>
      )}

      {active === 'edit' && !isSetMemory && (
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

      {surface === 'thread' && isSubmitCard && (
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
