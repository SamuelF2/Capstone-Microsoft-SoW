/**
 * workflowEditor — helpers for translating between the backend workflow shape
 * ({ stages: [...], transitions: [...] }) and the React Flow graph shape
 * ({ nodes: [...], edges: [...] }).
 *
 * Pipeline-first model
 * ────────────────────
 * The editor treats the workflow as an ordered pipeline.  Some transitions are
 * implicit and managed via stage config rather than visible edges:
 *
 *   Reject:     review/approval stages reject to the 'rejected' anchor.
 *   Send-back:  configured per-stage via config.send_back_target.
 *
 * Forward-progression edges (default / on_approve) are real, interactive,
 * deletable edges.  Each non-gateway stage may have at most ONE outgoing edge
 * to prevent ambiguous routing.
 *
 * The backend data model is unchanged — graphToWorkflow synthesizes the full
 * transitions array (including implicit reject/send-back) on every save.
 */

import {
  ANCHOR_KEYS,
  ANCHOR_STAGES,
  isAnchorStage,
  isHiddenAnchor,
  isParallelGateway,
} from './workflowStages';
import { MarkerType } from 'reactflow';

// ── Layout constants ────────────────────────────────────────────────────────

const COL_WIDTH = 280;
const ROW_HEIGHT = 150;
const REJECTED_OFFSET_Y = 200;

// ── Key slugification ───────────────────────────────────────────────────────

export function slugifyKey(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Anchor injection ────────────────────────────────────────────────────────

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

// ── Ordered stage list (pipeline order) ─────────────────────────────────────

function pipelineOrder(stages) {
  return stages
    .filter((s) => s.stage_key !== 'rejected')
    .slice()
    .sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
}

// ── Transition classification ───────────────────────────────────────────────

/**
 * Classify a stored transition.  Returns one of:
 *   'implicit_reject'   — on_reject → rejected  (ghost edge)
 *   'implicit_sendback' — on_send_back matching stage config (ghost edge)
 *   'hidden'            — on_condition_met or rejected→draft (never rendered)
 *   'explicit'          — everything else (real, interactive edge)
 */
export function classifyTransition(t, stages) {
  const ordered = pipelineOrder(stages);
  const fromIdx = ordered.findIndex((s) => s.stage_key === t.from_stage);
  const fromStage = fromIdx >= 0 ? ordered[fromIdx] : null;

  // on_condition_met — backend-only
  if (t.condition === 'on_condition_met') return 'hidden';

  // rejected → draft (the retry loop) — fully implicit
  if (t.from_stage === 'rejected' && t.to_stage === 'draft' && t.condition === 'default') {
    return 'hidden';
  }

  // Reject → rejected — ghost
  if (t.to_stage === 'rejected' && t.condition === 'on_reject') {
    return 'implicit_reject';
  }

  // Send-back — always implicit (ghost).  Any on_send_back transition is
  // managed via the stage settings panel, not as an interactive edge.
  if (t.condition === 'on_send_back') {
    return 'implicit_sendback';
  }

  // Everything else (including forward transitions) → real interactive edge
  return 'explicit';
}

// ── Send-back target resolution ─────────────────────────────────────────────

function _resolveSendBackTarget(stage, ordered, idx) {
  const sbt = (stage.config || {}).send_back_target;
  if (!sbt || sbt === 'previous') {
    return idx > 0 ? ordered[idx - 1].stage_key : 'draft';
  }
  if (sbt === 'draft') return 'draft';
  return sbt;
}

export function getImplicitSendBackTarget(stage, allStages) {
  const ordered = pipelineOrder(allStages);
  const idx = ordered.findIndex((s) => s.stage_key === stage.stage_key);
  return _resolveSendBackTarget(stage, ordered, idx >= 0 ? idx : 0);
}

// ── Ghost edge styling (reject + send-back only) ───────────────────────────

function ghostEdgeProps(implicitType) {
  const base = {
    type: 'smoothstep',
    selectable: false,
    deletable: false,
    focusable: false,
    interactionWidth: 0,
    hidden: true, // hidden by default, shown when owning node is selected
    data: { isGhost: true },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
  };
  switch (implicitType) {
    case 'implicit_reject':
      return {
        ...base,
        style: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.55 },
        markerEnd: { ...base.markerEnd, color: 'rgba(239,68,68,0.55)' },
      };
    case 'implicit_sendback':
      return {
        ...base,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 3', opacity: 0.55 },
        markerEnd: { ...base.markerEnd, color: 'rgba(245,158,11,0.55)' },
      };
    default:
      return { ...base, style: { opacity: 0 } };
  }
}

