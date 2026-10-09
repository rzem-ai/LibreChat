import { useGetStartupConfig } from '~/data-provider';

/** Falls back to the hardcoded defaults mirrored in `interfaceSchema`'s `.default()`
 *  (packages/data-provider/src/config.ts) so behavior is unchanged for deployments
 *  that don't set `interface.learningCenter` in librechat.yaml. */
const DEFAULT_FAQ_AGENT_NAME = 'MyAssist FAQs';
const DEFAULT_FEEDBACK_URL = 'https://forms.cloud.microsoft/e/E9AyvN4Ayx';

interface LearningCenterConfig {
  faqAgentName: string;
  feedbackUrl: string;
}

/** Deloitte Custom Change: the Learning Center menu bar's FAQ agent and feedback link
 *  are configurable per environment via `librechat.yaml`'s `interface.learningCenter`. */
export default function useLearningCenterConfig(): LearningCenterConfig {
  const { data: startupConfig } = useGetStartupConfig();
  const learningCenter = startupConfig?.interface?.learningCenter;
  return {
    faqAgentName: learningCenter?.faqAgentName ?? DEFAULT_FAQ_AGENT_NAME,
    feedbackUrl: learningCenter?.feedbackUrl ?? DEFAULT_FEEDBACK_URL,
  };
}
