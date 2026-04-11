/**
 * components/ai-review — barrel module bundling the recommendation card
 * sub-components used by /pages/ai-review.js. Importing from this index keeps
 * the page header tidy and makes the section list discoverable in one place.
 */

export { default as ViolationsSection } from './ViolationsSection';
export { default as RisksSection } from './RisksSection';
export { default as ApprovalSection } from './ApprovalSection';
export { default as ChecklistSection } from './ChecklistSection';
export { default as SuggestionsSection } from './SuggestionsSection';
export { default as SectionAnalysisSection } from './SectionAnalysisSection';
export { default as SimilarSowsSection } from './SimilarSowsSection';
export { SeverityBadge } from './RecommendationStyles';
