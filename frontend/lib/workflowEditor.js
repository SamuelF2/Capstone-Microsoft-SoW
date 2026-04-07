/**
 * workflowEditor — helpers for translating between the backend workflow shape
 * ({ stages: [...], transitions: [...] }) and the React Flow graph shape
 * ({ nodes: [...], edges: [...] }).
 *
 * The editor lives on /workflows/[id]/edit and uses React Flow (the `reactflow`
 * package) to render a directed graph. This module is deliberately free of
 * React imports so it can be unit-tested and reused from non-component code.
 *
 * Layout
 * ──────
 * A simple topological left-to-right layout places the draft anchor at the
 * far left, the approved/finalized anchors at the right, rejected below the
 * main chain, and user-defined middle stages in topological layers between
 * draft and approved. Nodes carry `position.x/y` so React Flow can render
 * them without a full layout engine.
 */

import { ANCHOR_KEYS, ANCHOR_STAGES, isAnchorStage } from './workflowStages';

// ── Layout constants ────────────────────────────────────────────────────────

const COL_WIDTH = 240;
const ROW_HEIGHT = 140;
const REJECTED_OFFSET_Y = 200; // rejected sits below the main chain

// ── Key slugification (shared with the old customizer) ─────────────────────

export function slugifyKey(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Anchor injection ────────────────────────────────────────────────────────

/**
 * Ensure every anchor stage (draft/approved/finalized/rejected) exists in the
 * stages list. Used when loading a legacy template that predates one of the
 * anchors so the editor always starts with a complete graph.
 */
export function ensureAnchors(rawStages) {
  const byKey = new Map((rawStages || []).map((s) => [s.stage_key, s]));
  for (const key of ANCHOR_KEYS) {
    if (!byKey.has(key)) {
      byKey.set(key, {
        stage_key: key,
        display_name: ANCHOR_STAGES[key].display_name,
        stage_type: ANCHOR_STAGES[key].stage_type,
        stage_order: 0,
        roles: [],
        config: key === 'rejected' ? { is_failure: true } : {},
      });
    }
  }
  return Array.from(byKey.values());
}

// ── Topological layer assignment ────────────────────────────────────────────

/**
 * Assign each stage to a horizontal layer based on the longest incoming
 * path from `draft`. Stages unreachable from draft fall back to their
 * `stage_order`. This handles linear chains trivially and keeps branches
 * visually aligned in a DAG.
 *
 * Rejected is pinned below the main chain via y-offset, not layer.
 */
function assignLayers(stages, transitions) {
  const byKey = new Map(stages.map((s) => [s.stage_key, s]));
  const layers = new Map();
  layers.set('draft', 0);

  // BFS from draft following forward transitions. Use max-depth so long
  // branches push later stages further right.
  const adjacency = new Map();
  for (const t of transitions) {
    if (!adjacency.has(t.from_stage)) adjacency.set(t.from_stage, []);
    adjacency.get(t.from_stage).push(t.to_stage);
  }

  // Iterate a bounded number of times — enough to propagate depth through
  // any reasonable workflow without needing true topological sort. A real
  // cycle would just stop gaining depth after N iterations.
  const maxIter = stages.length + 2;
  for (let i = 0; i < maxIter; i++) {
    let changed = false;
    for (const [from, tos] of adjacency.entries()) {
      const fromLayer = layers.get(from);
      if (fromLayer == null) continue;
      for (const to of tos) {
        if (to === 'rejected') continue; // rejected is positioned separately
        const next = fromLayer + 1;
        if (layers.get(to) == null || next > layers.get(to)) {
          layers.set(to, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Stages never reached (e.g. orphaned middles): drop them at layer 1.
  for (const s of stages) {
    if (s.stage_key === 'rejected') continue;
    if (!layers.has(s.stage_key)) layers.set(s.stage_key, 1);
  }

  // Ensure approved/finalized sit at the rightmost layers even if there are
  // no edges to them yet.
  const maxMiddleLayer = Math.max(
    0,
    ...stages.filter((s) => !isAnchorStage(s.stage_key)).map((s) => layers.get(s.stage_key) || 1)
  );
  if ((layers.get('approved') || 0) <= maxMiddleLayer) {
    layers.set('approved', maxMiddleLayer + 1);
  }
  if ((layers.get('finalized') || 0) <= (layers.get('approved') || 0)) {
    layers.set('finalized', (layers.get('approved') || 0) + 1);
  }

  return layers;
}

// ── stages/transitions → React Flow nodes/edges ─────────────────────────────

/**
 * Convert the backend workflow shape into React Flow nodes/edges.
 *
 * Returned nodes have type 'stage' so React Flow knows to render the custom
 * StageNode component (registered via nodeTypes on <ReactFlow />). The full
 * stage record rides on node.data.stage so StageNode / StageSettingsPanel
 * can display and edit stage attributes without walking back to the source
 * array.
 */
export function workflowToGraph({ stages, transitions }) {
  const merged = ensureAnchors(stages || []);
  const layers = assignLayers(merged, transitions || []);

  // Group stages by layer so we can stack multiple nodes vertically when a
  // layer contains more than one (e.g. parallel reviews at the same depth).
  const byLayer = new Map();
  for (const s of merged) {
    if (s.stage_key === 'rejected') continue;
    const layer = layers.get(s.stage_key) ?? 1;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(s);
  }

  const nodes = [];
  for (const [layer, items] of byLayer.entries()) {
    items.forEach((stage, idx) => {
      nodes.push({
        id: stage.stage_key,
        type: 'stage',
        position: {
          x: layer * COL_WIDTH,
          y: idx * ROW_HEIGHT - ((items.length - 1) * ROW_HEIGHT) / 2,
        },
        data: { stage },
        // Anchor stages cannot be deleted.
        deletable: !isAnchorStage(stage.stage_key),
      });
    });
  }

  // Position rejected below the middle of the main chain.
  const rejected = merged.find((s) => s.stage_key === 'rejected');
  if (rejected) {
    const maxLayer = Math.max(0, ...[...layers.values()]);
    nodes.push({
      id: 'rejected',
      type: 'stage',
      position: { x: (maxLayer / 2) * COL_WIDTH, y: REJECTED_OFFSET_Y },
      data: { stage: rejected },
      deletable: false,
    });
  }

  const edges = (transitions || []).map((t, i) => {
    const condition = t.condition || 'default';
    const isRejection = t.to_stage === 'rejected' || condition === 'on_reject';
    return {
      id: `e-${t.from_stage}-${t.to_stage}-${i}`,
      source: t.from_stage,
      target: t.to_stage,
      label: condition !== 'default' ? edgeLabel(condition) : undefined,
      type: 'smoothstep',
      animated: condition === 'on_approve',
      data: { condition },
      style: isRejection ? { stroke: 'var(--color-error)', strokeDasharray: '4 4' } : undefined,
      labelStyle: { fontSize: '11px', fill: 'var(--color-text-secondary)' },
      labelBgStyle: { fill: 'var(--color-bg-secondary)' },
    };
  });

  return { nodes, edges };
}

function edgeLabel(condition) {
  switch (condition) {
    case 'on_approve':
      return 'approve';
    case 'on_reject':
      return 'reject';
    case 'on_send_back':
      return 'send back';
    default:
      return '';
  }
}

// ── React Flow nodes/edges → backend payload ───────────────────────────────

/**
 * Convert the current React Flow graph back into a workflow_data payload
 * ready to POST/PUT to /api/workflow/templates. Performs light normalization:
 *
 *  - Anchors are pinned at fixed stage_order slots (draft=1, approved=N+2,
 *    finalized=N+3, rejected=0). Middle stages are re-indexed left-to-right
 *    by their node x position so the backend sees a stable ordering.
 *  - Duplicate stage_keys get numeric suffixes.
 *  - Edges pointing at/from deleted stages are dropped.
 */
export function graphToWorkflow(nodes, edges) {
  // Build stages list, preserving data but re-indexing stage_order.
  const middleNodes = nodes
    .filter((n) => !isAnchorStage(n.id))
    .slice()
    .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

  const seenKeys = new Set(ANCHOR_KEYS);
  const middleStages = middleNodes.map((n, i) => {
    const s = n.data.stage;
    let key = slugifyKey(s.stage_key || s.display_name);
    if (!key) key = `stage_${i + 1}`;
    if (ANCHOR_KEYS.includes(key)) key = `${key}_custom`;
    let suffix = 2;
    const base = key;
    while (seenKeys.has(key)) key = `${base}_${suffix++}`;
    seenKeys.add(key);
    return {
      stage_key: key,
      display_name: s.display_name || key,
      stage_order: i + 2,
      stage_type: s.stage_type || 'review',
      roles: Array.isArray(s.roles) ? s.roles : [],
      config: s.config || {},
    };
  });

  // Remap any edge references from the old middle key to the normalized one.
  const keyRemap = new Map();
  middleNodes.forEach((n, i) => {
    keyRemap.set(n.id, middleStages[i].stage_key);
  });
  for (const k of ANCHOR_KEYS) keyRemap.set(k, k);

  const terminalBase = middleStages.length + 2;
  const stages = [
    {
      stage_key: 'draft',
      display_name: ANCHOR_STAGES.draft.display_name,
      stage_order: 1,
      stage_type: ANCHOR_STAGES.draft.stage_type,
      roles: [],
      config: {},
    },
    ...middleStages,
    {
      stage_key: 'approved',
      display_name: ANCHOR_STAGES.approved.display_name,
      stage_order: terminalBase,
      stage_type: ANCHOR_STAGES.approved.stage_type,
      roles: [],
      config: {},
    },
    {
      stage_key: 'finalized',
      display_name: ANCHOR_STAGES.finalized.display_name,
      stage_order: terminalBase + 1,
      stage_type: ANCHOR_STAGES.finalized.stage_type,
      roles: [],
      config: {},
    },
    {
      stage_key: 'rejected',
      display_name: ANCHOR_STAGES.rejected.display_name,
      stage_order: 0,
      stage_type: ANCHOR_STAGES.rejected.stage_type,
      roles: [],
      config: { is_failure: true },
    },
  ];

  const validKeys = new Set(stages.map((s) => s.stage_key));
  const transitions = edges
    .map((e) => ({
      from_stage: keyRemap.get(e.source) || e.source,
      to_stage: keyRemap.get(e.target) || e.target,
      condition: e.data?.condition || 'default',
    }))
    .filter(
      (t) => validKeys.has(t.from_stage) && validKeys.has(t.to_stage) && t.from_stage !== t.to_stage
    );

  return { stages, transitions };
}

// ── Empty-state template used by /workflows/new ─────────────────────────────

/**
 * Produce a minimal starter workflow: just the four anchors with a single
 * draft→approved→finalized chain and no middle stages. The user then adds
 * their own review/approval stages in the editor.
 */
export function emptyWorkflowData() {
  return {
    stages: [
      {
        stage_key: 'draft',
        display_name: 'Draft',
        stage_order: 1,
        stage_type: 'draft',
        roles: [],
        config: {},
      },
      {
        stage_key: 'approved',
        display_name: 'Approved',
        stage_order: 2,
        stage_type: 'terminal',
        roles: [],
        config: {},
      },
      {
        stage_key: 'finalized',
        display_name: 'Finalized',
        stage_order: 3,
        stage_type: 'terminal',
        roles: [],
        config: {},
      },
      {
        stage_key: 'rejected',
        display_name: 'Rejected',
        stage_order: 0,
        stage_type: 'terminal',
        roles: [],
        config: { is_failure: true },
      },
    ],
    transitions: [
      { from_stage: 'draft', to_stage: 'approved', condition: 'default' },
      { from_stage: 'approved', to_stage: 'finalized', condition: 'default' },
    ],
  };
}

// ── Lightweight graph validation ────────────────────────────────────────────

/**
 * Run a set of cheap sanity checks on a graph and return a list of warning
 * strings. The editor surfaces these in the side panel so authors can spot
 * unreachable nodes or missing exits before saving.
 */
export function validateGraph(nodes, edges) {
  const warnings = [];
  const ids = new Set(nodes.map((n) => n.id));

  // Draft must have at least one outgoing edge.
  const draftOut = edges.filter((e) => e.source === 'draft');
  if (draftOut.length === 0) {
    warnings.push('Draft has no outgoing transitions — the workflow cannot start.');
  }

  // Approved must be reachable from draft (follow forward edges ignoring rejected).
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }
  const reached = new Set(['draft']);
  const queue = ['draft'];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur) || []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  if (!reached.has('approved')) {
    warnings.push('Approved is not reachable from Draft — no path to success exit.');
  }
  if (!reached.has('finalized')) {
    warnings.push('Finalized is not reachable from Draft.');
  }

  // Any middle stage must be reachable from draft.
  for (const n of nodes) {
    if (isAnchorStage(n.id)) continue;
    if (!reached.has(n.id)) {
      warnings.push(`Stage "${n.data.stage.display_name || n.id}" is unreachable from Draft.`);
    }
    // And must have at least one outgoing transition, otherwise it's a dead end.
    if (!(adj.get(n.id) || []).length) {
      warnings.push(`Stage "${n.data.stage.display_name || n.id}" has no outgoing transitions.`);
    }
  }

  // All edges must reference existing nodes (shouldn't happen via the UI, but
  // catches data drift).
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      warnings.push(`Edge ${e.source}→${e.target} references a missing stage.`);
    }
  }

  return warnings;
}
