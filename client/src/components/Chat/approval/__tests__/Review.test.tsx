import React from 'react';
import { RecoilRoot } from 'recoil';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import { PendingToolApprovalButton, PendingToolApprovalPanel } from '../Review';
import { composerOverlayCountFamily } from '~/components/Chat/Input/overlay';
import ApprovalProvider from '../../Messages/Content/ApprovalContext';
import { pendingApprovalActionFamily } from '../state';

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  TextareaAutosize: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string | number>) => {
    const labels: Record<string, string> = {
      com_ui_review_action: 'Review 1 action',
      com_ui_review_actions: `Review ${values?.[0]} actions`,
      com_ui_review_run_command: 'Run command',
      com_ui_review_create_file: `Create ${values?.[0]}`,
      com_ui_review_create_file_generic: 'Create file',
      com_ui_review_edit_file: `Edit ${values?.[0]}`,
      com_ui_review_edit_file_generic: 'Edit file',
      com_ui_proposed_command: 'Proposed command',
      com_ui_proposed_contents: 'Proposed contents',
      com_ui_proposed_replacements: 'Proposed replacements',
      com_ui_proposed_arguments: 'Proposed arguments',
      com_ui_decisions_selected: `${values?.[0]} of ${values?.[1]} decisions selected`,
      com_ui_submit_decisions_progress: `Submit (${values?.[0]}/${values?.[1]} selected)`,
      com_ui_approve: 'Approve',
      com_ui_reject: 'Reject',
      com_ui_collapse: 'Collapse',
    };
    return labels[key] ?? key;
  },
}));

jest.mock('~/data-provider', () => ({
  // Deloitte Custom Change: Provide memory data for composer-rendered memory approvals.
  useMemoriesQuery: () => ({ data: { memories: [] }, isFetchedAfterMount: false, isError: false }),
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/store/agents', () => ({
  useGetEphemeralAgent: () => () => undefined,
}));

const pendingAction: Agents.PendingAction = {
  actionId: 'action-1',
  streamId: 'stream-1',
  conversationId: 'conversation-1',
  createdAt: 1000,
  payload: {
    type: 'tool_approval',
    action_requests: [
      {
        name: 'create_file',
        source: 'librechat_code',
        tool_call_id: 'call-1',
        arguments: { path: 'src/new.ts', content: 'export const value = 1;' },
      },
      {
        name: 'bash_tool',
        source: 'librechat_code',
        tool_call_id: 'call-2',
        arguments: { command: 'npm test -- new' },
      },
    ],
    review_configs: [
      {
        action_name: 'create_file',
        tool_call_id: 'call-1',
        allowed_decisions: ['approve', 'reject'],
      },
      {
        action_name: 'bash_tool',
        tool_call_id: 'call-2',
        allowed_decisions: ['approve', 'reject'],
      },
    ],
  },
};

describe('PendingToolApproval', () => {
  test('reviews the authoritative batch beside the composer and can be collapsed', async () => {
    const jotaiStore = createStore();
    jotaiStore.set(pendingApprovalActionFamily('conversation-1'), pendingAction);
    render(
      <RecoilRoot>
        <JotaiProvider store={jotaiStore}>
          <ApprovalProvider pendingAction={pendingAction}>
            <PendingToolApprovalPanel conversationId="conversation-1" />
            <PendingToolApprovalButton conversationId="conversation-1" />
          </ApprovalProvider>
        </JotaiProvider>
      </RecoilRoot>,
    );

    expect(await screen.findByRole('region', { name: 'Review 2 actions' })).toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(1);
    expect(screen.getByText(/Create src\/new\.ts/)).toBeInTheDocument();
    expect(screen.getByText('npm test -- new')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 decisions selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit (0/2 selected)' })).toBeDisabled();

    const approvals = screen.getAllByRole('button', { name: 'Approve' });
    fireEvent.click(approvals[0]);
    expect(screen.getByRole('button', { name: 'Submit (1/2 selected)' })).toBeDisabled();
    fireEvent.click(approvals[1]);
    expect(screen.getByRole('button', { name: 'Submit (2/2 selected)' })).toBeEnabled();
    expect(screen.getByText('2 of 2 decisions selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByRole('region', { name: 'Review 2 actions' })).not.toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(0);
    expect(screen.getByTestId('pending-tool-approval-button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('memory approvals use the inline card instead of the composer review panel', () => {
    const memoryAction: Agents.PendingAction = {
      ...pendingAction,
      payload: {
        type: 'tool_approval',
        action_requests: [
          {
            name: 'set_memory',
            toolClass: 'W1',
            tool_call_id: 'memory-call',
            arguments: { key: 'favorite_quote', value: 'To be, or not to be.' },
          },
        ],
        review_configs: [
          {
            action_name: 'set_memory',
            tool_call_id: 'memory-call',
            allowed_decisions: ['approve', 'reject', 'edit'],
          },
        ],
      },
    };
    const jotaiStore = createStore();
    jotaiStore.set(pendingApprovalActionFamily('conversation-1'), memoryAction);

    render(
      <RecoilRoot>
        <JotaiProvider store={jotaiStore}>
          <ApprovalProvider pendingAction={memoryAction}>
            <PendingToolApprovalPanel conversationId="conversation-1" />
            <PendingToolApprovalButton conversationId="conversation-1" />
          </ApprovalProvider>
        </JotaiProvider>
      </RecoilRoot>,
    );

    expect(screen.queryByRole('region', { name: 'Review 1 action' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-tool-approval-button')).not.toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(0);
  });

  // Deloitte Custom Change: Verify readable memory content in mixed composer review batches.
  test('mixed batches show memory details in the composer without a raw JSON summary', () => {
    const mixedAction: Agents.PendingAction = {
      ...pendingAction,
      payload: {
        type: 'tool_approval',
        action_requests: [
          {
            name: 'set_memory',
            toolClass: 'W1',
            tool_call_id: 'memory-call',
            arguments: { key: 'favorite_quote', value: 'To be, or not to be.' },
          },
          {
            name: 'bash_tool',
            tool_call_id: 'bash-call',
            arguments: { command: 'npm test' },
          },
        ],
        review_configs: [
          {
            action_name: 'set_memory',
            tool_call_id: 'memory-call',
            allowed_decisions: ['approve', 'reject'],
          },
          {
            action_name: 'bash_tool',
            tool_call_id: 'bash-call',
            allowed_decisions: ['approve', 'reject'],
          },
        ],
      },
    };
    const jotaiStore = createStore();
    jotaiStore.set(pendingApprovalActionFamily('conversation-1'), mixedAction);

    render(
      <RecoilRoot>
        <JotaiProvider store={jotaiStore}>
          <ApprovalProvider pendingAction={mixedAction}>
            <PendingToolApprovalPanel conversationId="conversation-1" />
          </ApprovalProvider>
        </JotaiProvider>
      </RecoilRoot>,
    );

    expect(screen.getByRole('region', { name: 'com_ui_memory_proposed' })).toBeInTheDocument();
    expect(screen.getAllByText('com_ui_memory_proposed')).toHaveLength(2);
    expect(screen.getByText('favorite quote')).toBeInTheDocument();
    expect(screen.getByText('To be, or not to be.')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_proposed_arguments')).not.toBeInTheDocument();
    expect(screen.getByText(/npm test/)).toBeInTheDocument();
  });
});
