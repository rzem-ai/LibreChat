import type { TResearchFeedSubscription } from '../../../contract/types';

/** Shown and typed as "AI / Agents"; a slash without spaces stays inside a name. */
const SEPARATOR = ' / ';

export function formatFolder(path: string[]): string {
  return path.join(SEPARATOR);
}

/** Parses typed folder text; null when it names no folder (unfiled). */
export function parseFolder(text: string): string[] | null {
  const path = text
    .split(/\s+\/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return path.length ? path : null;
}

export type FeedFolderGroup = {
  /** Null for unfiled feeds. */
  path: string[] | null;
  key: string;
  subscriptions: TResearchFeedSubscription[];
};

/** Groups subscriptions by exact folder path, sorted by name, with unfiled feeds last. */
export function groupByFolder(subscriptions: TResearchFeedSubscription[]): FeedFolderGroup[] {
  const groups = new Map<string, FeedFolderGroup>();
  for (const subscription of subscriptions) {
    const path = subscription.folder?.length ? subscription.folder : null;
    const key = path ? JSON.stringify(path) : '';
    const group = groups.get(key) ?? { path, key, subscriptions: [] };
    group.subscriptions.push(subscription);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.path || !b.path) {
      return a.path ? -1 : 1;
    }
    return formatFolder(a.path).localeCompare(formatFolder(b.path));
  });
}
