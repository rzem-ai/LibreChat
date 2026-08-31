import mongoose from 'mongoose';
import { createCategoriesMethods } from './categories';

describe('categories methods', () => {
  const { getCategories } = createCategoriesMethods(mongoose);

  it('returns the 12 Deloitte business/consulting categories with matching label and value pairs', async () => {
    const categories = await getCategories();

    expect(categories).toEqual([
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
    ]);
  });

  it('returns a fresh array each call so callers cannot mutate the shared category list', async () => {
    const first = await getCategories();
    first.push({ label: 'com_ui_mutated', value: 'mutated' });

    const second = await getCategories();

    expect(second).toHaveLength(12);
    expect(second.find((category) => category.value === 'mutated')).toBeUndefined();
  });
});
