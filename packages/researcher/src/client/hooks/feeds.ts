import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import type {
  TOpmlImportResult,
  TOpmlImportRequest,
  TResearchFeedFolderRename,
  TResearchFeedsResponse,
  TResearchFeedSubscription,
  TResearchCatalogueResponse,
  TResearchFeedItemsResponse,
} from '../../contract/types';
import { ResearchQueryKeys, ResearchMutationKeys, researchService } from '../../contract';

export const useResearchFeedsQuery = (
  config?: UseQueryOptions<TResearchFeedsResponse>,
): QueryObserverResult<TResearchFeedsResponse> =>
  useQuery<TResearchFeedsResponse>(
    [ResearchQueryKeys.researchFeeds],
    () => researchService.getResearchFeeds(),
    {
      refetchOnWindowFocus: false,
      ...config,
    },
  );

export const useResearchFeedCatalogueQuery = (
  config?: UseQueryOptions<TResearchCatalogueResponse>,
): QueryObserverResult<TResearchCatalogueResponse> =>
  useQuery<TResearchCatalogueResponse>(
    [ResearchQueryKeys.researchFeedCatalogue],
    () => researchService.getResearchFeedCatalogue(),
    { refetchOnWindowFocus: false, ...config },
  );

export const useResearchFeedItemsQuery = (
  feedId: string,
  config?: UseQueryOptions<TResearchFeedItemsResponse>,
): QueryObserverResult<TResearchFeedItemsResponse> =>
  useQuery<TResearchFeedItemsResponse>(
    [ResearchQueryKeys.researchFeedItems, feedId],
    () => researchService.getResearchFeedItems(feedId),
    { refetchOnWindowFocus: false, ...config },
  );

/** Each feed mutation refreshes the subscription list in `onSettled`, success or not. */
function useFeedMutation<TData, TVariables>(
  key: ResearchMutationKeys,
  fn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, Error, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVariables>([key], fn, {
    ...options,
    onSettled: (...args) => {
      queryClient.invalidateQueries([ResearchQueryKeys.researchFeeds]);
      options?.onSettled?.(...args);
    },
  });
}

export const useImportResearchFeedsMutation = (
  options?: UseMutationOptions<TOpmlImportResult, Error, TOpmlImportRequest>,
): UseMutationResult<TOpmlImportResult, Error, TOpmlImportRequest> =>
  useFeedMutation(
    ResearchMutationKeys.importResearchFeeds,
    (payload: TOpmlImportRequest) => researchService.importResearchFeeds(payload),
    options,
  );

export const useUnsubscribeResearchFeedMutation = (
  options?: UseMutationOptions<{ feedId: string }, Error, string>,
): UseMutationResult<{ feedId: string }, Error, string> =>
  useFeedMutation(
    ResearchMutationKeys.unsubscribeResearchFeed,
    (feedId: string) => researchService.unsubscribeResearchFeed(feedId),
    options,
  );

export const useSubscribeResearchCatalogueFeedMutation = (
  options?: UseMutationOptions<TResearchFeedSubscription, Error, string>,
): UseMutationResult<TResearchFeedSubscription, Error, string> =>
  useFeedMutation(
    ResearchMutationKeys.subscribeResearchCatalogueFeed,
    (feedId: string) => researchService.subscribeResearchCatalogueFeed(feedId),
    options,
  );

export type MoveResearchFeedVariables = { feedId: string; folder: string[] | null };

export const useMoveResearchFeedMutation = (
  options?: UseMutationOptions<{ feedId: string }, Error, MoveResearchFeedVariables>,
): UseMutationResult<{ feedId: string }, Error, MoveResearchFeedVariables> =>
  useFeedMutation(
    ResearchMutationKeys.moveResearchFeed,
    ({ feedId, folder }: MoveResearchFeedVariables) =>
      researchService.moveResearchFeed(feedId, { folder }),
    options,
  );

export const useRenameResearchFeedFolderMutation = (
  options?: UseMutationOptions<{ renamed: number }, Error, TResearchFeedFolderRename>,
): UseMutationResult<{ renamed: number }, Error, TResearchFeedFolderRename> =>
  useFeedMutation(
    ResearchMutationKeys.renameResearchFeedFolder,
    (payload: TResearchFeedFolderRename) => researchService.renameResearchFeedFolder(payload),
    options,
  );
