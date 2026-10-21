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
 * True while the composer's review panel is open on this tool-approval action.
 * @param conversationId - Conversation owning the pending approval, if any.
 * @param actionId - Server action ID displayed by the composer panel.
 * @returns Whether the expanded composer panel presents this action.
 */
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
    pendingAction.payload.type === 'tool_approval'
  );
}
