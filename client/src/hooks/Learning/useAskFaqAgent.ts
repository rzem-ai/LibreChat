import { Constants, EModelEndpoint } from 'librechat-data-provider';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import useLearningCenterConfig from './useLearningCenterConfig';
import { specDisplayFieldReset } from '~/utils';
import useFaqAgent from './useFaqAgent';
import { useNewConvo } from '~/hooks';

export default function useAskFaqAgent() {
  const { newConversation } = useNewConvo();
  const getDefaultConversation = useDefaultConvo();
  const { faqAgentId } = useLearningCenterConfig();
  const { faqAgent } = useFaqAgent(faqAgentId);

  const askFaqAgent = () => {
    if (!faqAgent) {
      return;
    }
    const template = {
      conversationId: Constants.NEW_CONVO as string,
      endpoint: EModelEndpoint.agents,
      agent_id: faqAgent.id,
      ...specDisplayFieldReset,
    };
    newConversation({
      template: getDefaultConversation({ conversation: template, preset: template }),
      preset: template,
    });
  };

  return { faqAgent, askFaqAgent };
}
