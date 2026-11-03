import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useResearchSchedulesQuery,
  useUpdateResearchScheduleMutation,
} from '../../../src/client/hooks';
import { ResearchQueryKeys } from '../../../src/contract/keys';

const mockList = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../src/contract/service', () => ({
  ...jest.requireActual('../../../src/contract/service'),
  getResearchSchedules: (...a: unknown[]) => mockList(...a),
  updateResearchSchedule: (...a: unknown[]) => mockUpdate(...a),
}));

const client = () =>
  new QueryClient({
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const wrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };

describe('research schedule hooks', () => {
  it('loads the research schedules', async () => {
    mockList.mockResolvedValueOnce({ schedules: [{ scheduleId: 's1' }] });
    const { result } = renderHook(() => useResearchSchedulesQuery(), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.schedules).toHaveLength(1);
  });

  it('saves channels and refreshes the list even when the save fails', async () => {
    const queryClient = client();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockUpdate.mockRejectedValueOnce(new Error('research_channel_unavailable'));
    const { result } = renderHook(() => useUpdateResearchScheduleMutation(), {
      wrapper: wrapper(queryClient),
    });
    await act(async () => {
      await result.current
        .mutateAsync({ scheduleId: 's1', channels: ['conversation', 'email'] })
        .catch(() => undefined);
    });
    expect(mockUpdate).toHaveBeenCalledWith('s1', { channels: ['conversation', 'email'] });
    expect(invalidate).toHaveBeenCalledWith([ResearchQueryKeys.researchSchedules]);
  });
});
