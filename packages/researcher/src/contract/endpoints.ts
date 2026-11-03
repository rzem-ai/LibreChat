import { apiBaseUrl } from 'librechat-data-provider';

const id = (value: string): string => encodeURIComponent(value);

export const researchStatus = (): string => `${apiBaseUrl()}/api/research/status`;
export const researchJobs = (): string => `${apiBaseUrl()}/api/research/jobs`;
export const researchJob = (jobId: string): string => `${researchJobs()}/${id(jobId)}`;
export const cancelResearchJob = (jobId: string): string => `${researchJob(jobId)}/cancel`;
export const researchSchedules = (): string => `${apiBaseUrl()}/api/research/schedules`;
export const researchSchedule = (scheduleId: string): string =>
  `${researchSchedules()}/${id(scheduleId)}`;
export const researchFeeds = (): string => `${apiBaseUrl()}/api/research/feeds`;
export const researchFeed = (feedId: string): string => `${researchFeeds()}/${id(feedId)}`;
export const researchFeedItems = (feedId: string): string => `${researchFeed(feedId)}/items`;
export const renameResearchFeedFolder = (): string => `${researchFeeds()}/folders/rename`;
export const researchFeedsOpml = (): string => `${researchFeeds()}/opml`;
export const researchFeedCatalogue = (): string => `${researchFeeds()}/catalogue`;
export const researchCatalogueFeed = (feedId: string): string =>
  `${researchFeedCatalogue()}/${id(feedId)}`;
export const subscribeResearchCatalogueFeed = (feedId: string): string =>
  `${researchCatalogueFeed(feedId)}/subscribe`;
