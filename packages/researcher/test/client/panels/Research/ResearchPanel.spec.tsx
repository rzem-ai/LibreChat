import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import type { TResearchJob } from '../../../../src/contract/types';
import ResearchPanel from '../../../../src/client/panels/Research/ResearchPanel';
import { chrome } from '../chrome';

const mockRefetch = jest.fn();
const mockCancel = jest.fn();
let mockQuery: { data?: { jobs: TResearchJob[] }; isLoading: boolean; isError: boolean };

let mockSchedules: unknown[] = [];

jest.mock('../../../../src/client/hooks', () => ({
  useResearchJobsQuery: () => ({ ...mockQuery, refetch: mockRefetch }),
  useCancelResearchJobMutation: () => ({ mutate: mockCancel, isLoading: false }),
  useResearchSchedulesQuery: () => ({ data: { schedules: mockSchedules } }),
  useUpdateResearchScheduleMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useLocalize: () => (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

const job = (overrides: Partial<TResearchJob>): TResearchJob => ({
  id: 'j1',
  agentId: 'agent_research_current_events',
  jobType: 'currentEvents' as TResearchJob['jobType'],
  invocationMode: 'interactive',
  status: 'researching',
  partial: false,
  prompt: 'What is happening with widgets?',
  budget: { wallClockMinutes: 30, maxSteps: 300 },
  budgetUsed: { elapsedMs: 60_000, steps: 12 },
  conversationId: 'c1',
  findingsCount: 4,
  citedCount: 0,
  deliveries: [],
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:01:00.000Z',
  ...overrides,
});

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ResearchPanel chrome={chrome} />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockRefetch.mockClear();
  mockCancel.mockClear();
  mockQuery = { data: { jobs: [] }, isLoading: false, isError: false };
  mockSchedules = [];
});

describe('ResearchPanel', () => {
  it('labels the panel region', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'com_ui_research' })).toBeInTheDocument();
  });

  it('offers a retry when jobs fail to load', async () => {
    mockQuery = { isLoading: false, isError: true };
    renderPanel();
    expect(screen.getByText('com_ui_research_error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('explains how to start when there are no jobs', () => {
    renderPanel();
    expect(screen.getByText('com_ui_research_empty_title')).toBeInTheDocument();
    expect(screen.getByText('com_ui_research_empty')).toBeInTheDocument();
  });

  it('shows a live job with its progress and lets the owner cancel it', async () => {
    mockQuery.data = { jobs: [job({})] };
    renderPanel();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('com_ui_research_type_currentEvents')).toBeInTheDocument();
    expect(within(item).getByText('com_ui_research_status_researching')).toBeInTheDocument();
    expect(
      within(item).getByText('com_ui_research_steps:{"used":12,"max":300}'),
    ).toBeInTheDocument();
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/c/c1');
    await userEvent.click(within(item).getByRole('button', { name: 'com_ui_research_cancel' }));
    expect(mockCancel).toHaveBeenCalledWith('j1', expect.anything());
  });

  it('shows the verification summary of a delivered partial job without a cancel control', () => {
    mockQuery.data = {
      jobs: [
        job({
          status: 'delivered',
          partial: true,
          verification: { supported: 8, unsupported: 1, unavailable: 0, total: 9 },
        }),
      ],
    };
    renderPanel();
    const item = screen.getByRole('listitem');
    expect(
      within(item).getByText(
        'com_ui_research_verification:{"supported":8,"unsupported":1,"unavailable":0}',
      ),
    ).toBeInTheDocument();
    expect(within(item).getByText('com_ui_research_partial')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'com_ui_research_cancel' })).toBeNull();
  });

  it('shows a delivered job with a failed email as delivered with warnings', () => {
    mockQuery.data = {
      jobs: [
        job({
          status: 'delivered',
          deliveries: [
            { channel: 'conversation', state: 'sent' },
            { channel: 'email', state: 'failed', error: 'email_failed', attempts: 5 },
            { channel: 'teams', state: 'pending', attempts: 1 },
          ],
        }),
      ],
    };
    renderPanel();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('com_ui_research_status_delivered')).toBeInTheDocument();
    expect(
      within(item).getByText(
        'com_ui_research_delivery_failed:{"channel":"com_ui_research_channel_email"}',
      ),
    ).toBeInTheDocument();
    expect(
      within(item).getByText(
        'com_ui_research_delivery_pending:{"channel":"com_ui_research_channel_teams"}',
      ),
    ).toBeInTheDocument();
    expect(within(item).queryByText(/channel_conversation/)).not.toBeInTheDocument();
  });

  it('shows the user’s research schedules beneath the jobs', () => {
    mockSchedules = [
      {
        scheduleId: 's1',
        name: 'Morning digest',
        agentId: 'agent_research_digest',
        jobType: 'digest',
        enabled: true,
        channels: ['conversation'],
        availableChannels: ['conversation', 'email'],
      },
    ];
    renderPanel();
    expect(screen.getByRole('region', { name: 'com_ui_research_schedules' })).toBeInTheDocument();
  });

  it('tells the user to verify their address when email was refused for that', () => {
    mockQuery.data = {
      jobs: [
        job({
          status: 'delivered',
          deliveries: [{ channel: 'email', state: 'failed', error: 'email_unverified' }],
        }),
      ],
    };
    renderPanel();
    expect(screen.getByText('com_ui_research_delivery_email_unverified')).toBeInTheDocument();
  });

  it('names a job by its brief’s question rather than the heading', () => {
    mockQuery.data = {
      jobs: [
        job({ brief: '# Research Brief\n## Question\nWhere are widgets heading?\n## Sources' }),
      ],
    };
    renderPanel();
    expect(screen.getByText('Where are widgets heading?')).toBeInTheDocument();
    expect(screen.queryByText('# Research Brief')).toBeNull();
  });

  it('explains a failed job by its reason code', () => {
    mockQuery.data = { jobs: [job({ status: 'failed', failureReason: 'brief_failed' })] };
    renderPanel();
    expect(screen.getByText('com_ui_research_failed_brief_failed')).toBeInTheDocument();
  });

  it('says how many sentences of a delivered report carry no citation', () => {
    mockQuery.data = {
      jobs: [
        job({
          status: 'delivered',
          verification: { supported: 3, unsupported: 0, unavailable: 0, total: 3, uncited: 2 },
        }),
      ],
    };
    renderPanel();
    expect(screen.getByText('com_ui_research_uncited:{"count":2}')).toBeInTheDocument();
  });

  it('explains a job that could not be verified or delivered', () => {
    mockQuery.data = { jobs: [job({ status: 'failed', failureReason: 'verification_failed' })] };
    renderPanel();
    expect(screen.getByText('com_ui_research_failed_verification_failed')).toBeInTheDocument();
  });
});
