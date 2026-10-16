import { FormProvider, useForm } from 'react-hook-form';
import { render, screen } from '@testing-library/react';
import SkillContentEditor from '../SkillContentEditor';

jest.mock(
  '@librechat/client',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
      TextareaAutosize: React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
        (props, ref) => React.createElement('textarea', { ...props, ref }),
      ),
      Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
        React.createElement('button', props, children),
      TooltipAnchor: ({ render: element }: { render: React.ReactNode }) => element,
    };
  },
  { virtual: true },
);

jest.mock('~/components/Chat/Messages/Content/MarkdownComponents', () => ({
  codeNoExecution: () => null,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
  langSubset: [],
}));

function EditorWithForm() {
  const methods = useForm({ defaultValues: { body: '# Preview' } });
  return (
    <FormProvider {...methods}>
      <SkillContentEditor name="body" isEditing={true} setIsEditing={jest.fn()} readOnly />
    </FormProvider>
  );
}

describe('SkillContentEditor', () => {
  it('shows the preview rather than an active editor when read-only', () => {
    render(<EditorWithForm />);
    expect(screen.queryByRole('textbox', { name: 'com_ui_skill_content' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_done' })).not.toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });
});