// ── Single-row pipeline layout ──────────────────────────────────────────────
// No topological layering — just place stages left-to-right by stage_order.

// ── stages/transitions → React Flow nodes/edges ────────────────────────────

/**
 * Convert the backend workflow shape into React Flow nodes/edges.
 *
 * Forward-progression edges are real interactive edges.
 * Reject and send-back are ghost edges.
 * on_condition_met and rejected→draft are hidden (preserved for round-trip).
 */
export function workflowToGraph({ stages, transitions }) {
  const merged = ensureAnchors(stages || []);
  const allTransitions = transitions || [];

  // ── Layout: stage_order drives left-to-right, gateway branches stack ──
  const ordered = pipelineOrder(merged);
  const nodes = [];

  // Pre-scan transitions to find gateway → branch-target mappings so we
  // can stack branch targets vertically in the same column.
  const gatewayTargetsMap = new Map(); // gateway_key → [target_key, ...]
  const branchTargetSet = new Set();
  for (const t of allTransitions) {
    const fromStage = merged.find((s) => s.stage_key === t.from_stage);
    if (fromStage && isParallelGateway(fromStage.stage_type)) {
      const cls = classifyTransition(t, merged);
      if (cls === 'explicit') {
        if (!gatewayTargetsMap.has(t.from_stage)) gatewayTargetsMap.set(t.from_stage, []);
        gatewayTargetsMap.get(t.from_stage).push(t.to_stage);
        branchTargetSet.add(t.to_stage);
      }
    }
  }

  let col = 0;
  const positioned = new Set();

  for (const stage of ordered) {
    if (positioned.has(stage.stage_key)) continue;

    const nodeType = isParallelGateway(stage.stage_type) ? 'parallel_gateway' : 'stage';

    if (isParallelGateway(stage.stage_type) && gatewayTargetsMap.has(stage.stage_key)) {
      // Place the gateway itself on the main row
      nodes.push({
        id: stage.stage_key,
        type: nodeType,
        position: { x: col * COL_WIDTH, y: 0 },
        data: { stage },
        deletable: !isAnchorStage(stage.stage_key),
      });
      positioned.add(stage.stage_key);
      col++;

      // Stack its branch targets vertically in the next column
      const targets = gatewayTargetsMap.get(stage.stage_key);
      const n = targets.length;
      for (let j = 0; j < n; j++) {
        const targetStage = ordered.find((s) => s.stage_key === targets[j]);
        if (!targetStage || positioned.has(targets[j])) continue;
        const yOffset = (j - (n - 1) / 2) * ROW_HEIGHT;
        const tNodeType = isParallelGateway(targetStage.stage_type) ? 'parallel_gateway' : 'stage';
        nodes.push({
          id: targetStage.stage_key,
          type: tNodeType,
          position: { x: col * COL_WIDTH, y: yOffset },
          data: { stage: targetStage },
          deletable: !isAnchorStage(targetStage.stage_key),
        });
        positioned.add(targets[j]);
      }
      col++;
    } else if (!branchTargetSet.has(stage.stage_key)) {
      // Normal stage on the main row
      nodes.push({
        id: stage.stage_key,
        type: nodeType,
        position: { x: col * COL_WIDTH, y: 0 },
        data: { stage },
        deletable: !isAnchorStage(stage.stage_key),
      });
      positioned.add(stage.stage_key);
      col++;
    }
  }

  // ── Rejected indicator pill (hidden by default, shown on selection) ───
  const midX = ((col - 1) / 2) * COL_WIDTH;
  nodes.push({
    id: '_rejected_indicator',
    type: 'rejected_indicator',
    position: { x: midX, y: REJECTED_OFFSET_Y },
    data: {},
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    hidden: true, // toggled visible when a review/approval node is selected
  });

  // ── Classify transitions & build edges ────────────────────────────────
  const preserved = [];
  const edges = [];

  // Track which branch handle to assign next for each gateway
  const gatewayKeys = new Set(
    merged.filter((s) => isParallelGateway(s.stage_type)).map((s) => s.stage_key)
  );
  const gatewayBranchCounters = new Map();

  for (let i = 0; i < allTransitions.length; i++) {
    const t = allTransitions[i];
    const cls = classifyTransition(t, merged);

    if (cls === 'hidden') {
      if (t.condition === 'on_condition_met') preserved.push(t);
      continue;
    }

    if (cls === 'explicit') {
      // For gateway sources, assign sequential branch handles
      let sourceHandle = 'src-default';
      if (gatewayKeys.has(t.from_stage)) {
        const n = (gatewayBranchCounters.get(t.from_stage) || 0) + 1;
        gatewayBranchCounters.set(t.from_stage, n);
        sourceHandle = `src-branch-${n}`;
      }
      edges.push(_makeExplicitEdge(t, i, sourceHandle));
      continue;
    }

    // Ghost edges — reject and send-back
    const targetId = cls === 'implicit_reject' ? '_rejected_indicator' : t.to_stage;
    const ghost = ghostEdgeProps(cls);
    edges.push({
      id: `ghost-${t.from_stage}-${targetId}-${i}`,
      source: t.from_stage,
      target: targetId,
      sourceHandle: 'src-default',
      targetHandle: 'tgt-in',
      ...ghost,
      data: { ...ghost.data, condition: t.condition, implicitType: cls },
    });
  }

  // ── Synthesize ghost edges for implicit transitions not in stored data ─
  const existingFromCondition = new Set(
    allTransitions.map((t) => `${t.from_stage}:${t.condition}`)
  );

  // Ghost reject edges for review/approval stages
  for (const s of ordered) {
    if (s.stage_type !== 'review' && s.stage_type !== 'approval') continue;
    if (!existingFromCondition.has(`${s.stage_key}:on_reject`)) {
      const ghost = ghostEdgeProps('implicit_reject');
      edges.push({
        id: `ghost-rej-${s.stage_key}`,
        source: s.stage_key,
        target: '_rejected_indicator',
        sourceHandle: 'src-default',
        targetHandle: 'tgt-in',
        ...ghost,
        data: { ...ghost.data, condition: 'on_reject', implicitType: 'implicit_reject' },
      });
    }
  }

  // Ghost send-back edges
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (!['review', 'approval', 'ai_analysis'].includes(s.stage_type)) continue;
    if (!existingFromCondition.has(`${s.stage_key}:on_send_back`)) {
      const target = _resolveSendBackTarget(s, ordered, i);
      if (target) {
        const ghost = ghostEdgeProps('implicit_sendback');
        edges.push({
          id: `ghost-sb-${s.stage_key}-${target}`,
          source: s.stage_key,
          target,
          sourceHandle: 'src-default',
          targetHandle: 'tgt-in',
          ...ghost,
          data: { ...ghost.data, condition: 'on_send_back', implicitType: 'implicit_sendback' },
        });
      }
    }
  }

  // ── Synthesize missing forward edges ────────────────────────────────
  // If a non-terminal stage in the pipeline has no explicit outgoing edge,
  // connect it to the next stage.  This mirrors the ghost-edge synthesis
  // above but for forward progression, ensuring the pipeline is always
  // connected even when stored transitions are incomplete.
  const explicitSources = new Set(edges.filter((e) => !e.data?.isGhost).map((e) => e.source));
  for (let i = 0; i < ordered.length - 1; i++) {
    const stage = ordered[i];
    if (stage.stage_type === 'terminal') continue;
    if (isParallelGateway(stage.stage_type)) continue;
    if (explicitSources.has(stage.stage_key)) continue;

    const next = ordered[i + 1];
    const condition = _forwardCondition(stage);
    edges.push(
      _makeExplicitEdge(
        { from_stage: stage.stage_key, to_stage: next.stage_key, condition },
        edges.length,
        'src-default'
      )
    );
  }

  return { nodes, edges, preservedTransitions: preserved };
}

