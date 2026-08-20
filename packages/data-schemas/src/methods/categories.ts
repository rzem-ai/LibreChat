import logger from '~/config/winston';

// TODO: existing PromptGroups/Skills that still carry a legacy `category` value (e.g.
// `idea`, `write`, `misc`) will render as uncategorised now that `options` only returns the
// 12 Deloitte categories below — they are not remapped or migrated. File and link a tracking
// issue for a data migration (or a legacy-value alias layer) before this ships broadly.
// TODO: Skills currently have no category taxonomy of their own and fall back to this same
// list — decide how skills should be categorised going forward and link that issue here too.
const options = [
  { label: 'com_ui_strategy_scenarios', value: 'strategy_scenarios' },
  { label: 'com_ui_business_case_roi', value: 'business_case_roi' },
  { label: 'com_ui_proposals_bids', value: 'proposals_bids' },
  { label: 'com_ui_change_operating_model', value: 'change_operating_model' },
  { label: 'com_ui_ba_delivery', value: 'ba_delivery' },
  { label: 'com_ui_compliance_governance', value: 'compliance_governance' },
  { label: 'com_ui_communications_stakeholders', value: 'communications_stakeholders' },
  { label: 'com_ui_research_analytics', value: 'research_analytics' },
  { label: 'com_ui_learning_training', value: 'learning_training' },
  { label: 'com_ui_talent_staffing', value: 'talent_staffing' },
  { label: 'com_ui_operations_technology', value: 'operations_technology' },
  { label: 'com_ui_legal_risk', value: 'legal_risk' },
] as const;

export type CategoryOption = { label: string; value: string };

export function createCategoriesMethods(_mongoose: typeof import('mongoose')): {
  getCategories: () => Promise<CategoryOption[]>;
} {
  /**
   * Retrieves the categories.
   */
  async function getCategories(): Promise<CategoryOption[]> {
    try {
      return [...options];
    } catch (error) {
      logger.error('Error getting categories', error);
      return [];
    }
  }

  return { getCategories };
}

export type CategoriesMethods = ReturnType<typeof createCategoriesMethods>;
