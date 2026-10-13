import { render, screen, fireEvent } from '@testing-library/react';
import TermsAndConditionsModal from '../TermsAndConditionsModal';
import { useAcceptTermsMutation } from '~/data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useAcceptTermsMutation: jest.fn(),
}));

// Deloitte Custom Change: stubbed out — MarkdownLite's import chain currently pulls in
// Prompts/display/PromptTextCard.tsx, which imports the nonexistent `lucide` package
// (pre-existing bug on develop, unrelated to this component) and breaks test resolution.
jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <>{content}</>,
}));

describe('TermsAndConditionsModal', () => {
  const mockUseAcceptTermsMutation = useAcceptTermsMutation as jest.Mock;
  const mutate = jest.fn();

  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    title: 'Terms and Conditions',
    eyebrow: 'MyAssist',
    modalContent: 'Sample terms content',
  };

  beforeEach(() => {
    mockUseAcceptTermsMutation.mockReturnValue({ mutate });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the eyebrow, title, and Accept/Decline actions', () => {
    render(<TermsAndConditionsModal {...defaultProps} />);
    expect(screen.getByText('MyAssist')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Terms and Conditions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_decline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_accept' })).toBeInTheDocument();
  });

  it('calls the accept mutation when Accept is clicked', () => {
    render(<TermsAndConditionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_accept' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline and closes when Decline is clicked', () => {
    render(<TermsAndConditionsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_decline' }));
    expect(defaultProps.onDecline).toHaveBeenCalledTimes(1);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks dismissal via Escape — Accept or Decline are the only exits', () => {
    const onOpenChange = jest.fn();
    render(<TermsAndConditionsModal {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    // Also assert the dialog is still rendered, not just that the spy was quiet —
    // guards against the assertion above passing vacuously if Escape never reached Radix.
    expect(screen.getByRole('heading', { name: 'Terms and Conditions' })).toBeInTheDocument();
  });

  // Deloitte Custom Change: read-only mode (no onAccept/onDecline) is how the avatar
  // menu reopens terms that were already accepted — unlike the acceptance flow above,
  // every dismissal path should be allowed since there's no choice left to force.
  describe('read-only mode (onAccept/onDecline omitted)', () => {
    const readOnlyProps = {
      open: true,
      title: 'Terms and Conditions',
      eyebrow: 'MyAssist',
      modalContent: 'Sample terms content',
    };

    it('renders only a Close action, with no Accept/Decline', () => {
      render(<TermsAndConditionsModal {...readOnlyProps} onOpenChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'com_ui_accept' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'com_ui_decline' })).not.toBeInTheDocument();
      // Footer Close button uses the (mocked) app-level useLocalize, returning the raw
      // key; the header X button is GelDialogHeader's own package-level useLocalize,
      // which isn't mocked here and resolves the real translation string.
      expect(screen.getByRole('button', { name: 'com_ui_close' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('dismisses via the footer Close button without running the accept mutation', () => {
      const onOpenChange = jest.fn();
      render(<TermsAndConditionsModal {...readOnlyProps} onOpenChange={onOpenChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mutate).not.toHaveBeenCalled();
    });

    it('dismisses via the header X button', () => {
      const onOpenChange = jest.fn();
      render(<TermsAndConditionsModal {...readOnlyProps} onOpenChange={onOpenChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('dismisses via Escape', () => {
      const onOpenChange = jest.fn();
      render(<TermsAndConditionsModal {...readOnlyProps} onOpenChange={onOpenChange} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('dismisses via an outside click', async () => {
      const onOpenChange = jest.fn();
      render(<TermsAndConditionsModal {...readOnlyProps} onOpenChange={onOpenChange} />);
      // Radix defers attaching its outside-click listener by a tick so the
      // triggering click (e.g. the menu item that opened this dialog) can't
      // immediately close it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
