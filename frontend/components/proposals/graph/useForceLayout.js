/**
 * useForceLayout — custom force-directed simulation hook for ReactFlow.
 *
 * No external physics library: a ~120-LoC requestAnimationFrame loop with
 * three forces (charge repulsion, link spring, center gravity) and Euler
 * integration with velocity damping. Runs only while alpha > ALPHA_MIN
 * and stops automatically once the layout settles.
 *
 * Key behaviors:
 *
 *  - Positions are cached across re-renders. When `graphData` changes
 *    but the id-set is unchanged (e.g. a proposal's status flips after
 *    approval), the existing positions are reused and the simulation
 *    does NOT restart — otherwise the canvas would reshuffle on every
 *    review action, which would be jarring.
 *
 *  - When new ids appear (filter cleared, ingest landed) we kick alpha
 *    back to 1 and re-run; new nodes are seeded near their source hub
 *    so they don't fly in from the corner.
 *
 *  - Pinned nodes have `fx`/`fy` set and skip integration but still
 *    exert repulsion on neighbors. Drag and drop pins in place; double
 *    click or "Reset layout" un-pins.
 *
 *  - Performance guard: if the node count exceeds MAX_NODES_FOR_SIM we
 *    skip the O(n²) simulation and fall back to a simple grid pack, so
 *    a pathological filter doesn't lock the page.
 *
 *  - SSR-safe: requestAnimationFrame is only touched inside useEffect.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Tuned to keep nodes visually separated. Charge repulsion grows with
// node radii so larger circles get a larger personal-space bubble; a
// short-range collision response prevents overlap when the long-range
// repulsion isn't enough.
const K_REPULSE = 14000;
const K_SPRING = 0.035;
const K_GRAVITY = 0.011;
const K_COLLISION = 0.5;
const COLLISION_PADDING = 28;
const DAMPING = 0.55;
const ALPHA_DECAY = 0.985;
const ALPHA_MIN = 0.01;
const MIN_DIST_SQ = 400;
const REST_SCAFFOLD = 200;
const REST_INFERRED = 320;
const MAX_NODES_FOR_SIM = 800;
const UNKNOWN_SOURCE = 'Unknown source';

function tickSimulation(state) {
  const { sim, edges, alpha, width, height } = state;
  const centerX = width / 2;
  const centerY = height / 2;

  const items = [];
  for (const [, st] of sim) items.push(st);

  // Pairwise repulsion + short-range collision response (O(n²) — fine up
  // to a few hundred nodes). The collision force kicks in only when two
  // circles would overlap; it scales linearly with overlap and gives an
  // unmistakable push that the inverse-square repulsion alone produces
  // too gently when nodes are very close together.
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const aR = a.radius || 18;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const bR = b.radius || 18;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const rawDistSq = dx * dx + dy * dy;
      const distSq = Math.max(rawDistSq, MIN_DIST_SQ);
      const dist = Math.sqrt(distSq);
      const minSep = aR + bR + COLLISION_PADDING;
      // Inverse-square charge repulsion, scaled by the product of radii
      // so big nodes push harder than small ones.
      const massFactor = Math.sqrt(aR * bR) / 18;
      const force = (K_REPULSE * massFactor) / distSq;
      // Short-range collision response: only active when nodes overlap.
      const overlap = Math.max(0, minSep - dist);
      const collisionForce = overlap * K_COLLISION;
      const totalForce = (force + collisionForce) * alpha;
      const fx = (dx / dist) * totalForce;
      const fy = (dy / dist) * totalForce;
      if (a.fx == null) {
        a.vx += fx;
        a.vy += fy;
      }
      if (b.fx == null) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  // Spring force along each edge pulls connected nodes toward `rest`.
  for (const edge of edges) {
    const a = sim.get(edge.source);
    const b = sim.get(edge.target);
    if (!a || !b) continue;
    const rest = edge.data?.scaffold ? REST_SCAFFOLD : REST_INFERRED;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const stretch = dist - rest;
    const force = K_SPRING * stretch * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (a.fx == null) {
      a.vx += fx;
      a.vy += fy;
    }
    if (b.fx == null) {
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Weak pull toward center; hubs have heavier gravity so clusters stay
  // anchored rather than drifting to one edge of the canvas.
  for (const n of items) {
    if (n.fx != null) continue;
    const dx = centerX - n.x;
    const dy = centerY - n.y;
    const weight = n.isHub ? 2 : 1;
    n.vx += dx * K_GRAVITY * alpha * weight;
    n.vy += dy * K_GRAVITY * alpha * weight;
  }

  // Integrate velocity → position with damping.
  for (const n of items) {
    if (n.fx != null) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  }
}

function packGridLayout(sim, width, height) {
  const ids = [...sim.keys()];
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const rows = Math.ceil(ids.length / cols);
  const spacing = 60;
  const startX = width / 2 - (cols * spacing) / 2;
  const startY = height / 2 - (rows * spacing) / 2;
  ids.forEach((id, i) => {
    const n = sim.get(id);
    n.x = startX + (i % cols) * spacing;
    n.y = startY + Math.floor(i / cols) * spacing;
    n.vx = 0;
    n.vy = 0;
  });
}

export function useForceLayout(graphData, options = {}) {
  const { width = 1200, height = 720 } = options;

  const stateRef = useRef({
    sim: new Map(),
    edges: [],
    alpha: 0,
    prevIdKey: '',
    width,
    height,
  });
  const rafRef = useRef(null);
  // Drag pause — while a node is being dragged, suppress the simulation
  // loop so we're not racing the user's mouse with ~60 force ticks per
  // second. The dragged node's position is updated directly via pinNode
  // from onNodesChange; we resume the simulation on drag release.
  const draggingRef = useRef(false);
  const [renderTick, setRenderTick] = useState(0);

  stateRef.current.width = width;
  stateRef.current.height = height;

  const startLoop = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current != null) return;
    const step = () => {
      const s = stateRef.current;
      if (!s || s.alpha < ALPHA_MIN) {
        rafRef.current = null;
        setRenderTick((t) => t + 1);
        return;
      }
      if (draggingRef.current) {
        // Paused — bail out of the RAF chain. setDragging(false) will
        // restart the loop once the drag releases.
        rafRef.current = null;
        return;
      }
      tickSimulation(s);
      s.alpha *= ALPHA_DECAY;
      setRenderTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const setDragging = useCallback(
    (value) => {
      const wasDragging = draggingRef.current;
      draggingRef.current = !!value;
      if (wasDragging && !value) {
        // Drag released — give the springs a small nudge so neighboring
        // nodes can settle around the new pinned position, then resume.
        stateRef.current.alpha = Math.max(stateRef.current.alpha, 0.3);
        startLoop();
      }
    },
    [startLoop]
  );

  // Sync graphData → simulation state. Reuse cached positions when ids
  // match; seed brand-new nodes near their source hub; kick alpha only
  // when the id-set actually changed.
  useEffect(() => {
    const s = stateRef.current;
    const ids = graphData.nodes.map((n) => n.id);
    const idKey = ids.slice().sort().join('|');
    const prev = s.sim;
    const sim = new Map();

    const hubs = graphData.nodes.filter((n) => n.type === 'hub');
    // Spread hubs around a larger initial ring so cluster halos don't
    // overlap before the simulation has had time to settle.
    const hubRadius = Math.max(160, hubs.length * 48);

    for (const node of graphData.nodes) {
      const cached = prev.get(node.id);
      if (cached) {
        // Keep position/velocity, but refresh metadata that can change
        // when the proposal data updates (e.g. uses count growing).
        cached.radius = node.data?.radius ?? cached.radius ?? 18;
        cached.isHub = node.type === 'hub';
        sim.set(node.id, cached);
        continue;
      }
      if (node.type === 'hub') {
        const idx = hubs.indexOf(node);
        const angle = (2 * Math.PI * idx) / Math.max(hubs.length, 1);
        sim.set(node.id, {
          x: width / 2 + Math.cos(angle) * hubRadius,
          y: height / 2 + Math.sin(angle) * hubRadius,
          vx: 0,
          vy: 0,
          isHub: true,
          radius: 14,
        });
      } else {
        const hubKey = `__hub__${node.data?.source || UNKNOWN_SOURCE}`;
        const hub = sim.get(hubKey);
        const angle = Math.random() * Math.PI * 2;
        // Seed proposals on a wider halo around the hub so the springs
        // don't have to fight the overlap inherited from a tight start.
        const offset = 90 + Math.random() * 60;
        sim.set(node.id, {
          x: (hub?.x ?? width / 2) + Math.cos(angle) * offset,
          y: (hub?.y ?? height / 2) + Math.sin(angle) * offset,
          vx: 0,
          vy: 0,
          isHub: false,
          radius: node.data?.radius ?? 18,
        });
      }
    }

    s.sim = sim;
    s.edges = graphData.edges;

    if (ids.length > MAX_NODES_FOR_SIM) {
      packGridLayout(sim, width, height);
      s.alpha = 0;
      s.prevIdKey = idKey;
      setRenderTick((t) => t + 1);
      return;
    }

    if (idKey !== s.prevIdKey) {
      s.alpha = 1.0;
      s.prevIdKey = idKey;
      startLoop();
    } else {
      setRenderTick((t) => t + 1);
    }
  }, [graphData, width, height, startLoop]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const pinNode = useCallback((id, x, y) => {
    const n = stateRef.current.sim.get(id);
    if (!n) return;
    n.fx = x;
    n.fy = y;
    n.x = x;
    n.y = y;
    n.vx = 0;
    n.vy = 0;
    setRenderTick((t) => t + 1);
  }, []);

  // Clears a node's fx/fy and kicks the simulation so it can re-settle
  // around the released position. Used at drag-end — there is no longer
  // any persistent pin to "un-pin", just a transient drag-tracking pin
  // that lasts the duration of the drag.
  const releaseNode = useCallback(
    (id) => {
      const n = stateRef.current.sim.get(id);
      if (!n) return;
      n.fx = undefined;
      n.fy = undefined;
      stateRef.current.alpha = Math.max(stateRef.current.alpha, 0.6);
      startLoop();
    },
    [startLoop]
  );

  const kick = useCallback(() => {
    stateRef.current.alpha = 1.0;
    startLoop();
  }, [startLoop]);

  // Snapshot positions, memoized by renderTick. The simulation mutates
  // stateRef.current.sim in place; setRenderTick is the only signal that
  // a publish is needed. Memoizing here means parent re-renders that
  // happen for unrelated reasons (hover, drawer, etc.) reuse the same
  // positions Map identity, so the parent's flowNodes useMemo bails out
  // and CircleNodes don't re-render for those events.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const positions = useMemo(() => {
    const map = new Map();
    for (const [id, n] of stateRef.current.sim) {
      map.set(id, { x: n.x, y: n.y });
    }
    return map;
  }, [renderTick]);

  // Getter for the live drag flag — lets the parent suppress hover state
  // changes while a drag is in progress without forcing a re-render every
  // time the flag flips. Reading the ref is cheap and always current.
  const isDragging = useCallback(() => draggingRef.current, []);

  return {
    positions,
    pinNode,
    releaseNode,
    kick,
    setDragging,
    isDragging,
  };
}
