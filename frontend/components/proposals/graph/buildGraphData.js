/**
 * Pure transform: flat proposal list -> ReactFlow {nodes, edges} topology.
 *
 * The SchemaProposal data model is a flat array with no relationships
 * between rows. To make the canvas look like a real Neo4j graph we
 * synthesize a topology:
 *
 *   - One "source hub" node per unique `source` value. Hubs anchor each
 *     document's proposals so the force layout produces clusters that
 *     map onto the original source-document grouping.
 *
 *   - One "proposal" node per `node`-kind and `section_type`-kind proposal.
 *
 *   - One "scaffolding" edge from each proposal to its source hub. These
 *     are thin and unlabeled — they exist so the spring force pulls each
 *     proposal toward its source rather than drifting to the centroid.
 *
 *   - One "inferred" edge per `edge`-kind proposal. We pick two endpoints
 *     using a best-effort heuristic: the two highest-confidence
 *     node-kind proposals in the same `source_section`. If none exist,
 *     the edge proposal degenerates into a small floating diamond node
 *     near its source hub so it's still surfaced in the UI.
 *
 * Stable IDs are preserved so the force-layout position cache survives
 * across re-renders (e.g. when the user approves a proposal and the
 * status flag flips, but the id-set is unchanged).
 */

import { proposalStatus } from '../proposalUtils';
import { colorForKind, hubColor, radiusForUses, truncateLabel } from './neo4jPalette';

const UNKNOWN_SOURCE = 'Unknown source';
const HUB_PREFIX = '__hub__';
const SCAFFOLD_PREFIX = '__scaf__';

function hubId(source) {
  return `${HUB_PREFIX}${source}`;
}

function pickInferredEndpoints(edgeProposal, byKey) {
  const section = edgeProposal.source_section;
  const source = edgeProposal.source || UNKNOWN_SOURCE;
  const sectionKey = section ? `${source}::${section}` : null;
  const candidates = (sectionKey && byKey.get(sectionKey)) || [];
  if (candidates.length < 2) return null;
  const sorted = [...candidates].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return [sorted[0], sorted[1]];
}

export function buildGraphData(proposals) {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Bucket node-kind and section_type proposals by source_section so the
  // edge-inference heuristic can find candidate endpoints in O(1).
  const byKey = new Map();
  for (const p of proposals) {
    if (p.kind === 'edge') continue;
    const source = p.source || UNKNOWN_SOURCE;
    if (!p.source_section) continue;
    const key = `${source}::${p.source_section}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }

  const sources = new Set();
  for (const p of proposals) sources.add(p.source || UNKNOWN_SOURCE);

  const nodes = [];
  const edges = [];

  for (const source of sources) {
    nodes.push({
      id: hubId(source),
      type: 'hub',
      data: {
        source,
        label: truncateLabel(source, 22),
        fullLabel: source,
        color: hubColor(),
      },
      position: { x: 0, y: 0 }, // overridden by layout
      draggable: false,
      selectable: false,
    });
  }

  for (const p of proposals) {
    const source = p.source || UNKNOWN_SOURCE;
    const status = proposalStatus(p);

    if (p.kind === 'edge') {
      const endpoints = pickInferredEndpoints(p, byKey);
      if (endpoints) {
        edges.push({
          id: p.id,
          type: 'labeled',
          source: endpoints[0].id,
          target: endpoints[1].id,
          data: {
            label: p.label,
            confidence: p.confidence,
            status,
            inferred: true,
          },
        });
        continue;
      }
      // Fallback diamond node near the source hub.
      nodes.push({
        id: p.id,
        type: 'proposal',
        data: {
          proposalId: p.id,
          label: truncateLabel(p.label, 14),
          fullLabel: p.label,
          kind: 'edge',
          status,
          confidence: p.confidence,
          uses: p.uses,
          radius: 22,
          color: colorForKind('edge'),
          shape: 'diamond',
          source,
        },
        position: { x: 0, y: 0 },
      });
      edges.push({
        id: `${SCAFFOLD_PREFIX}${p.id}`,
        source: hubId(source),
        target: p.id,
        type: 'straight',
        data: { scaffold: true },
      });
      continue;
    }

    const radius = radiusForUses(p.uses);
    nodes.push({
      id: p.id,
      type: 'proposal',
      data: {
        proposalId: p.id,
        label: truncateLabel(p.label, 16),
        fullLabel: p.label,
        kind: p.kind,
        status,
        confidence: p.confidence,
        uses: p.uses,
        radius,
        color: colorForKind(p.kind),
        shape: 'circle',
        source,
      },
      position: { x: 0, y: 0 },
    });
    edges.push({
      id: `${SCAFFOLD_PREFIX}${p.id}`,
      source: hubId(source),
      target: p.id,
      type: 'straight',
      data: { scaffold: true },
    });
  }

  return { nodes, edges };
}

export { hubId, HUB_PREFIX, SCAFFOLD_PREFIX };
