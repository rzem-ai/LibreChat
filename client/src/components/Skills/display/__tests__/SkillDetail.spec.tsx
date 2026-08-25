/**
 * Focused coverage for the wiring between `SkillDetail` and `SkillToggle`:
 * the detail view now passes a visible `label` ("Active"/"Disabled") down
 * to the toggle based on the skill's per-user active state, and clicking it
 * calls `toggle(skill)` from `useSkillActiveState`. `SkillToggle` itself is
 * real here (only its heavier siblings — sharing, delete, markdown — are
 * stubbed) so this test exercises the actual integration, not just the
 * isolated component.
 */
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TSkill } from 'librechat-data-provider';
import SkillDetail from '../SkillDetail';

const mockIsActive = jest.fn();
const mockToggle = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: { id: 'user-1', role: 'USER' } }),
  useSkillPermissions: () => ({
    isLoading: false,
    isOwner: true,
    isAdmin: false,
    canEdit: false,
    canDelete: false,
    canShare: false,
  }),
  useSkillActiveState: () => ({ isActive: mockIsActive, toggle: mockToggle }),
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

jest.mock('../SkillMarkdownRenderer', () => () => null);

jest.mock('../../buttons', () => ({
  ShareSkill: () => null,
  // Real `SkillToggle` — this test is specifically about that wiring.
  SkillToggle: jest.requireActual('../../buttons/SkillToggle').default,
}));

const makeSkill = (overrides: Partial<TSkill> = {}): TSkill => ({
  _id: 'skill-1',
  name: 'brand-guidelines',
  displayTitle: 'Brand Guidelines',
  description: 'Apply brand styling',
  body: '# Brand Guidelines\n\nUse the brand colors.',
  author: 'user-1',
  authorName: 'Jane',
  version: 1,
  source: 'inline',
  fileCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SkillDetail toggle wiring', () => {
  it('shows the "Active" label and a checked switch when the skill is active', () => {
    mockIsActive.mockReturnValue(true);
    render(<SkillDetail skill={makeSkill()} />);

    expect(screen.getByText('com_ui_active')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the "Disabled" label and an unchecked switch when the skill is inactive', () => {
    mockIsActive.mockReturnValue(false);
    render(<SkillDetail skill={makeSkill()} />);

    expect(screen.getByText('com_ui_disabled')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('calls toggle with the skill when the switch is clicked', async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    mockIsActive.mockReturnValue(true);
    render(<SkillDetail skill={skill} />);

    await user.click(screen.getByRole('switch'));

    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledWith(skill);
  });
});
