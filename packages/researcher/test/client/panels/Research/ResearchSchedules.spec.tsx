import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import type { TResearchSchedule } from '../../../../src/contract/types';
import ResearchSchedules from '../../../../src/client/panels/Research/ResearchSchedules';

const mockToast = jest.fn();
const mockMutate = jest.fn();
let mockSchedules: TResearchSchedule[] | undefined;

jest.mock('../../../../src/client/hooks', () => ({
  useResearchSchedulesQuery: () => ({
    data: mockSchedules ? { schedules: mockSchedules } : undefined,
    isLoading: false,
    isError: false,
  }),
  useUpdateResearchScheduleMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));
jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useLocalize: () => (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    useToastContext: () => ({ showToast: mockToast }),
  };
});

const schedule = (overrides: Partial<TResearchSchedule> = {}): TResearchSchedule => ({
  scheduleId: 's1',
  name: 'Morning digest',
  agentId: 'agent_research_digest',
  jobType: 'digest' as TResearchSchedule['jobType'],
  enabled: true,
  channels: ['conversation'],
  availableChannels: ['conversation', 'email'],
  ...overrides,
});

beforeEach(() => {
  mockToast.mockClear();
  mockMutate.mockClear();
  mockSchedules = [];
});

describe('ResearchSchedules', () => {
  it('renders nothing when the user has no research schedules', () => {
    const { container } = render(<ResearchSchedules />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists research schedules with their job type and paused state', () => {
    mockSchedules = [schedule(), schedule({ scheduleId: 's2', name: 'Trends', enabled: false })];
    render(<ResearchSchedules />);
    const region = screen.getByRole('region', { name: 'com_ui_research_schedules' });
    const items = within(region).getAllByRole('listitem');
    expect(within(items[0]).getByText('Morning digest')).toBeInTheDocument();
    expect(within(items[0]).getByText('com_ui_research_type_digest')).toBeInTheDocument();
    expect(within(items[1]).getByText('com_ui_research_schedule_paused')).toBeInTheDocument();
  });

  it('turns email delivery on and off for a schedule', async () => {
    mockSchedules = [schedule()];
    const { rerender } = render(<ResearchSchedules />);
    const toggle = screen.getByRole('switch', {
      name: 'com_ui_research_schedule_email:{"name":"Morning digest"}',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(mockMutate).toHaveBeenCalledWith(
      { scheduleId: 's1', channels: ['conversation', 'email'] },
      expect.any(Object),
    );

    mockSchedules = [schedule({ channels: ['conversation', 'email'] })];
    rerender(<ResearchSchedules />);
    await userEvent.click(screen.getByRole('switch'));
    expect(mockMutate).toHaveBeenLastCalledWith(
      { scheduleId: 's1', channels: ['conversation'] },
      expect.any(Object),
    );
  });

  it('reports a failed save', async () => {
    mockSchedules = [schedule()];
    render(<ResearchSchedules />);
    await userEvent.click(screen.getByRole('switch'));
    mockMutate.mock.calls[0][1].onError(new Error('x'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_research_schedule_save_error', status: 'error' }),
    );
  });

  it('explains conversation-only delivery when email cannot be offered', () => {
    mockSchedules = [schedule({ availableChannels: ['conversation'] })];
    render(<ResearchSchedules />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_research_schedule_conversation_only')).toBeInTheDocument();
  });
});
