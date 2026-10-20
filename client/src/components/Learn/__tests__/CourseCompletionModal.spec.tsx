import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseCompletionModal from '../CourseCompletionModal';

const mockDismissCompletion = jest.fn();
const mockUseLearningTour = jest.fn();
const mockMutate = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, value?: { 0?: number }) => {
    if (value && typeof value === 'object' && 0 in value) {
      return `${key}:${value[0]}`;
    }

    return key;
  },
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const DialogContext = React.createContext({ onOpenChange: (_open: boolean) => {} });

  return {
    GEL: { Icon: () => null },
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    Textarea: React.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >((props, ref) => <textarea ref={ref} {...props} />),
    OGDialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      open ? (
        <DialogContext.Provider value={{ onOpenChange }}>{children}</DialogContext.Provider>
      ) : null,
    OGDialogTemplate: ({
      title,
      main,
      selection,
      showCloseButton,
    }: {
      title: string;
      main: React.ReactNode;
      selection: React.ReactNode;
      showCloseButton?: boolean;
    }) => {
      const { onOpenChange } = React.useContext(DialogContext);
      return (
        <div>
          <h1>{title}</h1>
          {showCloseButton ? (
            <button aria-label="Close" onClick={() => onOpenChange(false)} />
          ) : null}
          {main}
          {selection}
        </div>
      );
    },
    useToastContext: () => ({ showToast: mockShowToast }),
  };
});

jest.mock('~/data-provider', () => ({
  useUpdateTutorialStateMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => mockUseLearningTour(),
}));

describe('CourseCompletionModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is hidden until a course has completed', () => {
    mockUseLearningTour.mockReturnValue({
      completedCourseId: null,
      dismissCompletion: mockDismissCompletion,
    });
    render(<CourseCompletionModal />);
    expect(screen.queryByText('com_learning_complete_title')).not.toBeInTheDocument();
  });

  it('shows the feedback form, disables submit until a rating is selected, and submits trimmed comments', () => {
    mockMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mockUseLearningTour.mockReturnValue({
      completedCourseId: 'getting-started-guide',
      dismissCompletion: mockDismissCompletion,
    });
    render(<CourseCompletionModal />);

    expect(screen.getByText('com_learning_complete_title')).toBeInTheDocument();

    const submitButton = screen.getByText('com_learning_rate_submit');
    expect(submitButton).toBeDisabled();
    expect(screen.getByLabelText('com_learning_rate_comment_label')).toHaveAttribute('rows', '3');
    expect(screen.getByText('com_learning_rate_comment_count:0')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('com_learning_rate_comment_label'), {
      target: { value: '  Very helpful tour  ' },
    });
    fireEvent.click(screen.getByTestId('course-rating-star-4'));
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        tutorialFeedback: {
          'getting-started-guide': {
            score: 4,
            comment: 'Very helpful tour',
          },
        },
      },
      expect.any(Object),
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      message: 'com_learning_rate_thanks',
    });
    expect(mockDismissCompletion).toHaveBeenCalledTimes(1);
  });

  it('dismisses the modal when the close button is clicked', () => {
    mockUseLearningTour.mockReturnValue({
      completedCourseId: 'getting-started-guide',
      dismissCompletion: mockDismissCompletion,
    });
    render(<CourseCompletionModal />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(mockDismissCompletion).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
