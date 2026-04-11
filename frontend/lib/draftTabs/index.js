/**
 * draftTabs/index — registry mapping a methodology name to its tab config.
 *
 * Each entry is an array of `{ label, key, render(data, update) }` objects
 * the draft page renders into editor tabs. New methodologies can be added
 * by dropping a sibling module and registering it here.
 */

import AGILE_TABS from './agile';
import SURE_STEP_TABS from './sureStep';
import WATERFALL_TABS from './waterfall';
import CLOUD_ADOPTION_TABS from './cloudAdoption';

const TAB_CONFIGS_BY_METHODOLOGY = {
  'Agile Sprint Delivery': AGILE_TABS,
  'Sure Step 365': SURE_STEP_TABS,
  Waterfall: WATERFALL_TABS,
  'Cloud Adoption': CLOUD_ADOPTION_TABS,
};

export function getTabConfig(methodology) {
  return TAB_CONFIGS_BY_METHODOLOGY[methodology] || [];
}
