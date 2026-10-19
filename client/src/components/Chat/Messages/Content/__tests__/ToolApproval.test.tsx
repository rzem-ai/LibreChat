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
      com_ui_memory_approval_set_title: 'Save or update memory',
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

    const submit = screen.getByRole('button', { name: 'Submit (0/1 selected)' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.getByRole('button', { name: 'Submit (1/1 selected)' })).toBeEnabled();
    expect(submit).toBeEnabled();
  });

  test('deselecting the active decision disables Submit again', () => {
    renderCards(<ToolApproval approval={approval()} toolCallId="call-1" args={{ a: 1 }} />);

    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    expect(screen.getByRole('button', { name: 'Submit (1/1 selected)' })).toBeEnabled();

    fireEvent.click(approve);
    expect(screen.getByRole('button', { name: 'Submit (0/1 selected)' })).toBeDisabled();
  });

  test('a respond decision only counts once its text is non-empty', () => {
    renderCards(<ToolApproval approval={approval(['respond'])} toolCallId="call-1" args={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    const submit = screen.getByRole('button', { name: 'Submit (0/1 selected)' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Respond' }), {
      target: { value: 'use the staging table' },
    });
    expect(screen.getByRole('button', { name: 'Submit (1/1 selected)' })).toBeEnabled();
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
    expect(screen.getByRole('button', { name: 'Submit (1/1 selected)' })).toBeEnabled();
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
            allowed_decisions: ['approve', 'reject', 'edit'],
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
                      request?.name === 'set_memory' ? ['approve', 'reject', 'edit'] : undefined,
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
      expect(within(thread).getByRole('button', { name: 'Submit (1/1 selected)' })).toBeEnabled();
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

      expect(thread).toHaveTextContent('Proposed memory');
      expect(thread).toHaveTextContent('Create memory');
      expect(thread).toHaveTextContent(
        'The agent would like to save a memory. This will create a new memory only if you approve.',
      );
      expect(thread).toHaveTextContent('favorite quote');
      expect(thread).toHaveTextContent('To be, or not to be.');
      expect(thread).toHaveTextContent('View technical details (JSON)');
      const technicalDetails = within(thread)
        .getByText('View technical details (JSON)')
        .closest('details');
      expect(technicalDetails).not.toHaveAttribute('open');
      fireEvent.click(within(thread).getByText('View technical details (JSON)'));
      expect(technicalDetails).toHaveAttribute('open');
      expect(technicalDetails).toHaveTextContent('"key": "favorite_quote"');
      expect(thread).toHaveTextContent('Do not store confidential information.');
      expect(within(thread).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument();

      fireEvent.click(within(thread).getByRole('button', { name: 'Edit' }));
      expect(within(thread).getByRole('textbox', { name: 'Edit' })).toHaveValue(
        '{\n  "key": "favorite_quote",\n  "value": "To be, or not to be."\n}',
      );
    });

    // Deloitte Custom Change: Verify the approval preview compares the saved and proposed values.
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
      expect(thread).toHaveTextContent(
        'The agent would like to update a saved memory. This will replace its value only if you approve.',
      );
      expect(thread).toHaveTextContent('Currently saved');
      expect(thread).toHaveTextContent('The old quote.');
      expect(thread).toHaveTextContent('Will be updated to');
      expect(thread).toHaveTextContent('To be, or not to be.');
    });

    // Deloitte Custom Change: Keep protected stored memory content out of the approval preview.
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

      expect(thread).toHaveTextContent('The current value is hidden by content protection.');
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

      expect(screen.getByTestId('thread')).toHaveTextContent('Save or update memory');
    });

    test('memory delete approvals identify the removal and explain that it pauses for review', () => {
      renderWithComposer(true, undefined, deleteMemoryPendingAction);
      const thread = screen.getByTestId('thread');

      expect(thread).toHaveTextContent('Delete memory');
      expect(thread).toHaveTextContent(
        'The agent would like to delete a saved memory. It can no longer retrieve it if you approve.',
      );
      expect(thread).toHaveTextContent('Memory to delete');
      expect(thread).toHaveTextContent('This memory will be removed if you approve the request.');
      expect(thread).toHaveTextContent('View technical details (JSON)');
      expect(screen.getByText('favorite quote')).toHaveClass('text-text-destructive');
      expect(screen.getByText('favorite quote').tagName).not.toBe('DEL');
      expect(within(thread).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
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
