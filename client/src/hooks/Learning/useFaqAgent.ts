import { useGetAgentByIdQuery } from '~/data-provider/Agents/queries';

/**
 * Resolves the Learning Center menu bar's FAQ agent directly by id (configured
 * per environment via `librechat.yaml`'s `interface.learningCenter.faqAgentId`).
 * Returns no agent when unconfigured or unresolvable, so callers can hide the
 * menu item entirely rather than falling back to a search.
 */
export default function useFaqAgent(faqAgentId: string | undefined) {
  const { data: faqAgent } = useGetAgentByIdQuery(faqAgentId);
  return { faqAgent };
}
