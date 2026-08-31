import { InvocationMode } from 'librechat-data-provider';
import { act, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { TSkill } from 'librechat-data-provider';
import SkillForm from '../SkillForm';

const mockNavigate = jest.fn();
const mockShowToast = jest.fn();
const mockRefetch = jest.fn();

interface MutationOptions {
  onSuccess?: (skill: TSkill) => void;
  onError?: (error: unknown) => void;
}

let capturedMutationOptions: MutationOptions | undefined;
let mockCurrentSkill: TSkill;

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock(
  '@librechat/client',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
      Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
        (props, ref) => React.createElement('input', { ...props, ref }),
      ),
      Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
        React.createElement('button', props, children),
      Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props),
      TextareaAutosize: React.forwardRef<
        HTMLTextAreaElement,
        TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }
      >(({ minRows: _minRows, maxRows: _maxRows, ...props }, ref) =>
        React.createElement('textarea', { ...props, ref }),
      ),
      useToastContext: () => ({
        showToast: mockShowToast,
      }),
    };
  },
  { virtual: true },
);

jest.mock('~/data-provider', () => ({
  useGetSkillQuery: () => ({
    data: mockCurrentSkill,
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  }),
  useUpdateSkillMutation: (options: MutationOptions) => {
    capturedMutationOptions = options;
    return {
      mutate: jest.fn(),
      isLoading: false,
    };
  },
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, params?: Record<string, string | number | undefined>): string => {
      const translations: Record<string, string> = {
        com_ui_skill_edit_title: 'Edit skill',
        com_ui_name: 'Name',
        com_ui_description: 'Description',
        com_ui_reset: 'Reset',
        com_ui_save: 'Save',
        com_ui_skill_version: `Version ${params?.[0]}`,
      };
      return translations[key] ?? key;
    },
  useSkillPermissions: () => ({
    isLoading: false,
    isOwner: true,
    isAdmin: false,
    canEdit: true,
    canDelete: false,
    canShare: false,
  }),
}));

jest.mock('../InvocationModePicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../SkillContentEditor', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../CategorySelector', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../dialogs/DeleteSkill', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../buttons', () => ({
  ShareSkill: () => null,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  formatSkillScanError: jest.requireActual('~/utils/skills').formatSkillScanError,
}));

function makeSkill(overrides: Partial<TSkill> = {}): TSkill {
  return {
    _id: 'skill-1',
    name: 'demo-skill',
    description: 'A demo skill',
    body: 'Do the thing.',
    category: '',
    invocationMode: InvocationMode.auto,
    author: 'user-1',
    authorName: 'Author',
    version: 1,
    source: 'inline',
    fileCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function scanErrorFromIssues(messages: string[]) {
  return {
    response: {
      data: {
        issues: messages.map((message) => ({ message })),
      },
    },
  };
}

describe('SkillForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMutationOptions = undefined;
    mockCurrentSkill = makeSkill();
  });

  it('renders the scanner error as an alert and preserves multi-line content', async () => {
    render(<SkillForm skillId="skill-1" />);
    await act(async () => {});

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['first issue', 'second issue']));
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('first issue');
    expect(alert).toHaveTextContent('second issue');
    expect(alert.textContent).toBe('first issue\nsecond issue');
    expect(alert.className).toContain('whitespace-pre-line');
  });

  it('clears the scanner error when switching to a different skill', async () => {
    const { rerender } = render(<SkillForm skillId="skill-1" />);
    await act(async () => {});

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('bad skill');

    mockCurrentSkill = makeSkill({ _id: 'skill-2', name: 'other-skill' });
    rerender(<SkillForm skillId="skill-2" />);
    await act(async () => {});

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
