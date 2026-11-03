import { request } from 'librechat-data-provider';
import type * as rs from './types';
import * as endpoints from './endpoints';

export function getResearchStatus(): Promise<rs.TResearchStatus> {
  return request.get(endpoints.researchStatus());
}

export function getResearchJobs(): Promise<rs.TResearchJobsResponse> {
  return request.get(endpoints.researchJobs());
}

export function getResearchJob(id: string): Promise<rs.TResearchJob> {
  return request.get(endpoints.researchJob(id));
}

export function cancelResearchJob(id: string): Promise<rs.TResearchJob> {
  return request.post(endpoints.cancelResearchJob(id), {});
}

export function getResearchSchedules(): Promise<rs.TResearchSchedulesResponse> {
  return request.get(endpoints.researchSchedules());
}

export function updateResearchSchedule(
  scheduleId: string,
  payload: rs.TResearchScheduleUpdate,
): Promise<rs.TResearchSchedule> {
  return request.put(endpoints.researchSchedule(scheduleId), payload);
}

export function getResearchFeeds(): Promise<rs.TResearchFeedsResponse> {
  return request.get(endpoints.researchFeeds());
}

export function getResearchFeedItems(feedId: string): Promise<rs.TResearchFeedItemsResponse> {
  return request.get(endpoints.researchFeedItems(feedId));
}

export function getResearchFeedCatalogue(): Promise<rs.TResearchCatalogueResponse> {
  return request.get(endpoints.researchFeedCatalogue());
}

export function importResearchFeeds(payload: rs.TOpmlImportRequest): Promise<rs.TOpmlImportResult> {
  return request.post(endpoints.researchFeedsOpml(), payload);
}

/** The caller's subscriptions as an OPML document. */
export function exportResearchFeeds(): Promise<string> {
  return request.get(endpoints.researchFeedsOpml(), { responseType: 'text' });
}

export function unsubscribeResearchFeed(feedId: string): Promise<{ feedId: string }> {
  return request.delete(endpoints.researchFeed(feedId));
}

export function moveResearchFeed(
  feedId: string,
  payload: rs.TResearchFeedMove,
): Promise<{ feedId: string; folder?: string[] }> {
  return request.patch(endpoints.researchFeed(feedId), payload);
}

export function renameResearchFeedFolder(
  payload: rs.TResearchFeedFolderRename,
): Promise<{ renamed: number }> {
  return request.post(endpoints.renameResearchFeedFolder(), payload);
}

export function subscribeResearchCatalogueFeed(
  feedId: string,
): Promise<rs.TResearchFeedSubscription> {
  return request.post(endpoints.subscribeResearchCatalogueFeed(feedId), {});
}

export function addResearchCatalogueFeed(
  payload: rs.TCatalogueFeedRequest,
): Promise<rs.TResearchFeed> {
  return request.post(endpoints.researchFeedCatalogue(), payload);
}

export function updateResearchCatalogueFeed(
  feedId: string,
  payload: rs.TCatalogueFeedUpdate,
): Promise<rs.TResearchFeed> {
  return request.patch(endpoints.researchCatalogueFeed(feedId), payload);
}
