/**
 * Generate a client-side ID with a caller-provided prefix.
 *
 * Used across SoW sub-components to key dynamic list items (scope lines,
 * deliverables, sprints, phases, team members, etc.). Not cryptographic —
 * just collision-resistant enough for in-memory lists.
 */
export function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}
