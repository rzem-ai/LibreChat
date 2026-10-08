import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRenewFile = jest.fn();
const mockShowToast = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      renewFile: (...args: unknown[]) => mockRenewFile(...args),
    },
  };
});

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

import { useRenewFileMutation } from '../mutations';

describe('useRenewFileMutation — failure surfacing', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockRenewFile.mockReset();
    mockShowToast.mockReset();
  });

  test('shows an error toast when the renewal request fails', async () => {
    mockRenewFile.mockRejectedValue(new Error('429'));
    const { result } = renderHook(() => useRenewFileMutation(), { wrapper });

    act(() => {
      result.current.mutate('file-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_files_expiring_soon_renew_failed',
      status: 'error',
    });
  });

  test('forwards the error to a caller-supplied onError after showing the toast', async () => {
    mockRenewFile.mockRejectedValue(new Error('429'));
    const onError = jest.fn();
    const { result } = renderHook(() => useRenewFileMutation({ onError }), { wrapper });

    act(() => {
      result.current.mutate('file-1');
    });

    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(mockShowToast).toHaveBeenCalled();
  });

  test('does not toast an error on success', async () => {
    mockRenewFile.mockResolvedValue({ file: { file_id: 'file-1' } });
    const { result } = renderHook(() => useRenewFileMutation(), { wrapper });

    act(() => {
      result.current.mutate('file-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
