import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FormEvent, ReactNode } from 'react';
import CreateSkillDialog from '../CreateSkillDialog';

const mockMutate = jest.fn();
const mockNavigate = jest.fn();
const mockSetIsOpen = jest.fn();
const mockShowToast = jest.fn();
let mockIsLoading = false;

// Deloitte Custom Change: Capture mutation callbacks so tests can simulate scanner results.
interface MutationOptions {
  onSuccess?: (skill: { _id: string; warnings?: unknown[] }) => void;
  onError?: (error: unknown) => void;
}

// Deloitte Custom Change: Store dialog and mutation callbacks exercised by scanner error tests.
let capturedMutationOptions: MutationOptions | undefined;
let capturedOnOpenChange: ((open: boolean) => void) | undefined;

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock(
  '@librechat/client',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactDOM = jest.requireActual<typeof import('react-dom')>('react-dom');
    return {
      Button: ({
        children,
        variant: _variant,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
        React.createElement('button', props, children),
      Spinner: () => React.createElement('div', { 'data-testid': 'spinner' }),
      // Deloitte Custom Change: Expose dialog close callbacks so scanner error reset paths can be tested.
      OGDialog: ({
        open,
        onOpenChange,
        children,
      }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        children: ReactNode;
      }) => {
        capturedOnOpenChange = onOpenChange;
        return open ? React.createElement(React.Fragment, null, children) : null;
      },
      OGDialogContent: ({ children }: { children: ReactNode }) =>
        ReactDOM.createPortal(React.createElement('div', null, children), globalThis.document.body),
      TextareaAutosize: React.forwardRef<
        HTMLTextAreaElement,
        React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
          minRows?: number;
          maxRows?: number;
        }
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
  // Deloitte Custom Change: Capture create mutation options for inline scanner error tests.
  useCreateSkillMutation: (options: MutationOptions) => {
    capturedMutationOptions = options;
    return {
      mutate: mockMutate,
      isLoading: mockIsLoading,
    };
  },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_name: 'Name',
      com_ui_description: 'Description',
      com_ui_skill_instructions: 'Instructions',
      com_ui_cancel: 'Cancel',
      com_ui_create: 'Create',
      // Deloitte Custom Change: Provide the create fallback message used by scan error formatting.
      com_ui_skill_create_error: 'Failed to create the skill',
      com_ui_skill_scanning: 'Reviewing your skill...',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  // Deloitte Custom Change: Use the real scanner formatter so tests cover production message formatting.
  formatSkillScanError: jest.requireActual('~/utils/skills').formatSkillScanError,
}));

// Deloitte Custom Change: Build API-shaped scanner errors for inline display assertions.
function scanErrorFromIssues(messages: string[]) {
  return {
    response: {
      data: {
        issues: messages.map((message) => ({ message })),
      },
    },
  };
}

describe('CreateSkillDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMutationOptions = undefined;
    capturedOnOpenChange = undefined;
    mockIsLoading = false;
  });

  it('shows a busy create button while pending', () => {
    mockIsLoading = true;
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    const button = screen.getByRole('button', { name: 'Reviewing your skill...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('restores the create button after a scanner error', () => {
    mockIsLoading = true;
    const { rerender } = render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    mockIsLoading = false;
    rerender(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    const button = screen.getByRole('button', { name: 'Create' });
    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('bad skill');
  });

  it('does not submit an ancestor form when rendered through a portal', async () => {
    const handleAgentSubmit = jest.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );

    render(
      <form onSubmit={handleAgentSubmit}>
        <CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />
      </form>,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'portal-skill' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A skill created from Agent Builder' },
    });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Apply the portal skill.' },
    });

    const createButton = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        name: 'portal-skill',
        description: 'A skill created from Agent Builder',
        body: 'Apply the portal skill.',
      }),
    );
    expect(handleAgentSubmit).not.toHaveBeenCalled();
  });

  // Deloitte Custom Change: Verify create scan failures render as persistent accessible inline text.
  it('renders the scanner error as an alert and preserves multi-line content', () => {
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['first issue', 'second issue']));
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('first issue');
    expect(alert).toHaveTextContent('second issue');
    expect(alert.textContent).toBe('first issue\nsecond issue');
    expect(alert.className).toContain('whitespace-pre-line');
  });

  // Deloitte Custom Change: Verify successful create retries remove stale scanner output.
  it('clears the scanner error on retry success', () => {
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('bad skill');

    act(() => {
      capturedMutationOptions?.onSuccess?.({ _id: 'skill-1' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Deloitte Custom Change: Verify explicit cancel clears inline scanner output.
  it('clears the scanner error when the dialog is closed via the Cancel button', () => {
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockSetIsOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Deloitte Custom Change: Verify Escape-driven dialog closes clear inline scanner output.
  it('clears the scanner error when the dialog is closed via Escape', () => {
    // Radix's Dialog.Root funnels both the Escape key and an overlay click into a
    // single `onOpenChange(false)` call, which OGDialog forwards unchanged. Invoking
    // the captured callback exercises the exact same code path the dialog uses in
    // production for either interaction.
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      capturedOnOpenChange?.(false);
    });

    expect(mockSetIsOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Deloitte Custom Change: Verify overlay-driven dialog closes clear inline scanner output.
  it('clears the scanner error when the dialog is closed via an overlay click', () => {
    render(<CreateSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      capturedMutationOptions?.onError?.(scanErrorFromIssues(['bad skill']));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulates Radix's overlay pointerdown handler, which also calls
    // `onOpenChange(false)` — identical to the Escape path above.
    act(() => {
      capturedOnOpenChange?.(false);
    });

    expect(mockSetIsOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
