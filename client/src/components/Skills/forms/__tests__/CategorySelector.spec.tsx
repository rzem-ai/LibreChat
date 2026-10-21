import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import CategorySelector from '../CategorySelector';

// Deloitte Custom Change: Verify the skill CategorySelector cannot be opened or changed
// while readOnly, including a menu that was already open when readOnly became true.

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCategories: () => ({
    categories: [{ value: 'general', label: 'General' }],
    emptyCategory: { value: '', label: 'com_ui_category' },
  }),
}));

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const methods = useForm({ defaultValues: { category: '' } });
  return (
    <FormProvider {...methods}>
      <CategorySelector readOnly={readOnly} />
    </FormProvider>
  );
}

// Deloitte Custom Change: The trigger's accessible name is a static `aria-label`
// (`com_ui_category`), so selection is verified via its visible text instead.
describe('CategorySelector', () => {
  it('opens the menu and selects a category when editable', () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'com_ui_category' });
    expect(trigger).not.toBeDisabled();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const item = screen.getByRole('menuitem', { name: 'General' });
    fireEvent.click(item);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('General');
  });

  it('disables the trigger and cannot change the category when read-only', () => {
    render(<Harness readOnly />);

    const trigger = screen.getByRole('button', { name: 'com_ui_category' });
    expect(trigger).toBeDisabled();

    // A disabled trigger cannot open the menu, so the item is never reachable.
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: 'General' })).not.toBeInTheDocument();
    expect(trigger).not.toHaveTextContent('General');
  });

  it('closes an already-open menu when it becomes read-only', () => {
    const { rerender } = render(<Harness readOnly={false} />);

    const trigger = screen.getByRole('button', { name: 'com_ui_category' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    rerender(<Harness readOnly />);

    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
