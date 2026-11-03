/** React Query keys for research reads. Values match the keys the app used before the move. */
export enum ResearchQueryKeys {
  researchStatus = 'researchStatus',
  researchJobs = 'researchJobs',
  researchJob = 'researchJob',
  researchFeeds = 'researchFeeds',
  researchSchedules = 'researchSchedules',
  researchFeedItems = 'researchFeedItems',
  researchFeedCatalogue = 'researchFeedCatalogue',
}

/** React Query keys for research writes. */
export enum ResearchMutationKeys {
  cancelResearchJob = 'cancelResearchJob',
  importResearchFeeds = 'importResearchFeeds',
  updateResearchSchedule = 'updateResearchSchedule',
  unsubscribeResearchFeed = 'unsubscribeResearchFeed',
  moveResearchFeed = 'moveResearchFeed',
  renameResearchFeedFolder = 'renameResearchFeedFolder',
  subscribeResearchCatalogueFeed = 'subscribeResearchCatalogueFeed',
}
