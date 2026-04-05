/**
 * Barrel export for SoW UI primitives.
 *
 * These are thin presentational wrappers consolidating JSX patterns that were
 * previously copy-pasted across the SoW sub-components. Styling is unchanged —
 * every primitive produces the same DOM/CSS output as the original inline code.
 */

export { default as SectionHeader } from './SectionHeader';
export { default as FormCard } from './FormCard';
export { default as TwoColumnGrid } from './TwoColumnGrid';
export { default as RemoveButton } from './RemoveButton';
export { HorizontalCardList, ListCard, AddCardButton } from './HorizontalCardList';
