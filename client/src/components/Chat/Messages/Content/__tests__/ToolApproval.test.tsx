import React from 'react';
import { RecoilRoot } from 'recoil';
import { Provider, createStore } from 'jotai';
import { MemoryScope } from 'librechat-data-provider';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import {
  approvalPanelOpenFamily,
  isMemoryApprovalAction,
  pendingApprovalActionFamily,
} from '~/components/Chat/approval/state';
import { ChatContext } from '~/Providers/ChatContext';
import { useMemoriesQuery } from '~/data-provider';
import ApprovalProvider from '../ApprovalContext';
import ToolApproval from '../ToolApproval';

const mockUseAgentsMapContext = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string | number>) => {
    if (key === 'com_ui_submit_decisions_progress') {
      return `Submit (${values?.[0]}/${values?.[1]} selected)`;
    }
    if (key === 'com_ui_submit_decisions') {
      return `Submit ${values?.[0]} decisions`;
    }
    const map: Record<string, string> = {
      com_ui_approve: 'Approve',
      com_ui_reject: 'Reject',
      com_ui_delete_memory: 'Delete memory',
      com_ui_edit: 'Edit',
      com_ui_respond: 'Respond',
      com_ui_submit: 'Submit',
      com_ui_submitting: 'Submitting',
      com_ui_invalid_json: 'Invalid JSON',
      com_ui_reject_reason_placeholder: 'Reason',
      com_ui_tool_response_placeholder: 'Response',
      com_ui_approval_review_in_composer: 'Review in composer',
      com_ui_proposed_arguments: 'Proposed arguments',
      com_ui_memory_sensitive_data_warning: 'Do not store confidential information.',
      com_ui_memory_approval_intro:
        'Your agent wants to remember this across chats. Nothing is saved unless you approve.',
      com_ui_memory_approval_intro_plural: `${values?.[0]} things across chats. Nothing is saved unless you approve.`,
      com_ui_memory_batch_title: 'Save memories',
      com_ui_items_count: `${values?.[0]} items`,
      com_ui_memory_approval_delete_intro:
        'Your agent wants to forget this memory. It won’t be used in future chats.',
      com_ui_memory_delete_warning: 'This can’t be undone.',
      com_ui_memory_edit_ready: 'Changes edited',
      com_ui_memory_will_be_deleted: 'Will be deleted',
      com_ui_keep_memory: 'Keep memory',
      com_ui_undo: 'Undo',
      com_ui_save_changes: 'Save changes',
      com_ui_memory_approval_edit_title: 'Edit memory',
      com_ui_confirm_changes: 'Confirm changes',
      com_ui_name: 'Name',
      com_ui_content: 'Content',
      com_ui_invalid_memory_name: 'Invalid memory name',
      com_ui_memory_approval_set_title: 'Create or update memory',
      com_ui_memory_approval_set_description:
        'The agent would like to save or update a memory. It will only run if you approve.',
      com_ui_memory_approval_create_title: 'Create memory',
      com_ui_memory_approval_create_description:
        'The agent would like to save a memory. This will create a new memory only if you approve.',
      com_ui_memory_approval_update_title: 'Update memory',
      com_ui_memory_approval_update_description:
        'The agent would like to update a saved memory. This will replace its value only if you approve.',
      com_ui_memory_approval_delete_title: 'Delete memory',
      com_ui_memory_approval_delete_description:
        'The agent would like to delete a saved memory. It can no longer retrieve it if you approve.',
      com_ui_memory_delete_if_approved: 'This memory will be removed if you approve the request.',
      com_ui_memory_delete_target: 'Memory to delete',
      com_ui_memory_proposed: 'Proposed memory',
      com_ui_memory_topic: 'Memory topic',
      com_ui_memory_current_information: 'Currently saved',
      com_ui_memory_current_information_unavailable:
        'The current value is hidden by content protection.',
      com_ui_memory_current_value_unavailable: 'The current saved value could not be loaded.',
      com_ui_memory_updated_information: 'Will be updated to',
      com_ui_memory_information_to_remember: 'Information to remember',
      com_ui_memory_view_technical_details: 'View technical details (JSON)',
    };
    return map[key] ?? key;
  },
}));

