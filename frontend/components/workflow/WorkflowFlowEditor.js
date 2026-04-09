/**
 * WorkflowFlowEditor — React Flow canvas + side panel for editing a workflow.
 *
 * Pipeline-first model: most transitions are implicit (forward progression,
 * rejection, send-back).  The canvas shows faint ghost lines for implicit
 * transitions and only renders interactive edges for explicit overrides.
 *
 * Props
 * ─────
 * workflow          { name, description, workflow_data: { stages, transitions } }
 * onChange          (next workflow) => void
 * readOnly          boolean — if true, disables all editing
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import ParallelGatewayNode from './ParallelGatewayNode';
import RejectedIndicatorNode from './RejectedIndicatorNode';
import StageSettingsPanel from './StageSettingsPanel';
import {
  workflowToGraph,
  graphToWorkflow,
  validateGraph,
  slugifyKey,
  deriveEdgeStyle,
} from '../../lib/workflowEditor';
import {
  ANCHOR_KEYS,
  isAnchorStage,
  isParallelGateway,
  TRANSITION_CONDITIONS,
} from '../../lib/workflowStages';

const nodeTypes = {
  stage: StageNode,
  parallel_gateway: ParallelGatewayNode,
  rejected_indicator: RejectedIndicatorNode,
};

export default function WorkflowFlowEditor({
  workflow,
  onChange,
  readOnly = false,
  getWorkflowDataRef,
}) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  // Preserved on_condition_met transitions (backend-only, not rendered)
  const preservedTransitionsRef = useRef([]);

  // Initialize from workflow data
  const workflowSignature = `${workflow.id ?? 'new'}:${workflow.loaded_at ?? ''}`;
  useEffect(() => {
    const wd = workflow.workflow_data || { stages: [], transitions: [] };
    const g = workflowToGraph(wd);
    setNodes(g.nodes);
    setEdges(g.edges);
    preservedTransitionsRef.current = g.preservedTransitions || [];
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowSignature]);

  // ── Keep gateway nodes' connectedBranches in sync with edges ──────────────
  useEffect(() => {
    setNodes((ns) => {
      let changed = false;
      const updated = ns.map((n) => {
        if (n.type !== 'parallel_gateway') return n;
        const outgoing = edges.filter((e) => e.source === n.id && !e.data?.isGhost);
        const connected = new Set(outgoing.map((e) => e.sourceHandle));
        const prev = n.data.connectedBranches;
        // Only update if the set actually changed
        if (prev && prev.size === connected.size && [...connected].every((h) => prev.has(h))) {
          return n;
        }
        changed = true;
        return { ...n, data: { ...n.data, connectedBranches: connected } };
      });
      return changed ? updated : ns;
    });
  }, [edges]);

  // ── Node / edge change handlers ───────────────────────────────────────────

  const onNodesChange = useCallback(
    (changes) => {
      if (readOnly) return;
      const safeChanges = changes.filter((c) => {
        if (c.type === 'remove' && isAnchorStage(c.id)) return false;
        if (c.type === 'remove' && c.id === '_rejected_indicator') return false;
        return true;
      });
      setNodes((ns) => applyNodeChanges(safeChanges, ns));
    },
    [readOnly]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      if (readOnly) return;
      // Prevent deletion of ghost edges
      const safeChanges = changes.filter((c) => {
        if (c.type === 'remove') {
          // We need to check if this edge is a ghost — look it up
          return true; // let applyEdgeChanges handle it; ghost edges have deletable=false
        }
        return true;
      });
      setEdges((es) => applyEdgeChanges(safeChanges, es));
    },
    [readOnly]
  );

  // New connection — all edges use the single src-default handle.
  // Non-gateway stages are limited to 1 outgoing edge: drawing a new one
  // replaces the existing outgoing edge from that source.
  const onConnect = useCallback(
    (params) => {
      if (readOnly) return;
      if (params.source === params.target) return;
      if (params.target === '_rejected_indicator') return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const isGateway = sourceNode?.data?.stage?.stage_type === 'parallel_gateway';

      // Prevent multiple gateway branches from connecting to the same target
      if (isGateway) {
        const alreadyConnected = edges.some(
          (e) => e.source === params.source && e.target === params.target && !e.data?.isGhost
        );
        if (alreadyConnected) return;
      }

      // Enforce parallel branch convergence: if this source node is a branch
      // of a gateway, all sibling branches must converge to the same join target.
      if (!isGateway) {
        const parentGateway = edges.find(
          (e) =>
            e.target === params.source &&
            !e.data?.isGhost &&
            nodes.find((n) => n.id === e.source)?.data?.stage?.stage_type === 'parallel_gateway'
        );
        if (parentGateway) {
          // Find all sibling branch targets of this gateway
          const siblingBranches = edges
            .filter((e) => e.source === parentGateway.source && !e.data?.isGhost)
            .map((e) => e.target)
            .filter((t) => t !== params.source);
          // Check where siblings already route
          for (const sib of siblingBranches) {
            const sibOut = edges.find((e) => e.source === sib && !e.data?.isGhost);
            if (sibOut && sibOut.target !== params.target) return; // block
          }
        }
      }

      const condition = _inferCondition(params.source, params.target, nodes);

      // For gateways: use the handle the user dragged from, or assign to
      // the first available branch slot.
      let sourceHandle = params.sourceHandle || 'src-default';
      if (isGateway) {
        sourceHandle = params.sourceHandle || _nextGatewayHandle(params.source, edges);
      }

      const edge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        type: 'smoothstep',
        sourceHandle,
        targetHandle: 'tgt-in',
        data: { condition: isGateway ? 'default' : condition, isGhost: false },
        label: isGateway ? undefined : _edgeLabelShort(condition) || undefined,
        style: isGateway ? { stroke: '#0d9488', strokeWidth: 1.5 } : deriveEdgeStyle(condition),
        animated: !isGateway && condition === 'on_approve',
        labelStyle: { fontSize: '11px', fill: 'var(--color-text-secondary)' },
        labelBgStyle: { fill: 'var(--color-bg-secondary)' },
        markerEnd: { type: MarkerType.ArrowClosed },
      };

      setEdges((es) => {
        // For non-gateway stages: remove the existing outgoing real edge first
        let filtered = es;
        if (!isGateway) {
          filtered = es.filter((e) => e.source !== params.source || e.data?.isGhost);
        }
        return addEdge(edge, filtered);
      });
    },
    [readOnly, nodes]
  );

  const onNodeClick = useCallback((_event, node) => {
    // Don't select the indicator pill
    if (node.id === '_rejected_indicator') return;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback(
    (_event, edge) => {
      if (readOnly) return;
      // Don't select ghost edges
      if (edge.data?.isGhost) return;
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
    },
    [readOnly]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const lastGhostToggleRef = useRef(false);

  // ── Ghost edge + rejected pill visibility (tied to node selection) ────────
  // Ghost lines and the rejected indicator are hidden by default and only
  // appear when the user selects the node they originate from.
  useEffect(() => {
    // Determine if the selected node is a review/approval type
    const selNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
    const selStageType = selNode?.data?.stage?.stage_type;
    const showReject = selStageType === 'review' || selStageType === 'approval';
    const showSendBack =
      selStageType === 'review' || selStageType === 'approval' || selStageType === 'ai_analysis';

    // Toggle ghost edges: show only those originating from the selected node
    lastGhostToggleRef.current = true;
    setEdges((es) =>
      es.map((e) => {
        if (!e.data?.isGhost) return e;
        const isFromSelected = e.source === selectedNodeId;
        if (e.data.implicitType === 'implicit_reject') {
          return { ...e, hidden: !(isFromSelected && showReject) };
        }
        if (e.data.implicitType === 'implicit_sendback') {
          return { ...e, hidden: !(isFromSelected && showSendBack) };
        }
        return e;
      })
    );

    // Toggle rejected indicator pill
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== '_rejected_indicator') return n;
        return { ...n, hidden: !showReject };
      })
    );
  }, [selectedNodeId, nodes.length]); // nodes.length avoids stale closure without deep dep

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

  // ── Add-stage buttons ─────────────────────────────────────────────────────

  const addStage = useCallback(() => {
    if (readOnly) return;
    setNodes((ns) => {
      const existingKeys = new Set(ns.map((n) => n.id));
      let n = ns.filter((x) => !isAnchorStage(x.id) && x.type !== 'rejected_indicator').length + 1;
      let key = `stage_${n}`;
      while (existingKeys.has(key)) {
        n += 1;
        key = `stage_${n}`;
      }
      return [
        ...ns,
        {
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
              config: { send_back_target: 'previous' },
            },
          },
          draggable: true,
          deletable: true,
        },
      ];
    });
  }, [readOnly]);

  const addParallelGateway = useCallback(() => {
    if (readOnly) return;
    setNodes((ns) => {
      const existingKeys = new Set(ns.map((n) => n.id));
      let n = 1;
      let key = `parallel_${n}`;
      while (existingKeys.has(key)) {
        n += 1;
        key = `parallel_${n}`;
      }
      return [
        ...ns,
        {
          id: key,
          type: 'parallel_gateway',
          position: { x: 260, y: 160 },
          data: {
            stage: {
              stage_key: key,
              display_name: `Parallel ${n}`,
              stage_type: 'parallel_gateway',
              stage_order: 0,
              roles: [],
              config: {},
            },
          },
          draggable: true,
          deletable: true,
        },
      ];
    });
  }, [readOnly]);

  // ── Propagate graph changes back to the parent as workflow_data ──────────

  // Compute the workflow payload synchronously so it is always fresh when
  // the parent reads it (e.g. on Save).  useMemo runs during render — before
  // paint — so there is no timing gap where the ref could be stale.
  const latestWorkflowData = useMemo(
    () =>
      graphToWorkflow(nodes, edges, {
        preservedTransitions: preservedTransitionsRef.current,
      }),
    [nodes, edges]
  );

  // Expose a callback for the parent to read the freshest workflow_data
  // synchronously (bypasses the async useEffect propagation).
  if (getWorkflowDataRef) {
    getWorkflowDataRef.current = () => latestWorkflowData;
  }

  // Propagate to the parent via onChange (still async to avoid render-during-
  // render warnings, but the ref above is always up-to-date for Save).
  useEffect(() => {
    const prevStages = JSON.stringify(workflow.workflow_data?.stages || []);
    const prevTransitions = JSON.stringify(workflow.workflow_data?.transitions || []);
    const nextStages = JSON.stringify(latestWorkflowData.stages);
    const nextTransitions = JSON.stringify(latestWorkflowData.transitions);
    if (prevStages === nextStages && prevTransitions === nextTransitions) return;
    onChange({ ...workflow, workflow_data: latestWorkflowData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestWorkflowData]);

  // ── Edge mutations from the side panel ────────────────────────────────────

  const updateSelectedEdge = useCallback(
    (patch) => {
      if (!selectedEdgeId) return;
      setEdges((es) =>
        es.map((e) => {
          if (e.id !== selectedEdgeId) return e;
          const newCondition = patch.condition || e.data?.condition || 'default';
          return {
            ...e,
            data: { ...e.data, condition: newCondition, isGhost: false },
            style: deriveEdgeStyle(newCondition),
            animated: newCondition === 'on_approve',
            label: _edgeLabelShort(newCondition) || undefined,
            labelStyle: { fontSize: '11px', fill: 'var(--color-text-secondary)' },
            labelBgStyle: { fill: 'var(--color-bg-secondary)' },
          };
        })
      );
    },
    [selectedEdgeId]
  );

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((es) => es.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId]);

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  );

  const warnings = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);

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
          onEdgeClick={onEdgeClick}
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
            nodeColor={(n) => {
              if (n.type === 'rejected_indicator') return '#ef4444';
              const st = n.data?.stage?.stage_type;
              if (st === 'approval') return '#7c3aed';
              if (st === 'parallel_gateway') return '#0d9488';
              return '#64748b';
            }}
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          />
        </ReactFlow>

        {/* Floating toolbar */}
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
            <button
              type="button"
              onClick={addParallelGateway}
              title="Add a parallel gateway — forks into multiple concurrent stages"
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: 'var(--color-accent-teal, #0d9488)',
                color: '#fff',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
              }}
            >
              ||| Gateway
            </button>
          </div>
        )}

        {/* Edge legend */}
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
            lineHeight: 1.6,
            pointerEvents: 'none',
          }}
        >
          <div>— transition</div>
          <div style={{ color: 'var(--color-success, #22c55e)' }}>— approve</div>
          <div style={{ color: '#ef4444', opacity: 0.7, marginTop: 4 }}>
            ‒ ‒ reject (select node)
          </div>
          <div style={{ color: '#f59e0b', opacity: 0.7 }}>‒ ‒ send back (select node)</div>
          <div style={{ color: 'var(--color-accent-teal, #0d9488)', marginTop: 4 }}>
            <span style={{ fontWeight: 700 }}>|||</span> parallel gateway
          </div>
        </div>
      </div>

      {/* Side panel */}
      <StageSettingsPanel
        workflow={workflow}
        onWorkflowChange={updateWorkflowMeta}
        selectedNode={selectedNode}
        onStageChange={updateSelectedStage}
        onDeleteStage={deleteSelectedStage}
        selectedEdge={selectedEdge}
        onEdgeChange={updateSelectedEdge}
        onDeleteEdge={deleteSelectedEdge}
        nodes={nodes}
        edges={edges}
        warnings={warnings}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _inferCondition(sourceId, targetId, nodes) {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  const sourceStage = sourceNode?.data?.stage;

  if (sourceStage && ['review', 'approval'].includes(sourceStage.stage_type)) {
    const targetNode = nodes.find((n) => n.id === targetId);
    // Use visual x-position (always current) instead of stage_order which
    // can be stale (e.g. 0 for newly added stages).  This matches
    // graphToWorkflow() which already treats x-position as source of truth.
    const sourceX = sourceNode?.position?.x ?? 0;
    const targetX = targetNode?.position?.x ?? 0;
    if (targetX < sourceX) return 'on_send_back';
    return 'on_approve';
  }

  return 'default';
}

function _edgeLabelShort(condition) {
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

/**
 * Find the next available branch handle for a gateway node.
 * Branches are numbered src-branch-1, src-branch-2, etc.
 */
function _nextGatewayHandle(gatewayId, edges) {
  const used = new Set(
    edges.filter((e) => e.source === gatewayId && !e.data?.isGhost).map((e) => e.sourceHandle)
  );
  let n = 1;
  while (used.has(`src-branch-${n}`)) n++;
  return `src-branch-${n}`;
}
