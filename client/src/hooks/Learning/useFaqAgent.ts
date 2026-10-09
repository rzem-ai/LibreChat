import { PermissionBits } from 'librechat-data-provider';
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents/queries';

/** Generous enough to cover a workspace's agents matching the FAQ search term
 *  in a single page, without pulling the entire marketplace. */
const FAQ_AGENT_SEARCH_LIMIT = 50;

/**
 * Resolves the Learning Center menu bar's FAQ agent by name via the marketplace
 * search API — trusts the backend's search match rather than re-filtering by
 * exact name client-side, so a renamed or re-ordered result still resolves.
 */
export default function useFaqAgent(faqAgentName: string) {
  const { data } = useMarketplaceAgentsInfiniteQuery({
    requiredPermission: PermissionBits.VIEW,
    search: faqAgentName,
    limit: FAQ_AGENT_SEARCH_LIMIT,
  });
  const faqAgent = data?.pages?.flatMap((page) => page?.data ?? [])[0];
  return { faqAgent };
}
