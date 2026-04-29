/**
 * ProposalsGraphView — ReactFlow canvas rendering each proposal as a node.
 *
 * Layout: clustered grid by `source_doc`. Proposals from the same source
 * sit horizontally in one band; bands stack vertically with a gap. The
 * `SchemaProposal` data model captures relationship *names* but not
 * endpoints, so edge-kind proposals are rendered as standalone nodes
 * with a dashed border (the tooltip on the node explains this) — no
 * inter-proposal edges are drawn.
 *
 * Positions are computed once when the proposal list changes and reused
 * across re-renders so accepting a single proposal doesn't reshuffle the
 * whole canvas.
 *
 * Click a node → invokes `onSelectProposal(id)`; the page opens the same
 * `ProposalDetailDrawer` used by the queue.
 */

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { KIND_STYLES, STATUS_STYLES, proposalStatus } from './proposalUtils';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;
const COL_GAP = 40;
const ROW_GAP = 32;
const COLS_PER_ROW = 5;
const CLUSTER_GAP = 56;
const CLUSTER_LABEL_OFFSET = 28;

const FIT_VIEW_OPTIONS = { padding: 0.2 };
const PRO_OPTIONS = { hideAttribution: true };
const MINIMAP_STYLE = { backgroundColor: 'var(--color-bg-secondary)' };

const _miniMapNodeColor = (n) => {
  const status = n.data?.status;
  if (status === 'rejected') return 'var(--color-error)';
  if (status === 'accepted') return 'var(--color-success)';
  return 'var(--color-info)';
};

function ProposalNode({ data }) {
  const kindStyle = KIND_STYLES[data.kind] || KIND_STYLES.node;
  const statusStyle = STATUS_STYLES[data.status] || STATUS_STYLES.pending;
  const isEdge = data.kind === 'edge';

  return (
    <div
      title={
        isEdge
          ? `Edge proposal: ${data.label}\nThe SchemaProposal model doesn't capture from/to endpoints, so edge proposals are shown as standalone nodes.`
          : data.label
      }
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: statusStyle.bg,
        border: `${isEdge ? '2px dashed' : '1px solid'} ${statusStyle.dot}`,
        color: 'var(--color-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--font-size-xs)',
          color: kindStyle.color,
        }}
      >
        <span>
          <span aria-hidden="true">{kindStyle.icon}</span> {kindStyle.label}
        </span>
        <span style={{ color: statusStyle.color, fontWeight: 'var(--font-weight-semibold)' }}>
          {Math.round((data.confidence || 0) * 100)}%
        </span>
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          fontFamily: isEdge ? 'var(--font-family-mono)' : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = { proposal: ProposalNode };

function buildNodes(proposals) {
  // Group by source_doc; null/empty falls into "Unknown source" bucket.
  const groups = new Map();
  for (const p of proposals) {
    const key = p.source || 'Unknown source';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const nodes = [];
  let groupY = 0;
  for (const [source, group] of groups.entries()) {
    // Cluster label as a non-interactive node for visual grouping.
    nodes.push({
      id: `__label__${source}`,
      type: 'default',
      position: { x: 0, y: groupY },
      draggable: false,
      selectable: false,
      data: { label: source },
      style: {
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        boxShadow: 'none',
        cursor: 'default',
        padding: 0,
      },
    });

    group.forEach((p, i) => {
      const col = i % COLS_PER_ROW;
      const row = Math.floor(i / COLS_PER_ROW);
      nodes.push({
        id: p.id,
        type: 'proposal',
        position: {
          x: col * (NODE_WIDTH + COL_GAP),
          y: groupY + CLUSTER_LABEL_OFFSET + row * (NODE_HEIGHT + ROW_GAP),
        },
        data: {
          label: p.label,
          kind: p.kind,
          confidence: p.confidence,
          status: proposalStatus(p),
        },
      });
    });

    const rows = Math.ceil(group.length / COLS_PER_ROW);
    groupY +=
      CLUSTER_LABEL_OFFSET + rows * NODE_HEIGHT + Math.max(0, rows - 1) * ROW_GAP + CLUSTER_GAP;
  }
  return nodes;
}

export default function ProposalsGraphView({ proposals, onSelectProposal }) {
  const nodes = useMemo(() => buildNodes(proposals), [proposals]);

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
          The graph view shows proposals clustered by source document. Adjust filters or ingest more
          documents to populate it.
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
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={PRO_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_e, node) => {
          if (node.type === 'proposal') onSelectProposal?.(node.id);
        }}
      >
        <Background gap={24} color="var(--color-border-default)" />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={_miniMapNodeColor} style={MINIMAP_STYLE} pannable zoomable />
      </ReactFlow>
    </div>
  );
}
