import { useGetStartupConfig } from '~/data-provider';

interface LearningCenterConfig {
  faqAgentId: string | undefined;
  feedbackUrl: string | undefined;
}

/** Deloitte Custom Change: the Learning Center menu bar's FAQ agent and feedback link
 *  are sourced entirely from `librechat.yaml`'s `interface.learningCenter` — both
 *  differ per environment, so there is no hardcoded fallback here; callers hide
 *  the corresponding menu item when a value is unset. */
export default function useLearningCenterConfig(): LearningCenterConfig {
  const { data: startupConfig } = useGetStartupConfig();
  const learningCenter = startupConfig?.interface?.learningCenter;
  return {
    faqAgentId: learningCenter?.faqAgentId,
    feedbackUrl: learningCenter?.feedbackUrl,
  };
}
