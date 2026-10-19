import { atomFamily } from 'jotai/utils';
import { atom, useAtomValue } from 'jotai';
import { Constants } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';

/**
 * The server-owned pending action for one conversation.
 *
 * Kept outside message rendering so the composer and timeline can project the
 * same action without making mounted cards the source of truth. This state is
 * memory-only: reload hydration comes from the stream status endpoint.
 */
export const pendingApprovalActionFamily = atomFamily((_conversationId: string) =>
  atom<Agents.PendingAction | null>(null),
);

/** Whether the composer's review panel is expanded for one conversation. */
export const approvalPanelOpenFamily = atomFamily((_conversationId: string) => atom(false));

/**
 * Memory actions are reviewed inline beside the proposed memory content; sending
 * the same action to the composer panel would cover that card and duplicate its
 * controls. Only classify host memory tools with their server-attached classes.
 */
export function isMemoryApprovalAction(
  pendingAction: Agents.PendingAction | null | undefined,
): boolean {
  if (pendingAction?.payload.type !== 'tool_approval') {
    return false;
  }
  const { action_requests: requests } = pendingAction.payload;
  return (
    requests.length > 0 &&
    requests.every(
      (request) =>
        (request.name === 'set_memory' && request.toolClass === 'W1') ||
        (request.name === 'delete_memory' && request.toolClass === 'D'),
    )
  );
}

/** True while the composer's panel is open on this non-memory tool action. */
export function useComposerPresentsApproval(
  conversationId: string | null | undefined,
  actionId: string,
): boolean {
  const key = conversationId ?? Constants.NEW_CONVO;
  const pendingAction = useAtomValue(pendingApprovalActionFamily(key));
  const open = useAtomValue(approvalPanelOpenFamily(key));
  return (
    conversationId != null &&
    open &&
    pendingAction?.actionId === actionId &&
    pendingAction.payload.type === 'tool_approval' &&
    !isMemoryApprovalAction(pendingAction)
  );
}
