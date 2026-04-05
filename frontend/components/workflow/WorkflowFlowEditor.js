/**
 * WorkflowFlowEditor — React Flow canvas + side panel for editing a workflow.
 *
 * The editor is a controlled component: it takes a workflow (name, description,
 * workflow_data) from the parent and reports changes through `onChange`. The
 * parent owns persistence — this component just renders and mutates.
 *
 * Layout
 * ──────
 *   ┌──────────────────────────┬──────────────┐
 *   │                          │              │
 *   │      React Flow canvas   │   Settings   │
 *   │                          │    panel     │
 *   │                          │              │
 *   └──────────────────────────┴──────────────┘
 *
 * The canvas holds draggable stage nodes connected by edges with transition
 * conditions. The panel shows workflow-level settings when nothing is selected
 * and stage-level settings when a node is selected.
 *
 * Props
 * ─────
 * workflow          { name, description, workflow_data: { stages, transitions } }
 * onChange          (next workflow) => void
 * readOnly          boolean — if true, disables all editing (used for "view only" mode)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import StageNode from './StageNode';
import StageSettingsPanel from './StageSettingsPanel';
import {
  workflowToGraph,
  graphToWorkflow,
  validateGraph,
  slugifyKey,
} from '../../lib/workflowEditor';
import { ANCHOR_KEYS, isAnchorStage, TRANSITION_CONDITIONS } from '../../lib/workflowStages';

// Register custom node types. Defined outside the component so the reference
// is stable across re-renders — React Flow warns if nodeTypes changes on every
// render.
const nodeTypes = { stage: StageNode };

export default function WorkflowFlowEditor({ workflow, onChange, readOnly = false }) {
  // React Flow is most idiomatic when its nodes/edges live in local state and
  // we sync to the parent through onChange. We initialize from the incoming
  // workflow_data on mount and whenever the workflow ID effectively changes.
  const [nodes, setNodes] = useState(() => {
    const g = workflowToGraph(workflow.workflow_data || { stages: [], transitions: [] });
    return g.nodes;
  });
  const [edges, setEdges] = useState(() => {
    const g = workflowToGraph(workflow.workflow_data || { stages: [], transitions: [] });
    return g.edges;
  });
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // When the parent swaps in an entirely different workflow (e.g. loading a
  // different template), reset the graph state. We key on id+name so normal
  // typing inside this component doesn't reset the canvas.
  const workflowSignature = `${workflow.id ?? 'new'}:${workflow.loaded_at ?? ''}`;
  useEffect(() => {
    const g = workflowToGraph(workflow.workflow_data || { stages: [], transitions: [] });
    setNodes(g.nodes);
    setEdges(g.edges);
    setSelectedNodeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowSignature]);

  // ── Node / edge change handlers ───────────────────────────────────────────

  const onNodesChange = useCallback(
    (changes) => {
      if (readOnly) return;
      // Filter out removals of anchor nodes — React Flow will try to delete
      // them if the user hits backspace while an anchor is selected, but
      // anchors are not deletable in our model.
      const safeChanges = changes.filter((c) => {
        if (c.type === 'remove' && isAnchorStage(c.id)) return false;
        return true;
      });
      setNodes((ns) => applyNodeChanges(safeChanges, ns));
    },
    [readOnly]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      if (readOnly) return;
      setEdges((es) => applyEdgeChanges(changes, es));
    },
    [readOnly]
  );

  // New connection drawn by the user. Give it a unique id and default to the
  // 'default' condition; the user can change the condition from the edge
  // context menu (not yet implemented) or by deleting and re-creating.
  const onConnect = useCallback(
    (params) => {
      if (readOnly) return;
      if (params.source === params.target) return; // no self-loops
      const edge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        type: 'smoothstep',
        data: { condition: params.target === 'rejected' ? 'on_reject' : 'default' },
        style:
          params.target === 'rejected'
            ? { stroke: 'var(--color-error)', strokeDasharray: '4 4' }
            : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      setEdges((es) => addEdge(edge, es));
    },
    [readOnly]
  );

  // Clicking a node selects it and surfaces its settings in the side panel.
  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Clicking empty canvas deselects so the panel flips back to workflow-level
  // settings.
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  // ── Stage mutations from the side panel ──────────────────────────────────

  const updateSelectedStage = useCallback(
    (nextStage) => {
      if (!selectedNodeId) return;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, stage: nextStage } } : n
        )
      );
    },
    [selectedNodeId]
  );

  const deleteSelectedStage = useCallback(() => {
    if (!selectedNodeId || isAnchorStage(selectedNodeId)) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  // ── Workflow-level mutations ──────────────────────────────────────────────

  const updateWorkflowMeta = useCallback(
    (patch) => {
      onChange({ ...workflow, ...patch });
    },
    [workflow, onChange]
  );

  // ── Add-stage button (floating, top-left of canvas) ──────────────────────

  const addStage = useCallback(() => {
    if (readOnly) return;
    setNodes((ns) => {
      const existingKeys = new Set(ns.map((n) => n.id));
      let n = ns.filter((x) => !isAnchorStage(x.id)).length + 1;
      let key = `stage_${n}`;
      while (existingKeys.has(key)) {
        n += 1;
        key = `stage_${n}`;
      }
      const newNode = {
        id: key,
        type: 'stage',
        position: { x: 260, y: 60 },
        data: {
          stage: {
            stage_key: key,
            display_name: `Stage ${n}`,
            stage_type: 'review',
            stage_order: 0,
            roles: [],
            config: {},
          },
        },
        draggable: true,
        deletable: true,
      };
      return [...ns, newNode];
    });
  }, [readOnly]);

  // ── Propagate graph changes back to the parent as workflow_data ──────────

  useEffect(() => {
    const next = graphToWorkflow(nodes, edges);
    // Only propagate if the shape actually changed — avoid a render loop when
    // the parent passes back the same workflow object.
    const prevStages = JSON.stringify(workflow.workflow_data?.stages || []);
    const prevTransitions = JSON.stringify(workflow.workflow_data?.transitions || []);
    const nextStages = JSON.stringify(next.stages);
    const nextTransitions = JSON.stringify(next.transitions);
    if (prevStages === nextStages && prevTransitions === nextTransitions) return;
    onChange({ ...workflow, workflow_data: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const warnings = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);

  // ── Edge context menu — change condition or delete ────────────────────────
  // We wire this through the panel below the canvas rather than a floating
  // menu so it works without extra React Flow plugins.

  const selectedEdgeId = null; // future: click-to-select edge

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="var(--color-border-subtle)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.data?.stage?.stage_type === 'approval' ? '#7c3aed' : '#64748b')}
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          />
        </ReactFlow>

        {/* Floating toolbar — add stage. Positioned over the canvas in the
            top-left so it's always available without needing a context menu. */}
        {!readOnly && (
          <div
            style={{
              position: 'absolute',
              top: 'var(--spacing-sm)',
              left: 'var(--spacing-sm)',
              display: 'flex',
              gap: 'var(--spacing-xs)',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              onClick={addStage}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: 'var(--color-accent-purple, #7c3aed)',
                color: '#fff',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              }}
            >
              + Stage
            </button>
          </div>
        )}

        {/* Edge conditions legend — helps users understand why some edges are
            dashed red (rejection branches) or animated (approve). */}
        <div
          style={{
            position: 'absolute',
            bottom: 'var(--spacing-sm)',
            left: 'var(--spacing-sm)',
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.4,
            pointerEvents: 'none',
          }}
        >
          <div>— default transition</div>
          <div style={{ color: 'var(--color-error)' }}>‒‒ rejection branch</div>
        </div>
      </div>

      {/* Side panel */}
      <StageSettingsPanel
        workflow={workflow}
        onWorkflowChange={updateWorkflowMeta}
        selectedNode={selectedNode}
        onStageChange={updateSelectedStage}
        onDeleteStage={deleteSelectedStage}
        warnings={warnings}
      />
    </div>
  );
}
