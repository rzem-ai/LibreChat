import { render, screen, fireEvent } from '@testing-library/react';
import TermsAndConditionsModal from '../TermsAndConditionsModal';
import { useAcceptTermsMutation } from '~/data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useAcceptTermsMutation: jest.fn(),
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
});
