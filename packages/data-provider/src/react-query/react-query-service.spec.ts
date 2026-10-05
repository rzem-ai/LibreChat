// Deloitte Custom Change: verifies API key mutations invalidate only the selected account cache.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '../keys';
import { useCreateAgentApiKeyMutation, useDeleteAgentApiKeyMutation } from './react-query-service';

const invalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

describe('Agent API key mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries });
  });

  test('invalidates only the created key owner cache', () => {
    useCreateAgentApiKeyMutation();

    const [, options] = (useMutation as jest.Mock).mock.calls[0];
    options.onSuccess(undefined, { name: 'evals', userEmail: 'eval@example.com' });

    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.agentApiKeys, 'eval@example.com']);
  });

  test('invalidates only the revoked key owner cache', () => {
    useDeleteAgentApiKeyMutation();

    const [, options] = (useMutation as jest.Mock).mock.calls[0];
    options.onSuccess(undefined, { id: 'key-id', userEmail: 'eval@example.com' });

    expect(invalidateQueries).toHaveBeenCalledWith([QueryKeys.agentApiKeys, 'eval@example.com']);
  });
});
