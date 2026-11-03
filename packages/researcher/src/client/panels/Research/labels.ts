import type { TranslationKeys } from '@librechat/client';
import type { ResearchJobStatus, ResearchDeliveryChannel } from '../../../contract/types';
import { ResearchJobType } from '../../../contract/types';

/** Literal keys, so each one is visible to the unused-translation check. */
export const JOB_TYPE_KEYS: Record<ResearchJobType, TranslationKeys> = {
  [ResearchJobType.REQUIREMENTS]: 'com_ui_research_type_requirements',
  [ResearchJobType.CURRENT_EVENTS]: 'com_ui_research_type_currentEvents',
  [ResearchJobType.TRENDS]: 'com_ui_research_type_trends',
  [ResearchJobType.DIGEST]: 'com_ui_research_type_digest',
  [ResearchJobType.SOLUTION]: 'com_ui_research_type_solution',
};

export const STATUS_KEYS: Record<ResearchJobStatus, TranslationKeys> = {
  submitted: 'com_ui_research_status_submitted',
  briefing: 'com_ui_research_status_briefing',
  researching: 'com_ui_research_status_researching',
  drafting: 'com_ui_research_status_drafting',
  verifying: 'com_ui_research_status_verifying',
  delivered: 'com_ui_research_status_delivered',
  failed: 'com_ui_research_status_failed',
  cancelled: 'com_ui_research_status_cancelled',
};

export const CHANNEL_KEYS: Record<ResearchDeliveryChannel, TranslationKeys> = {
  conversation: 'com_ui_research_channel_conversation',
  email: 'com_ui_research_channel_email',
  teams: 'com_ui_research_channel_teams',
};
