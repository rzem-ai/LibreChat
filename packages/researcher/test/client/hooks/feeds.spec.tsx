import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useMoveResearchFeedMutation,
  useRenameResearchFeedFolderMutation,
  useResearchFeedsQuery,
  useResearchFeedItemsQuery,
  useImportResearchFeedsMutation,
  useResearchFeedCatalogueQuery,
  useUnsubscribeResearchFeedMutation,
  useSubscribeResearchCatalogueFeedMutation,
} from '../../../src/client/hooks';
import { ResearchQueryKeys } from '../../../src/contract/keys';

const mockService = {
  getResearchFeeds: jest.fn(),
  getResearchFeedItems: jest.fn(),
  getResearchFeedCatalogue: jest.fn(),
  importResearchFeeds: jest.fn(),
  unsubscribeResearchFeed: jest.fn(),
  subscribeResearchCatalogueFeed: jest.fn(),
  moveResearchFeed: jest.fn(),
  renameResearchFeedFolder: jest.fn(),
};

jest.mock('../../../src/contract/service', () => ({
  ...jest.requireActual('../../../src/contract/service'),
  getResearchFeeds: (...a: unknown[]) => mockService.getResearchFeeds(...a),
  getResearchFeedItems: (...a: unknown[]) => mockService.getResearchFeedItems(...a),
  getResearchFeedCatalogue: (...a: unknown[]) => mockService.getResearchFeedCatalogue(...a),
  importResearchFeeds: (...a: unknown[]) => mockService.importResearchFeeds(...a),
  unsubscribeResearchFeed: (...a: unknown[]) => mockService.unsubscribeResearchFeed(...a),
  subscribeResearchCatalogueFeed: (...a: unknown[]) =>
    mockService.subscribeResearchCatalogueFeed(...a),
  moveResearchFeed: (...a: unknown[]) => mockService.moveResearchFeed(...a),
  renameResearchFeedFolder: (...a: unknown[]) => mockService.renameResearchFeedFolder(...a),
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

beforeEach(() => Object.values(mockService).forEach((fn) => fn.mockReset()));

describe('feed data-provider hooks', () => {
  it('loads subscriptions and the catalogue', async () => {
    mockService.getResearchFeeds.mockResolvedValueOnce({ subscriptions: [], maxPerUser: 100 });
    mockService.getResearchFeedCatalogue.mockResolvedValueOnce({ feeds: [] });
    const queryClient = client();
    const feeds = renderHook(() => useResearchFeedsQuery(), { wrapper: wrapper(queryClient) });
    const catalogue = renderHook(() => useResearchFeedCatalogueQuery(), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(feeds.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(catalogue.result.current.isSuccess).toBe(true));
    expect(feeds.result.current.data?.maxPerUser).toBe(100);
  });

  it('loads a feed’s history only when enabled', async () => {
    mockService.getResearchFeedItems.mockResolvedValue({ feedId: 'f1', items: [] });
    const queryClient = client();
    const { rerender, result } = renderHook(
      ({ enabled }) => useResearchFeedItemsQuery('f1', { enabled }),
      { wrapper: wrapper(queryClient), initialProps: { enabled: false } },
    );
    expect(mockService.getResearchFeedItems).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockService.getResearchFeedItems).toHaveBeenCalledWith('f1');
  });

  it.each([
    ['import', () => useImportResearchFeedsMutation(), { opml: '<opml/>' }, 'importResearchFeeds'],
    ['unsubscribe', () => useUnsubscribeResearchFeedMutation(), 'f1', 'unsubscribeResearchFeed'],
    [
      'catalogue subscribe',
      () => useSubscribeResearchCatalogueFeedMutation(),
      'f1',
      'subscribeResearchCatalogueFeed',
    ],
  ] as const)(
    'refreshes subscriptions after %s, even when it fails',
    async (_label, hook, variables, service) => {
      const queryClient = client();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      mockService[service].mockRejectedValueOnce(new Error('nope'));
      const { result } = renderHook(
        hook as () => { mutateAsync: (v: unknown) => Promise<unknown> },
        {
          wrapper: wrapper(queryClient),
        },
      );
      await act(async () => {
        await result.current.mutateAsync(variables).catch(() => undefined);
      });
      expect(mockService[service]).toHaveBeenCalledWith(variables);
      expect(invalidate).toHaveBeenCalledWith([ResearchQueryKeys.researchFeeds]);
    },
  );

  it('moves a feed and renames a folder, refreshing subscriptions either way', async () => {
    const queryClient = client();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockService.moveResearchFeed.mockResolvedValueOnce({ feedId: 'f1' });
    mockService.renameResearchFeedFolder.mockRejectedValueOnce(new Error('x'));
    const move = renderHook(() => useMoveResearchFeedMutation(), { wrapper: wrapper(queryClient) });
    const rename = renderHook(() => useRenameResearchFeedFolderMutation(), {
      wrapper: wrapper(queryClient),
    });
    await act(async () => {
      await move.result.current.mutateAsync({ feedId: 'f1', folder: ['AI'] });
      await rename.result.current
        .mutateAsync({ from: ['AI'], to: ['Artificial Intelligence'] })
        .catch(() => undefined);
    });
    expect(mockService.moveResearchFeed).toHaveBeenCalledWith('f1', { folder: ['AI'] });
    expect(mockService.renameResearchFeedFolder).toHaveBeenCalledWith({
      from: ['AI'],
      to: ['Artificial Intelligence'],
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
