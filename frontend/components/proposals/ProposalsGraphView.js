/**
 * ProposalsGraphView — Neo4j-style force-directed canvas for schema proposals.
 *
 * Replaces the previous static-grid view. The visualization is built to
 * mimic the Neo4j Browser experience inside ReactFlow:
 *
 *   • Each `source` document becomes a small hub node; every proposal is
 *     drawn as a circle connected to its source hub with a thin
 *     "scaffolding" edge. This gives the canvas a graph shape that the
 *     SchemaProposal model — which has no explicit relationships — does
 *     not provide on its own.
 *
 *   • Edge-kind proposals are rendered as actual labeled arrows between
 *     the two highest-confidence node-kind proposals in the same
 *     source_section (a best-effort heuristic, indicated by a dashed
 *     stroke and tooltip). When no candidate endpoints exist, the edge
 *     proposal falls back to a diamond node near its source hub so it
 *     still appears in the UI.
 *
 *   • Positions are computed by a custom force simulation (charge
 *     repulsion + link springs + center gravity). The simulation only
 *     re-runs when the set of proposal IDs changes — status flips
 *     (approve / reject) do not reshuffle the canvas.
 *
 *   • Hovering a node highlights it and its direct neighbors and dims
 *     the rest. Dragging pins a node in place; double-click un-pins it.
 *     The legend panel exposes a "Reset layout" button to un-pin all
 *     nodes and re-run the simulation.
 *
 *   • Color encodes `kind` (Neo4j-style label coloring). Stroke encodes
 *     status: solid green = accepted, solid blue = pending, dashed red
 *     = rejected.
 *
 * Click a proposal node → invokes `onSelectProposal(id)`; the page opens
 * the same `ProposalDetailDrawer` used by the queue. Hub nodes are inert.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType } from 'reactflow';
import { HUB_PREFIX } from './graph/buildGraphData';
import 'reactflow/dist/style.css';

import { STATUS_STYLES, proposalStatus } from './proposalUtils';
import { buildGraphData } from './graph/buildGraphData';
import { useForceLayout } from './graph/useForceLayout';
import CircleNode, { circleNodeHitSize } from './graph/CircleNode';
import SourceHubNode from './graph/SourceHubNode';
import LabeledCurvedEdge from './graph/LabeledCurvedEdge';
import GraphLegend from './graph/GraphLegend';

const SIM_WIDTH = 1600;
const SIM_HEIGHT = 1000;

const FIT_VIEW_OPTIONS = { padding: 0.18, includeHiddenNodes: false };
const PRO_OPTIONS = { hideAttribution: true };
const MINIMAP_STYLE = { backgroundColor: 'var(--color-bg-secondary)' };
const DEFAULT_EDGE_OPTIONS = { focusable: false };

const NODE_TYPES = { proposal: CircleNode, hub: SourceHubNode };
const EDGE_TYPES = { labeled: LabeledCurvedEdge };

function miniMapNodeColor(n) {
  if (n.type === 'hub') return '#6b7280';
  const status = n.data?.status;
  if (status === 'rejected') return 'var(--color-error)';
  if (status === 'accepted') return 'var(--color-success)';
  return 'var(--color-info)';
}

export default function ProposalsGraphView({ proposals, onSelectProposal }) {
  const graphData = useMemo(() => buildGraphData(proposals), [proposals]);

  const { positions, pinNode, releaseNode, setDragging, isDragging } = useForceLayout(graphData, {
    width: SIM_WIDTH,
    height: SIM_HEIGHT,
  });

  const [hoveredId, setHoveredId] = useState(null);
  // Debounce hover-clear so the dim/highlight state doesn't flash to
  // baseline-then-back when the cursor crosses from one node to another.
  const hoverClearTimer = useRef(null);
  useEffect(() => {
    return () => {
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current);
        hoverClearTimer.current = null;
      }
    };
  }, []);

  const neighborSet = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set([hoveredId]);
    for (const e of graphData.edges) {
      if (e.source === hoveredId) set.add(e.target);
      if (e.target === hoveredId) set.add(e.source);
    }
    return set;
  }, [hoveredId, graphData.edges]);

  const { kindCounts, statusCounts, sourceCount, inferredEdgeCount } = useMemo(() => {
    const kc = { node: 0, edge: 0, section_type: 0 };
    const sc = { pending: 0, accepted: 0, rejected: 0 };
    for (const p of proposals) {
      if (kc[p.kind] != null) kc[p.kind] += 1;
      sc[proposalStatus(p)] += 1;
    }
    const sources = new Set(proposals.map((p) => p.source || 'Unknown source'));
    const inferredEdges = graphData.edges.filter((e) => e.type === 'labeled').length;
    return {
      kindCounts: kc,
      statusCounts: sc,
      sourceCount: sources.size,
      inferredEdgeCount: inferredEdges,
    };
  }, [proposals, graphData.edges]);

  // Per-node data ref cache so unchanged nodes reuse the same `data`
  // object across re-renders. Combined with CircleNode's memo comparator
  // (which compares by data identity), this means a drag tick only
  // repaints the dragged node, not all of its neighbors.
  const dataCacheRef = useRef(new Map());

  const flowNodes = useMemo(() => {
    const cache = dataCacheRef.current;
    const fresh = new Map();
    const nodes = graphData.nodes
      .map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const box = node.type === 'hub' ? SourceHubNode.BOX : circleNodeHitSize(node.data);
        const isFocused = neighborSet ? neighborSet.has(node.id) : false;
        const dimmed = neighborSet ? !isFocused : false;
        // Only the hovered node itself gets the scale + drop-shadow
        // treatment. Neighbors stay focused (un-dimmed) but don't pulse;
        // that prevents the cascade of transform transitions on every
        // hover and keeps drag visuals quiet.
        const highlighted = node.id === hoveredId;

        const cached = cache.get(node.id);
        let data;
        if (
          cached &&
          cached.base === node.data &&
          cached.dimmed === dimmed &&
          cached.highlighted === highlighted
        ) {
          data = cached.merged;
        } else {
          data = { ...node.data, dimmed, highlighted };
        }
        fresh.set(node.id, {
          base: node.data,
          dimmed,
          highlighted,
          merged: data,
        });

        // Stamp width/height explicitly. ReactFlow's createNodeInternals
        // spreads the prop node into a fresh internals object on every
        // `setNodes` call (which fires every drag tick because we hand it
        // a new array each render), and without these the cached measured
        // size is lost — `initialized` flips to false and NodeWrapper
        // applies `visibility: hidden` until the ResizeObserver catches
        // up a frame later. That hide-show cycle, at ~60 Hz across the
        // whole node set, is what produced the drag flicker.
        return {
          ...node,
          position: { x: pos.x - box / 2, y: pos.y - box / 2 },
          width: box,
          height: box,
          draggable: node.type === 'proposal',
          selectable: node.type === 'proposal',
          data,
        };
      })
      .filter(Boolean);
    dataCacheRef.current = fresh;
    return nodes;
  }, [graphData.nodes, positions, neighborSet, hoveredId]);

  const flowEdges = useMemo(() => {
    return graphData.edges.map((edge) => {
      const involvesHover = neighborSet
        ? neighborSet.has(edge.source) && neighborSet.has(edge.target)
        : false;
      const dimmed = neighborSet ? !involvesHover : false;
      const highlighted = neighborSet ? involvesHover : false;

      if (edge.data?.scaffold) {
        return {
          ...edge,
          style: {
            stroke: 'rgba(160,160,160,0.18)',
            strokeWidth: 1,
            opacity: dimmed ? 0.05 : highlighted ? 0.7 : 0.5,
            transition: 'opacity 120ms ease-out',
          },
        };
      }
      // Labeled inferred edge
      const status = edge.data?.status || 'pending';
      const stroke = STATUS_STYLES[status]?.dot || 'var(--color-info)';
      return {
        ...edge,
        data: { ...edge.data, dimmed, highlighted },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: stroke,
        },
      };
    });
  }, [graphData.edges, neighborSet]);

  const onNodeClick = useCallback(
    (_e, node) => {
      if (node.type === 'proposal' && node.data?.proposalId) {
        onSelectProposal?.(node.data.proposalId);
      }
    },
    [onSelectProposal]
  );

  // Suppress hover state changes while a drag is in progress. On a fast
  // drag the cursor briefly leaves and re-enters the node's hit box,
  // which would otherwise thrash hoveredId → neighborSet → flowNodes and
  // make the canvas pulse. Drag end naturally restores hover updates.
  const onNodeMouseEnter = useCallback(
    (_e, node) => {
      if (isDragging()) return;
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current);
        hoverClearTimer.current = null;
      }
      setHoveredId((prev) => (prev === node.id ? prev : node.id));
    },
    [isDragging]
  );

  const onNodeMouseLeave = useCallback(() => {
    if (isDragging()) return;
    if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    hoverClearTimer.current = setTimeout(() => {
      setHoveredId(null);
      hoverClearTimer.current = null;
    }, 80);
  }, [isDragging]);

  // ReactFlow 11 controlled mode requires onNodesChange for drag to work.
  // During an active drag we pin the node to the cursor (sets fx/fy on
  // the sim node so the force loop can't fight the mouse), and we
  // suspend the force loop entirely so ~60 ticks per second don't race
  // the cursor. On release we clear fx/fy via releaseNode and resume
  // the simulation with an alpha kick — the node travels back to its
  // natural equilibrium and neighbors ripple to accommodate.
  const onNodesChange = useCallback(
    (changes) => {
      for (const c of changes) {
        // Only handle position-typed changes that carry an explicit
        // dragging flag — programmatic moves (where `dragging` is
        // null/undefined) are not ours to react to, and `dimensions`/
        // `select`/etc. changes don't belong on this code path.
        // IMPORTANT: do NOT also gate on `c.position` here. ReactFlow
        // fires the drag-end change as
        //   { type: 'position', id, dragging: false }
        // with no `position` field (it calls
        //   updateNodePositions(items, positionChanged=false, dragging=false)
        // on `end`), so a top-level `!c.position` guard silently drops
        // every release — which is what froze draggingRef on `true`
        // and pinned the physics loop indefinitely after the first
        // drag. The position guard now lives inside the
        // dragging === true branch where it actually applies.
        if (c.type !== 'position') continue;
        if (c.dragging == null) continue;
        if (c.id.startsWith(HUB_PREFIX)) continue;
        if (c.dragging === true) {
          if (!c.position) continue;
          const data = graphData.nodes.find((n) => n.id === c.id)?.data;
          const box = circleNodeHitSize(data);
          setDragging(true);
          pinNode(c.id, c.position.x + box / 2, c.position.y + box / 2);
        } else if (c.dragging === false) {
          setDragging(false);
          releaseNode(c.id);
          // Clear hover state on release. Hover events were suppressed
          // for the duration of the drag, so hoveredId is whatever the
          // cursor was over when the drag began — without this, the
          // dragged node stays highlighted and the rest of the graph
          // stays dimmed until the cursor moves off and back onto a
          // node. Also cancel any in-flight leave-debounce timer that
          // was set before the drag started, so it can't fire late and
          // re-clear the hover state on top of normal mouseEnter.
          if (hoverClearTimer.current) {
            clearTimeout(hoverClearTimer.current);
            hoverClearTimer.current = null;
          }
          setHoveredId(null);
        }
      }
    },
    [pinNode, releaseNode, setDragging, graphData.nodes]
  );

  if (proposals.length === 0) {
    return (
      <div
        className="card text-center"
        style={{
          padding: 'var(--spacing-3xl)',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🕸️</div>
        <h3 className="text-xl font-semibold mb-sm">Nothing to graph</h3>
        <p className="text-secondary">
          The graph view clusters proposals by source document and infers relationships from shared
          source sections. Adjust filters or ingest more documents to populate it.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        height: 'calc(100vh - 360px)',
        minHeight: 480,
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        // Subtle radial gradient gives the canvas depth — darker at the
        // edges, slightly lifted in the middle where the graph centers.
        background:
          'radial-gradient(ellipse at center, #1a1a1f 0%, var(--color-bg-secondary) 60%, #0d0d10 100%)',
        position: 'relative',
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={PRO_OPTIONS}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2.5}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodesChange={onNodesChange}
      >
        <Background gap={32} size={1.2} color="rgba(255,255,255,0.07)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={miniMapNodeColor}
          style={MINIMAP_STYLE}
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.6)"
        />
        <GraphLegend
          kindCounts={kindCounts}
          statusCounts={statusCounts}
          sourceCount={sourceCount}
          edgeCount={inferredEdgeCount}
        />
      </ReactFlow>
    </div>
  );
}
