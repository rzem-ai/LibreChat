import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { useDeleteAgentApiKeyMutation } from 'librechat-data-provider/react-query';
import { render, fireEvent, waitFor } from 'test/layout-test-utils';
import DeleteKeyDialog from '../DeleteKeyDialog';

jest.mock('librechat-data-provider/react-query', () => ({
  ...jest.requireActual('librechat-data-provider/react-query'),
  useDeleteAgentApiKeyMutation: jest.fn(),
}));

const mockDelete = useDeleteAgentApiKeyMutation as jest.Mock;

// Deloitte Custom Change: verifies service account scope is preserved for key revocation.
describe('DeleteKeyDialog', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    mockDelete.mockReturnValue({ mutate, isLoading: false });
  });

  it('renders nothing actionable while closed', () => {
    const { queryByText } = render(
      <DeleteKeyDialog
        id="key-1"
        name="CI Pipeline"
        keyPrefix="lc-abc123"
        userEmail="eval@example.com"
        open={false}
        onOpenChange={jest.fn()}
      />,
    );
    expect(queryByText(/This action cannot be undone/)).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows the key details and deletes on confirm', async () => {
    mutate.mockImplementation((_variables, opts) => opts?.onSuccess?.());
    const onOpenChange = jest.fn();
    const { getByRole, getByText } = render(
      <DeleteKeyDialog
        id="key-1"
        name="CI Pipeline"
        keyPrefix="lc-abc123"
        userEmail="eval@example.com"
        open
        onOpenChange={onOpenChange}
      />,
    );

    expect(getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(getByText(/lc-abc123/)).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        { id: 'key-1', userEmail: 'eval@example.com' },
        expect.any(Object),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
