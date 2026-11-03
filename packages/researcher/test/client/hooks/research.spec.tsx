import { createElement } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useResearchJobsQuery,
  researchRefetchInterval,
  useCancelResearchJobMutation,
  useResearchConversationSync,
} from '../../../src/client/hooks';
import { ResearchQueryKeys } from '../../../src/contract/keys';

const mockCancel = jest.fn();
const mockList = jest.fn();

jest.mock('../../../src/contract/service', () => ({
  ...jest.requireActual('../../../src/contract/service'),
  cancelResearchJob: (...args: unknown[]) => mockCancel(...args),
  getResearchJobs: (...args: unknown[]) => mockList(...args),
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

describe('research data-provider hooks', () => {
  it('loads the research jobs list', async () => {
    mockList.mockResolvedValueOnce({ jobs: [{ id: 'j1', status: 'researching' }] });
    const { result } = renderHook(() => useResearchJobsQuery(), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.jobs).toHaveLength(1);
  });

  it('invalidates the jobs list after a cancel, even when the cancel fails', async () => {
    const queryClient = client();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockCancel.mockRejectedValueOnce(new Error('research_job_finished'));
    const { result } = renderHook(() => useCancelResearchJobMutation(), {
      wrapper: wrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync('j1').catch(() => undefined);
    });
    expect(mockCancel).toHaveBeenCalledWith('j1');
    expect(invalidate).toHaveBeenCalledWith([ResearchQueryKeys.researchJobs]);
  });

  describe('useResearchConversationSync', () => {
    beforeEach(() => mockList.mockReset());

    it('stays idle for ordinary agents and unsaved conversations', async () => {
      const queryClient = client();
      renderHook(() => useResearchConversationSync('c1', 'agent_other'), {
        wrapper: wrapper(queryClient),
      });
      renderHook(() => useResearchConversationSync('new', 'agent_research_digest'), {
        wrapper: wrapper(queryClient),
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockList).not.toHaveBeenCalled();
    });

    it('loads jobs for a research conversation, so a new job shows in the panel', async () => {
      mockList.mockResolvedValue({ jobs: [] });
      renderHook(() => useResearchConversationSync('c1', 'agent_research_digest'), {
        wrapper: wrapper(client()),
      });
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    });

    it('refreshes the conversation’s messages once its job finishes', async () => {
      const queryClient = client();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      mockList.mockResolvedValueOnce({ jobs: [{ conversationId: 'c1', status: 'verifying' }] });
      renderHook(() => useResearchConversationSync('c1', 'agent_research_digest'), {
        wrapper: wrapper(queryClient),
      });
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
      expect(invalidate).not.toHaveBeenCalledWith([QueryKeys.messages, 'c1']);
      mockList.mockResolvedValueOnce({ jobs: [{ conversationId: 'c1', status: 'delivered' }] });
      await act(async () => {
        await queryClient.refetchQueries([ResearchQueryKeys.researchJobs]);
      });
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.messages, 'c1']));
    });
  });

  it('polls quickly while a job is live and stops when all are finished', () => {
    expect(researchRefetchInterval({ jobs: [{ status: 'researching' }] } as never)).toBe(10_000);
    expect(researchRefetchInterval({ jobs: [{ status: 'delivered' }] } as never)).toBe(false);
    expect(researchRefetchInterval(undefined)).toBe(false);
  });
});
