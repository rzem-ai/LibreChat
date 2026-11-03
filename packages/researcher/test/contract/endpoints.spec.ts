import { ResearchQueryKeys, ResearchMutationKeys } from '../../src/contract/keys';
import * as endpoints from '../../src/contract/endpoints';

describe('research endpoints', () => {
  it('declares the research routes with encoded ids', () => {
    expect(endpoints.researchJobs()).toBe('/api/research/jobs');
    expect(endpoints.researchJob('a/b')).toBe('/api/research/jobs/a%2Fb');
    expect(endpoints.cancelResearchJob('j1')).toBe('/api/research/jobs/j1/cancel');
    expect(endpoints.researchSchedule('s 1')).toBe('/api/research/schedules/s%201');
    expect(endpoints.researchFeedItems('f/1')).toBe('/api/research/feeds/f%2F1/items');
    expect(endpoints.subscribeResearchCatalogueFeed('c1')).toBe(
      '/api/research/feeds/catalogue/c1/subscribe',
    );
  });
});

describe('research keys', () => {
  it('keeps the query and mutation key values the app cached under', () => {
    expect(ResearchQueryKeys.researchJobs).toBe('researchJobs');
    expect(ResearchQueryKeys.researchJob).toBe('researchJob');
    expect(ResearchMutationKeys).not.toHaveProperty('submitResearchJob');
    expect(ResearchMutationKeys.cancelResearchJob).toBe('cancelResearchJob');
  });
});