/**
 * Determine the forward-progression condition for a stage type.
 */
function _forwardCondition(stage) {
  if (stage.stage_type === 'review' || stage.stage_type === 'approval') return 'on_approve';
  return 'default';
}

/**
 * Build a fully-styled interactive edge.
 */
function _makeExplicitEdge(t, idx, sourceHandle = 'src-default') {
  const condition = t.condition || 'default';
  return {
    id: `e-${t.from_stage}-${t.to_stage}-${idx}`,
    source: t.from_stage,
    target: t.to_stage,
    sourceHandle,
    targetHandle: 'tgt-in',
    label: _edgeLabel(condition) || undefined,
    type: 'smoothstep',
    animated: condition === 'on_approve',
    data: { condition, isGhost: false },
    style: deriveEdgeStyle(condition),
    labelStyle: { fontSize: '11px', fill: 'var(--color-text-secondary)' },
    labelBgStyle: { fill: 'var(--color-bg-secondary)' },
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

function _edgeLabel(condition) {
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

export function deriveEdgeStyle(condition) {
  switch (condition) {
    case 'on_reject':
      return { stroke: 'var(--color-error)', strokeDasharray: '4 4' };
    case 'on_approve':
      return { stroke: 'var(--color-success, #22c55e)', strokeWidth: 2 };
    case 'on_send_back':
      return { stroke: 'var(--color-warning)', strokeDasharray: '6 3' };
    default:
      return { stroke: 'var(--color-text-tertiary)', strokeWidth: 1.5 };
  }
}

// ── React Flow nodes/edges → backend payload ────────────────────────────────

/**
 * Convert the current React Flow graph back into a workflow_data payload.
 *
 * Forward-progression edges come directly from the canvas (they are real
 * edges that the user can delete or reroute).  Reject and send-back
 * transitions are synthesized from stage config so the backend always
 * has a complete transitions array.
 */
export function graphToWorkflow(nodes, edges, { preservedTransitions = [] } = {}) {
  // ── Build stages list ─────────────────────────────────────────────────
  const middleNodes = nodes
    .filter((n) => !isAnchorStage(n.id) && n.type !== 'rejected_indicator')
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

  // ── Collect explicit transitions from real edges on the canvas ────────
  const realEdges = edges.filter((e) => !e.data?.isGhost);
  const explicitTransitions = realEdges
    .map((e) => ({
      from_stage: keyRemap.get(e.source) || e.source,
      to_stage: keyRemap.get(e.target) || e.target,
      condition: e.data?.condition || 'default',
    }))
    .filter(
      (t) => validKeys.has(t.from_stage) && validKeys.has(t.to_stage) && t.from_stage !== t.to_stage
    );

  const explicitSet = new Set(explicitTransitions.map((t) => `${t.from_stage}:${t.condition}`));

  // ── Synthesize only reject + send-back (NOT forward) ──────────────────
  const ordered = pipelineOrder(stages);
  const implicitTransitions = [];

  // Reject transitions for review/approval stages
  for (const s of ordered) {
    if (s.stage_type !== 'review' && s.stage_type !== 'approval') continue;
    if (!explicitSet.has(`${s.stage_key}:on_reject`)) {
      implicitTransitions.push({
        from_stage: s.stage_key,
        to_stage: 'rejected',
        condition: 'on_reject',
      });
    }
  }

  // Send-back transitions
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (!['review', 'approval', 'ai_analysis'].includes(s.stage_type)) continue;
    if (explicitSet.has(`${s.stage_key}:on_send_back`)) continue;
    const target = _resolveSendBackTarget(s, ordered, i);
    if (target && validKeys.has(target)) {
      implicitTransitions.push({
        from_stage: s.stage_key,
        to_stage: target,
        condition: 'on_send_back',
      });
    }
  }

  // rejected → draft (always present)
  implicitTransitions.push({
    from_stage: 'rejected',
    to_stage: 'draft',
    condition: 'default',
  });

  const transitions = [
    ...explicitTransitions,
    ...implicitTransitions,
    ...preservedTransitions.filter((t) => validKeys.has(t.from_stage) && validKeys.has(t.to_stage)),
  ];

  return { stages, transitions };
}

// ── Empty-state template ────────────────────────────────────────────────────

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

export function validateGraph(nodes, edges) {
  const warnings = [];
  const ids = new Set(nodes.map((n) => n.id));
  const realNodes = nodes.filter((n) => n.type !== 'rejected_indicator');
  const realEdges = edges.filter((e) => !e.data?.isGhost);

  // Build adjacency from real edges only
  const adj = new Map();
  const addAdj = (from, to) => {
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.get(from).includes(to)) adj.get(from).push(to);
  };

  for (const e of realEdges) {
    addAdj(e.source, e.target);
  }

  // Reachability from draft
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

  for (const n of realNodes) {
    if (isAnchorStage(n.id)) continue;
    if (!reached.has(n.id)) {
      warnings.push(`Stage "${n.data.stage.display_name || n.id}" is unreachable from Draft.`);
    }
  }

  // Missing outgoing edge — stages without a forward connection
  for (const n of realNodes) {
    if (n.id === 'finalized') continue; // terminal, no outgoing needed
    if (n.id === 'rejected') continue;
    const outgoing = realEdges.filter((e) => e.source === n.id);
    if (outgoing.length === 0) {
      const name = n.data?.stage?.display_name || n.id;
      warnings.push(`Stage "${name}" has no outgoing transition — connect it to the next stage.`);
    }
  }

  // Validate send-back targets
  for (const n of realNodes) {
    const stage = n.data?.stage;
    if (!stage || isAnchorStage(n.id)) continue;
    const sbt = (stage.config || {}).send_back_target;
    if (sbt && sbt !== 'previous' && sbt !== 'draft') {
      const exists = realNodes.some((nd) => nd.id === sbt) || sbt === 'draft';
      if (!exists) {
        warnings.push(
          `Stage "${stage.display_name}" has send-back target "${sbt}" which does not exist.`
        );
      }
    }
  }

  // Edge references
  for (const e of realEdges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      warnings.push(`Edge ${e.source}→${e.target} references a missing stage.`);
    }
  }

  // Parallel gateway checks
  const gatewayIds = new Set(
    realNodes.filter((n) => n.data?.stage?.stage_type === 'parallel_gateway').map((n) => n.id)
  );
  for (const gw of realNodes.filter((n) => gatewayIds.has(n.id))) {
    const gwName = gw.data?.stage?.display_name || gw.id;
    const outEdges = realEdges.filter((e) => e.source === gw.id);
    if (outEdges.length < 2) {
      warnings.push(`Parallel gateway "${gwName}" needs at least 2 outgoing transitions.`);
    }
  }

  for (const gw of realNodes.filter((n) => gatewayIds.has(n.id))) {
    const outTargets = realEdges.filter((e) => e.source === gw.id).map((e) => e.target);
    for (const t of outTargets) {
      if (gatewayIds.has(t)) {
        warnings.push(
          `Parallel gateway "${gw.data?.stage?.display_name}" leads to another gateway — nested parallelism is not supported.`
        );
      }
    }
  }

  // Max 1 outgoing edge per non-gateway stage
  for (const n of realNodes) {
    if (gatewayIds.has(n.id)) continue;
    const outEdges = realEdges.filter((e) => e.source === n.id);
    if (outEdges.length > 1) {
      const name = n.data?.stage?.display_name || n.id;
      warnings.push(
        `Stage "${name}" has ${outEdges.length} outgoing transitions — only 1 is allowed. Remove extras to prevent ambiguous routing.`
      );
    }
  }

  // Parallel branch convergence — all branch nodes must route to the same join target
  for (const gw of realNodes.filter((n) => gatewayIds.has(n.id))) {
    const branchTargets = realEdges.filter((e) => e.source === gw.id).map((e) => e.target);
    const joinTargets = new Set();
    const branchesWithoutJoin = [];
    for (const bt of branchTargets) {
      const outEdge = realEdges.find((e) => e.source === bt);
      if (outEdge) {
        joinTargets.add(outEdge.target);
      } else {
        branchesWithoutJoin.push(bt);
      }
    }
    if (joinTargets.size > 1) {
      const gwName = gw.data?.stage?.display_name || gw.id;
      const targetNames = [...joinTargets].map((t) => {
        const nd = realNodes.find((n) => n.id === t);
        return nd?.data?.stage?.display_name || t;
      });
      warnings.push(
        `Parallel gateway "${gwName}" branches must all converge to the same stage, but they target: ${targetNames.join(', ')}.`
      );
    }
  }

  // Multi-predecessor join mode check
  for (const n of realNodes) {
    if (isAnchorStage(n.id) || gatewayIds.has(n.id)) continue;
    const inEdges = realEdges.filter((e) => e.target === n.id);
    const sourcesSet = new Set(inEdges.map((e) => e.source));
    if (sourcesSet.size >= 2) {
      const joinMode = n.data?.stage?.config?.join_mode;
      if (!joinMode || joinMode === 'default') {
        warnings.push(
          `Stage "${n.data?.stage?.display_name || n.id}" has ${sourcesSet.size} predecessors but no join mode configured.`
        );
      }
    }
  }

  return warnings;
}
