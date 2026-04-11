/**
 * Centralized color and style constants for the workflow editor canvas.
 *
 * Previously these palettes were duplicated across StageNode.js,
 * ParallelGatewayNode.js, RejectedIndicatorNode.js, and WorkflowFlowEditor.js
 * — and the values had drifted (different teal shades for the gateway, etc).
 * Importing from this module guarantees a single source of truth.
 *
 * Note: these are raw hex values rather than CSS variables because react-flow
 * draws SVG strokes which don't pick up CSS variables in all browsers.
 */

/** Header background per stage_type. */
export const STAGE_TYPE_COLORS = Object.freeze({
  draft: '#475569',
  ai_analysis: '#2563eb',
  review: '#d97706',
  approval: '#7c3aed',
  terminal: '#059669',
  parallel_gateway: '#0d9488',
});

/** Background color for runtime stage status indicators. */
export const STAGE_STATUS_BG = Object.freeze({
  pending: 'rgba(148,163,184,0.15)',
  in_progress: 'rgba(59,130,246,0.15)',
  completed: 'rgba(34,197,94,0.15)',
  rejected: 'rgba(239,68,68,0.15)',
  canceled: 'rgba(148,163,184,0.10)',
});

/** Port (Handle) colors used by node renderers. */
export const PORT_COLORS = Object.freeze({
  in: '#3b82f6',
  out: '#94a3b8',
  connected: '#0d9488',
  available: '#475569',
});

/** Teal accent for the parallel gateway brand and edges. */
export const GATEWAY_ACCENT = '#0d9488';

/**
 * React-flow edge style by transition condition.  ``deriveEdgeStyle`` in
 * ``workflowEditor.js`` defers to this map so the canvas, the live progress
 * widget, and any future visualization stay visually consistent.
 */
export const EDGE_STYLES = Object.freeze({
  on_reject: { stroke: 'var(--color-error)', strokeDasharray: '4 4' },
  on_approve: { stroke: 'var(--color-success, #22c55e)', strokeWidth: 2 },
  on_send_back: { stroke: 'var(--color-warning)', strokeDasharray: '6 3' },
  default: { stroke: 'var(--color-text-tertiary)', strokeWidth: 1.5 },
  gateway: { stroke: GATEWAY_ACCENT, strokeWidth: 1.5 },
});

/** Style for "ghost" implicit edges shown when no explicit edge exists. */
export const GHOST_EDGE_STYLES = Object.freeze({
  implicit_reject: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: '4 3' },
  implicit_sendback: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 3' },
});