jest.mock('~/data-provider', () => ({
  useMemoriesQuery: jest.fn(() => ({
    data: undefined,
    isFetchedAfterMount: false,
    isError: false,
  })),
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));

beforeEach(() => {
  jest
    .mocked(useMemoriesQuery)
    .mockReturnValue({ data: undefined, isFetchedAfterMount: false, isError: false } as never);
  mockUseAgentsMapContext.mockReturnValue({
    'agent-1': { id: 'agent-1', memory_scope: MemoryScope.agent },
  });
});

jest.mock('~/Providers/ChatContext', () => ({
  ChatContext: jest.requireActual('react').createContext(null),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: () => mockUseAgentsMapContext(),
}));

const approval = (
  allowed: Agents.ToolApprovalDecisionType[] = ['approve', 'reject'],
): NonNullable<Agents.ToolCall['approval']> => ({
  actionId: 'action-1',
  allowed_decisions: allowed,
});

const renderCards = (cards: React.ReactNode) =>
  render(
    <RecoilRoot>
      <ApprovalProvider>{cards}</ApprovalProvider>
    </RecoilRoot>,
  );

describe('ToolApproval', () => {
  test('enables Submit immediately after Approve is the first decision (#14390)', () => {
    renderCards(<ToolApproval approval={approval()} toolCallId="call-1" args={{ a: 1 }} />);

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(submit).toBeEnabled();
  });

  test('deselecting the active decision disables Submit again', () => {
    renderCards(<ToolApproval approval={approval()} toolCallId="call-1" args={{ a: 1 }} />);

    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();

    fireEvent.click(approve);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  test('a respond decision only counts once its text is non-empty', () => {
    renderCards(<ToolApproval approval={approval(['respond'])} toolCallId="call-1" args={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Respond' }), {
      target: { value: 'use the staging table' },
    });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(submit).toBeEnabled();
  });

  test('every decision field names its own text, placeholder and border tokens', () => {
    renderCards(
      <ToolApproval
        approval={approval(['approve', 'reject', 'edit', 'respond'])}
        toolCallId="call-1"
        args={{ a: 1 }}
      />,
    );

    for (const decision of ['Reject', 'Respond', 'Edit'] as const) {
      const toggle = screen.getByRole('button', { name: decision });
      fireEvent.click(toggle);
      const field = screen.getByRole('textbox', { name: decision });
      // A bare `textarea` inherits its colour, so the tokens have to be named here.
      expect(field).toHaveClass('text-text-primary');
      expect(field).toHaveClass('border-border-xheavy');
      if (decision !== 'Edit') {
        expect(field).toHaveClass('placeholder:text-text-secondary');
      }
      fireEvent.click(toggle);
    }
  });

  test('invalid edit JSON replaces the field border rather than doubling it', () => {
    renderCards(<ToolApproval approval={approval(['edit'])} toolCallId="call-1" args={{ a: 1 }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const field = screen.getByRole('textbox', { name: 'Edit' });
    fireEvent.change(field, { target: { value: '{' } });

    expect(field).toHaveClass('border-red-500');
    expect(field).not.toHaveClass('border-border-xheavy');
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
  });

  test('puts the batch Submit after the final card and shows selected decisions out of the total', () => {
    renderCards(
      <>
        <ToolApproval approval={approval()} toolCallId="call-1" args={{ a: 1 }} />
        <ToolApproval approval={approval()} toolCallId="call-2" args={{ b: 2 }} />
      </>,
    );

    const [firstCard, secondCard] = screen.getAllByTestId('tool-approval');
    expect(within(firstCard).queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
    const submit = within(secondCard).getByRole('button', { name: 'Submit (0/2 selected)' });
    expect(submit).toBeDisabled();

    const [approveFirst, approveSecond] = screen.getAllByRole('button', { name: 'Approve' });
    fireEvent.click(approveFirst);
    expect(
      within(secondCard).getByRole('button', { name: 'Submit (1/2 selected)' }),
    ).toBeDisabled();
    expect(submit).toBeDisabled();

    fireEvent.click(approveSecond);
    expect(within(secondCard).getByRole('button', { name: 'Submit (2/2 selected)' })).toBeEnabled();
  });

  test('groups a memory batch under one summary and confirms all selected changes together', () => {
    const pendingAction: Agents.PendingAction = {
      actionId: 'action-1',
      streamId: 'stream-1',
      conversationId: 'convo-1',
      createdAt: 1000,
      payload: {
        type: 'tool_approval',
        action_requests: [
          {
            name: 'set_memory',
            toolClass: 'W1',
            tool_call_id: 'call-1',
            arguments: { key: 'quote_one', value: 'First quote.' },
          },
          {
            name: 'set_memory',
            toolClass: 'W1',
            tool_call_id: 'call-2',
            arguments: { key: 'quote_two', value: 'Second quote.' },
          },
        ],
        review_configs: [],
      },
    };

    render(
      <RecoilRoot>
        <ApprovalProvider pendingAction={pendingAction}>
          {(pendingAction.payload.type === 'tool_approval'
            ? pendingAction.payload.action_requests
            : []
          ).map((request) => (
            <ToolApproval
              key={request.tool_call_id}
              approval={approval(['approve', 'reject', 'edit'])}
              toolCallId={request.tool_call_id}
              args={request.arguments}
              toolName={request.name}
            />
          ))}
        </ApprovalProvider>
      </RecoilRoot>,
    );

    const cards = screen.getAllByTestId('tool-approval');
    expect(
      screen.getAllByText('2 things across chats. Nothing is saved unless you approve.'),
    ).toHaveLength(1);
    expect(within(cards[0]).getByText('quote one')).toBeInTheDocument();
    expect(within(cards[1]).getByText('quote two')).toBeInTheDocument();
    const confirm = within(cards[1]).getByRole('button', { name: 'Confirm changes' });
    expect(confirm).toBeDisabled();

    const [firstApprove, secondApprove] = screen.getAllByRole('button', { name: 'Approve' });
    fireEvent.click(firstApprove);
    fireEvent.click(secondApprove);
    expect(confirm).toBeEnabled();
  });

  test('restores a selected decision when the card remounts inside the same message', () => {
    const tree = (key: string) => (
      <RecoilRoot>
        <ApprovalProvider>
          <ToolApproval key={key} approval={approval()} toolCallId="call-1" args={{ a: 1 }} />
        </ApprovalProvider>
      </RecoilRoot>
    );
    const view = render(tree('direct'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'true');

    view.rerender(tree('phase-slice'));

    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  describe('while the composer owns the pending action', () => {
    const conversationId = 'convo-1';
    const pendingAction: Agents.PendingAction = {
      actionId: 'action-1',
      streamId: 'stream-1',
      conversationId,
      createdAt: 1000,
      payload: {
        type: 'tool_approval',
        action_requests: [{ name: 'probe', tool_call_id: 'call-1', arguments: { a: 1 } }],
        review_configs: [
          {
            action_name: 'probe',
            tool_call_id: 'call-1',
            allowed_decisions: ['approve', 'reject'],
          },
        ],
      },
    };

    const memoryPendingAction: Agents.PendingAction = {
      ...pendingAction,
      payload: {
        type: 'tool_approval',
        action_requests: [
          {
            name: 'set_memory',
            toolClass: 'W1',
            tool_call_id: 'call-1',
            arguments: { key: 'favorite_quote', value: 'To be, or not to be.' },
          },
        ],
        review_configs: [
          {
            action_name: 'set_memory',
            tool_call_id: 'call-1',
            allowed_decisions: ['approve', 'reject', 'edit', 'respond'],
          },
        ],
      },
    };

    const deleteMemoryPendingAction: Agents.PendingAction = {
      ...memoryPendingAction,
      payload: {
        type: 'tool_approval',
        action_requests: [
          {
            name: 'delete_memory',
            toolClass: 'D',
            tool_call_id: 'call-1',
            arguments: { key: 'favorite_quote' },
          },
        ],
        review_configs: [
          {
            action_name: 'delete_memory',
            tool_call_id: 'call-1',
            allowed_decisions: ['approve', 'reject'],
          },
        ],
      },
    };

    const renderWithComposer = (
      open: boolean,
      extra?: React.ReactNode,
      action: Agents.PendingAction = pendingAction,
    ) => {
      const store = createStore();
      store.set(pendingApprovalActionFamily(conversationId), action);
      store.set(approvalPanelOpenFamily(conversationId), open);
      const request =
        action.payload.type === 'tool_approval' ? action.payload.action_requests[0] : undefined;
      render(
        <RecoilRoot>
          <Provider store={store}>
            <ChatContext.Provider
              value={{ conversation: { conversationId, agent_id: 'agent-1' } } as never}
            >
              <ApprovalProvider pendingAction={action}>
                <div data-testid="thread">
                  <ToolApproval
                    approval={approval(
                      request?.name === 'set_memory'
                        ? ['approve', 'reject', 'edit', 'respond']
                        : undefined,
                    )}
                    toolCallId="call-1"
                    args={request?.arguments ?? {}}
                    toolName={request?.name}
                  />
                </div>
                {open && !isMemoryApprovalAction(action) && (
                  <div data-testid="composer">
                    <ToolApproval
                      approval={approval()}
                      toolCallId="call-1"
                      args={{ a: 1 }}
                      surface="composer"
                    />
                  </div>
                )}
                {extra}
              </ApprovalProvider>
            </ChatContext.Provider>
          </Provider>
        </RecoilRoot>,
      );
      return store;
    };

    test('the thread omits its approval card while the composer panel is open', () => {
      renderWithComposer(true);
      const thread = screen.getByTestId('thread');

      expect(thread.querySelectorAll('button')).toHaveLength(0);
      expect(within(thread).getByTestId('tool-approval')).toHaveTextContent('Review in composer');
      expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    });

    test('collapsing the panel hands decisions and Submit back to the thread card', () => {
      renderWithComposer(false);
      const thread = screen.getByTestId('thread');
      fireEvent.click(within(thread).getByRole('button', { name: 'Approve' }));
      expect(within(thread).getByRole('button', { name: 'Submit' })).toBeEnabled();
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    });

    test('memory approvals keep their detailed review inline and skip the composer panel', () => {
      jest.mocked(useMemoriesQuery).mockReturnValue({
        data: {
          memories: [{ key: 'favorite_quote', agentId: 'another-agent' }],
        },
        isFetchedAfterMount: true,
        isError: false,
      } as never);
      renderWithComposer(true, undefined, memoryPendingAction);
      const thread = screen.getByTestId('thread');

      expect(thread).toHaveTextContent('Create memory');
      expect(thread).toHaveTextContent('favorite quote');
      expect(thread).toHaveTextContent('To be, or not to be.');
      expect(thread).toHaveTextContent(
        'Your agent wants to remember this across chats. Nothing is saved unless you approve.',
      );
      expect(thread.querySelector('details')).not.toBeInTheDocument();
      expect(thread).toHaveTextContent('Do not store confidential information.');
      const decisions = within(thread).getByTestId('tool-approval-decisions');
      expect(
        within(decisions)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Reject', 'Approve']);
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument();

      fireEvent.click(within(thread).getByRole('button', { name: 'Edit memory' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(within(thread).getByRole('textbox', { name: 'Name' })).toHaveValue('favorite quote');
      expect(within(thread).getByRole('textbox', { name: 'Content' })).toHaveValue(
        'To be, or not to be.',
      );
      fireEvent.change(within(thread).getByRole('textbox', { name: 'Name' }), {
        target: { value: 'preferred_quote' },
      });
      fireEvent.click(within(thread).getByRole('button', { name: 'Save changes' }));
      expect(within(thread).getByRole('button', { name: 'Submit' })).toBeEnabled();
      expect(within(thread).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    // Deloitte Custom Change: Confirm the proposed operation is clearly labeled as an update.
    test('labels set_memory as an update when the same agent already has that key', () => {
      jest.mocked(useMemoriesQuery).mockReturnValue({
        data: {
          memories: [{ key: 'favorite_quote', value: 'The old quote.', agentId: 'agent-1' }],
        },
        isFetchedAfterMount: true,
        isError: false,
      } as never);
      renderWithComposer(true, undefined, memoryPendingAction);
      const thread = screen.getByTestId('thread');

      expect(thread).toHaveTextContent('Update memory');
      expect(thread).toHaveTextContent('To be, or not to be.');
      expect(thread).not.toHaveTextContent('The old quote.');
    });

    // Deloitte Custom Change: Keep protected stored content out of the simplified preview.
    test('does not reveal a protected current value while showing the proposed replacement', () => {
      jest.mocked(useMemoriesQuery).mockReturnValue({
        data: {
          memories: [
            {
              key: 'favorite_quote',
              value: 'redacted sensitive value',
              contentFilterBlocked: true,
              agentId: 'agent-1',
            },
          ],
        },
        isFetchedAfterMount: true,
        isError: false,
      } as never);
      renderWithComposer(true, undefined, memoryPendingAction);
      const thread = screen.getByTestId('thread');

      expect(thread).not.toHaveTextContent('redacted sensitive value');
      expect(thread).toHaveTextContent('To be, or not to be.');
    });

    test('matches user-scoped memories for agents using the shared personal pool', () => {
      mockUseAgentsMapContext.mockReturnValue({
        'agent-1': { id: 'agent-1', memory_scope: MemoryScope.user },
      });
      jest.mocked(useMemoriesQuery).mockReturnValue({
        data: {
          memories: [{ key: 'favorite_quote' }],
        },
        isFetchedAfterMount: true,
        isError: false,
      } as never);
      renderWithComposer(true, undefined, memoryPendingAction);

      expect(screen.getByTestId('thread')).toHaveTextContent('Update memory');
    });

    test('uses the generic description when the agent memory scope is unavailable', () => {
      mockUseAgentsMapContext.mockReturnValue(undefined);
      jest.mocked(useMemoriesQuery).mockReturnValue({
        data: {
          memories: [{ key: 'favorite_quote', agentId: 'agent-1' }],
        },
        isFetchedAfterMount: true,
        isError: false,
      } as never);
      renderWithComposer(true, undefined, memoryPendingAction);

      expect(screen.getByTestId('thread')).toHaveTextContent('Create or update memory');
    });

    test('memory delete approvals identify the removal and explain that it pauses for review', () => {
      renderWithComposer(true, undefined, deleteMemoryPendingAction);
      const thread = screen.getByTestId('thread');

      expect(thread).toHaveTextContent('Delete memory');
      expect(thread).toHaveTextContent('This memory will be removed if you approve the request.');
      expect(screen.getByText('favorite quote').tagName).not.toBe('DEL');
      const deleteButton = within(thread).getByRole('button', { name: 'Delete memory' });
      expect(deleteButton.querySelector('svg')?.classList.contains('lucide-trash-2')).toBe(true);
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    });

    test('approved memory deletes use error styling for the selected action', () => {
      renderWithComposer(true, undefined, deleteMemoryPendingAction);
      const thread = screen.getByTestId('thread');

      fireEvent.click(within(thread).getByRole('button', { name: 'Delete memory' }));

      expect(within(thread).getByText(/Will be deleted/)).toHaveClass('text-status-error');
      expect(
        within(thread)
          .getAllByText('Delete memory')
          .some((element) => element.classList.contains('text-status-error')),
      ).toBe(true);
      expect(thread.querySelector('svg.lucide-trash-2')).toHaveClass('text-status-error');
    });

    test('a thread card for a different action keeps its controls', () => {
      renderWithComposer(
        true,
        <div data-testid="other-action">
          <ToolApproval
            approval={{ actionId: 'action-2', allowed_decisions: ['approve'] }}
            toolCallId="call-9"
            args={{}}
          />
        </div>,
      );

      const other = screen.getByTestId('other-action');
      expect(within(other).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.getByTestId('thread')).toHaveTextContent('Review in composer');
    });
  });
});
