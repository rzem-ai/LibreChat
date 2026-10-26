// Deloitte Custom Change: integration coverage for the Settings tab's Memories panel —
// filtering, the filtered/unfiltered empty states, inline delete confirmation and create.
import userEvent from '@testing-library/user-event';
import type { TUserMemory } from 'librechat-data-provider';
import { render, screen } from 'test/layout-test-utils';
import MemoriesSettingsPanel from '../index';

const buildMemory = (key: string, value: string, agentId?: string): TUserMemory => ({
  key,
  value,
  updated_at: new Date(2026, 0, 1).toISOString(),
  ...(agentId ? { agentId, agentName: 'Agent' } : {}),
});

let mockMemories: TUserMemory[] = [];
const mockDelete = jest.fn();
const mockCreate = jest.fn();

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useMemoriesQuery: jest.fn(() => ({
    data: { memories: mockMemories, totalTokens: 0, tokenLimit: null, usagePercentage: null },
    isLoading: false,
  })),
  useGetUserQuery: jest.fn(() => ({ data: undefined })),
  useDeleteMemoryMutation: jest.fn(() => ({ mutate: mockDelete, isLoading: false })),
  useCreateMemoryMutation: jest.fn(() => ({ mutate: mockCreate, isLoading: false })),
  useUpdateMemoryMutation: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
  useUpdateMemoryPreferencesMutation: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

describe('MemoriesSettingsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMemories = [buildMemory('alpha', 'first value'), buildMemory('beta', 'second value')];
  });

  it('lists memories and filters them by search query', async () => {
    render(<MemoriesSettingsPanel />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /filter/i }), 'alpha');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('shows the no-match state, not the add CTA, when a search matches nothing', async () => {
    render(<MemoriesSettingsPanel />);
    await userEvent.type(screen.getByRole('textbox', { name: /filter/i }), 'zzz');
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a memory/i })).not.toBeInTheDocument();
  });

  it('shows the add CTA when there are no memories at all', () => {
    mockMemories = [];
    render(<MemoriesSettingsPanel />);
    expect(screen.getByRole('button', { name: /add a memory/i })).toBeInTheDocument();
  });

  it('confirms deletion inline before deleting', async () => {
    render(<MemoriesSettingsPanel />);
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);
    expect(mockDelete).not.toHaveBeenCalled();

    // The confirming card hides its trash button, so its confirm button is the first match.
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0]);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'alpha' }),
      expect.any(Object),
    );
  });

  it('clears the inline form when cancelled so reopening starts fresh', async () => {
    render(<MemoriesSettingsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /add a memory/i }));
    await userEvent.type(screen.getByLabelText(/key/i), 'draft');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await userEvent.click(screen.getByRole('button', { name: /add a memory/i }));
    expect(screen.getByLabelText(/key/i)).toHaveValue('');
  });

  it('creates a memory from the inline row', async () => {
    render(<MemoriesSettingsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /add a memory/i }));
    await userEvent.type(screen.getByLabelText(/key/i), 'gamma');
    await userEvent.type(screen.getByLabelText(/value/i), 'third value');
    await userEvent.click(screen.getByRole('button', { name: /create memory/i }));
    expect(mockCreate).toHaveBeenCalledWith({ key: 'gamma', value: 'third value' });
  });
});
