import { useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { usePhysicsStore } from '../stores/physicsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePinStore } from '../stores/pinStore';
import { useSizeStore } from '../stores/sizeStore';
import {
  NODE_RADIUS_MAX,
  NODE_RADIUS_MIN,
  calculateRelativeEdgeWidth,
  calculateRelativeNodeRadius,
} from '../utils/messageUtils';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  clusterKey: string;
  radius: number;
  effectiveRadius: number;
  /** 0..1 share of heaviest visible node's connection count (drives ball size). */
  load: number;
  /** Live connection count used for sizing. */
  degree: number;
  color: string;
  highlightColor: string;
  alpha: number;
  lastActive: number;
  pinned: boolean;
  focus: boolean;   // part of a central "focus burst" (scan hub or its target)
}

export interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
  protocol?: string;
  dstPort?: number;
  alpha: number;
  weight: number;
  /** Stroke width derived from peer-relative sustained weight. */
  thickness: number;
  lastActive: number;
}

/**
 * A subnet's home territory: the hex cell it was assigned plus the radius its
 * population fans out over. The layout already computes this every tick to
 * anchor nodes; it is exposed so the renderer can draw the territory itself —
 * a labelled plate under each subnet — instead of leaving the grouping implicit.
 */
export interface ClusterMeta {
  x: number;
  y: number;
  r: number;
  count: number;
}

export interface GraphLayoutResult {
  layoutNodes: MutableRefObject<Map<string, LayoutNode>>;
  layoutEdges: MutableRefObject<LayoutEdge[]>;
  clusterMeta: MutableRefObject<Map<string, ClusterMeta>>;
  tick: (now: number) => void;
}

const PHYSICS_HZ = 30;
const PHYSICS_STEP = 1000 / PHYSICS_HZ;
const NODE_RADIUS = NODE_RADIUS_MIN + 2;
/** How quickly radius eases toward the throughput target (per sync). */
const RADIUS_SMOOTH = 0.22;
// A pinned node with no live connection for this long fades out and is removed
// (the pin RULE stays — it re-docks if the host talks again).
const PIN_IDLE_MS = 60000;
const PIN_FADE_MS = 5000;
const QUIET_EDGE_PADDING = 120;
const DRIFT_GRACE_MS = 1500;
const CLUSTER_RADIUS = 110;
// The virtual "world" is larger than the viewport so there is real room to
// zoom in. The renderer starts zoomed out to fit WORLD_SCALE and lets the user
// zoom past 1.0 into the detail.
export const WORLD_SCALE = 1.8;

// Shared canvas camera (pan/zoom + viewport size). A plain module object — not a
// store — so it updates every mouse event / frame with zero React re-renders.
// The renderer owns and mutates it; the layout reads it to dock pinned nodes in
// fixed SCREEN space (screen→world = screenPos / zoom + pan).
export const camera = { x: 0, y: 0, zoom: 1 / WORLD_SCALE, width: 0, height: 0 };

// Hex cells in ring order (center first, then expanding rings). Subnets are
// assigned to these cells by importance, so the busiest subnet sits in the
// center hex and quieter ones fan outward — "most important right in front".
function hexCells(count: number): Array<{ q: number; r: number }> {
  const cells = [{ q: 0, r: 0 }];
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  let ring = 1;
  while (cells.length < count) {
    let q = dirs[4][0] * ring;
    let r = dirs[4][1] * ring;
    for (let side = 0; side < 6; side++) {
      for (let i = 0; i < ring; i++) {
        cells.push({ q, r });
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
    ring++;
  }
  return cells.slice(0, count);
}

// axial hex → pixel offset (flat-ish, pointy-top), scaled by hex size.
function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

// Rough ring count needed to hold N hex cells (for sizing the hexes to the world).
function hexRingsFor(count: number): number {
  return Math.max(1, Math.ceil((Math.sqrt(1 + (4 * Math.max(1, count)) / 3) - 1) / 2));
}

function getProtocolColor(protocol?: string): string {
  switch (protocol?.toLowerCase()) {
    case 'tcp': return '#00FF00';
    case 'udp': return '#FF00FF';
    case 'icmp': return '#FFFF00';
    case 'http':
    case 'https': return '#FFA500';
    default: return '#CCCCCC';
  }
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 1 / 6) { r = c; g = x; b = 0; }
  else if (h < 2 / 6) { r = x; g = c; b = 0; }
  else if (h < 3 / 6) { r = 0; g = c; b = x; }
  else if (h < 4 / 6) { r = 0; g = x; b = c; }
  else if (h < 5 / 6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getHighlightColor(id: string): string {
  if (id.includes('.')) {
    const parts = id.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !Number.isNaN(p) && p >= 0 && p <= 255)) {
      const [a] = parts;
      if (a === 192) return '#0080ff';
      if (a === 10) return '#ff00ff';
      if (a === 172) return '#ff4500';
      if (a === 8 || a === 1) return '#ffff00';
    }
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  return hslToHex(Math.abs(hash) % 360, 90, 60);
}

function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getClusterKey(id: string): string {
  const parts = id.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !Number.isNaN(p))) {
    const [a, b, c] = parts;
    if (a === 10) return `10.${b}`;
    if (a === 172) return `172.${b}`;
    if (a === 192 && b === 168) return `192.168.${c}`;
    return `${a}`;
  }
  return id.slice(0, 3);
}

// Deterministic home position: same IP always lands in the same spot, clustered
// by subnet. This is what keeps the layout stable — membership and physics can
// churn, but every node is anchored to a fixed home it returns to.
function getHomeAnchor(id: string, width: number, height: number): { x: number; y: number } {
  const key = getClusterKey(id);
  const h = hashStr(key);
  const clusterX = width * (0.14 + 0.72 * ((h % 997) / 997));
  const clusterY = height * (0.14 + 0.72 * (((h >> 10) % 991) / 991));
  const nh = hashStr(id);
  const angle = (nh % 360) * Math.PI / 180;
  const dist = ((nh >> 9) % 100) / 100 * CLUSTER_RADIUS;
  return {
    x: clusterX + Math.cos(angle) * dist,
    y: clusterY + Math.sin(angle) * dist,
  };
}

export function useGraphLayout(): GraphLayoutResult {
  const layoutNodes = useRef<Map<string, LayoutNode>>(new Map());
  const layoutEdges = useRef<LayoutEdge[]>([]);
  const clusterMeta = useRef<Map<string, ClusterMeta>>(new Map());
  const lastTickTime = useRef<number>(0);
  const accumulator = useRef<number>(0);
  const syncCountdown = useRef<number>(0);
  // Blob slot registry: each cluster claims a stable spiral slot on first
  // appearance, so blob placement is deterministic and never churns.
  const clusterSlots = useRef<Map<string, { index: number; lastSeen: number }>>(new Map());
  const nextSlot = useRef<number>(0);
  const clusterTargets = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Pinned node id → timestamp of its last live connection. A docked pin stays
  // on screen (even if the store prunes it) until it has been idle for
  // PIN_IDLE_MS, then it fades out and is removed.
  const pinnedLastConn = useRef<Map<string, number>>(new Map());
  const physicsRef = useRef(usePhysicsStore.getState());
  const viewportRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__VIBES_LAYOUT = { nodes: layoutNodes, edges: layoutEdges };
      (window as any).__VIBES_STORE = useNetworkStore;
      (window as any).__VIBES_SETTINGS = useSettingsStore;
      (window as any).__VIBES_PHYSICS = usePhysicsStore;
      (window as any).__VIBES_CAMERA = camera;
    }
    const { width, height } = useSizeStore.getState();
    viewportRef.current = { width, height };
    const unsubPhysics = usePhysicsStore.subscribe(s => { physicsRef.current = s; });
    const unsubSize = useSizeStore.subscribe(s => {
      viewportRef.current = { width: s.width, height: s.height };
    });
    return () => {
      unsubPhysics();
      unsubSize();
    };
  }, []);

  const deltaSync = useCallback(() => {
    const { nodes: storeNodes, connections: storeConns } = useNetworkStore.getState();
    const { maxNodes, maxConnectionsPerNode } = useSettingsStore.getState();
    const { connectionLifetime } = physicsRef.current;
    const now = Date.now();
    const vp = viewportRef.current;
    const width = vp.width || 1280;
    const height = vp.height || 800;

    const storeById = new Map(storeNodes.map(n => [n.id, n]));
    const { isPined } = usePinStore.getState();

    // Membership hysteresis: a node leaves only when the store drops it or it
    // expires (tickLayout). Never evict by activity rank — rank churn is what
    // made the old layout teleport. Exception: a pinned node that has ever
    // connected stays put even after the store prunes it, so docked pins never
    // vanish mid-session.
    for (const id of layoutNodes.current.keys()) {
      const keepPinned = isPined(id) && (now - (pinnedLastConn.current.get(id) ?? 0) < PIN_IDLE_MS);
      if (!storeById.has(id) && !keepPinned) {
        layoutNodes.current.delete(id);
        pinnedLastConn.current.delete(id);
      }
    }

    // Refresh nodes already in the layout from their store counterparts.
    layoutNodes.current.forEach(node => {
      const sn = storeById.get(node.id);
      if (sn) node.lastActive = sn.lastActive;
    });

    // Live connections, heaviest first. Weight is a decayed packet/byte EWMA
    // from networkStore — priority only, never a hard visibility threshold.
    // Edges already on screen get a sticky bonus so near-equal-weight flows
    // don't swap budget slots every sync. Priority is computed once per conn
    // (decorate-sort) — doing it inside the comparator is a hot-loop killer at
    // firehose connection counts.
    const currentEdgeKeys = new Set(layoutEdges.current.map(e => e.id));
    const maxTopologyEdges = Math.max(40, Math.floor(maxNodes * 2.4));

    // The live connection store can hold tens of thousands of flows at firehose
    // rates. Sorting/allocating over ALL of them every sync cost 10-16ms (a
    // periodic render stall). Two cheap passes instead: pass 1 finds the
    // priority cutoff for the top ~K via a fixed-size min-heap of NUMBERS (no
    // per-connection allocation); pass 2 collects only conns at/above that
    // cutoff (bounded) and sorts that small set.
    const priorityOf = (c: typeof storeConns[number]) =>
      (c.weight ?? 1) + (currentEdgeKeys.has(c.id) ? 2 : 0);
    const K = maxTopologyEdges * 2;
    const heap: number[] = []; // min-heap of the K largest priorities seen so far
    for (const c of storeConns) {
      if (now - c.lastActive > connectionLifetime) continue;
      if (!storeById.has(c.source) || !storeById.has(c.target)) continue;
      const p = priorityOf(c);
      if (heap.length < K) {
        heap.push(p);
        let i = heap.length - 1;
        while (i > 0) { const par = (i - 1) >> 1; if (heap[par] <= heap[i]) break; const tmp = heap[par]; heap[par] = heap[i]; heap[i] = tmp; i = par; }
      } else if (p > heap[0]) {
        heap[0] = p;
        let i = 0; const hn = heap.length;
        for (;;) { const l = 2 * i + 1, r = 2 * i + 2; let s = i; if (l < hn && heap[l] < heap[s]) s = l; if (r < hn && heap[r] < heap[s]) s = r; if (s === i) break; const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp; i = s; }
      }
    }
    const threshold = heap.length >= K ? heap[0] : -Infinity;
    const candCap = K * 3;
    const cand: Array<{ c: typeof storeConns[number]; p: number }> = [];
    for (const c of storeConns) {
      if (cand.length >= candCap) break;
      if (now - c.lastActive > connectionLifetime) continue;
      if (!storeById.has(c.source) || !storeById.has(c.target)) continue;
      const p = priorityOf(c);
      if (p >= threshold) cand.push({ c, p });
    }
    cand.sort((a, b) => b.p - a.p || b.c.lastActive - a.c.lastActive);
    const candidateConns = cand.map(x => x.c);

    const nodeBudget = new Map<string, number>();
    const visibleConns: typeof candidateConns = [];
    for (const c of candidateConns) {
      if (visibleConns.length >= maxTopologyEdges) break;
      const s = nodeBudget.get(c.source) ?? 0;
      const t = nodeBudget.get(c.target) ?? 0;
      if (s >= maxConnectionsPerNode || t >= maxConnectionsPerNode) continue;
      nodeBudget.set(c.source, s + 1);
      nodeBudget.set(c.target, t + 1);
      visibleConns.push(c);
    }

    // Admit new nodes in edge-weight order while there is room. A new node
    // joins its subnet blob wherever that blob currently lives (agar.io cells
    // join their own mass) — spawning at the static hash home instead would
    // permanently drag blob centroids toward the hash location. The hash home
    // only seeds the first member of a brand-new cluster.
    const clusterSeed = new Map<string, LayoutNode>();
    layoutNodes.current.forEach(n => {
      if (!clusterSeed.has(n.clusterKey)) clusterSeed.set(n.clusterKey, n);
    });
    for (const c of visibleConns) {
      for (const id of [c.source, c.target]) {
        if (layoutNodes.current.has(id)) continue;
        if (layoutNodes.current.size >= maxNodes) break;
        const sn = storeById.get(id)!;
        const clusterKey = getClusterKey(id);
        const sibling = clusterSeed.get(clusterKey);
        const home = getHomeAnchor(id, width, height);
        const spawnX = sibling ? sibling.x + (Math.random() - 0.5) * 90 : home.x + (Math.random() - 0.5) * 30;
        const spawnY = sibling ? sibling.y + (Math.random() - 0.5) * 90 : home.y + (Math.random() - 0.5) * 30;
        const newNode: LayoutNode = {
          id,
          x: spawnX,
          y: spawnY,
          vx: 0,
          vy: 0,
          homeX: home.x,
          homeY: home.y,
          clusterKey,
          radius: NODE_RADIUS,
          effectiveRadius: NODE_RADIUS,
          load: 0,
          degree: 0,
          color: getProtocolColor(c.protocol),
          highlightColor: getHighlightColor(id),
          alpha: 1,
          lastActive: sn.lastActive,
          pinned: false,
          focus: false,
        };
        layoutNodes.current.set(id, newNode);
        if (!clusterSeed.has(clusterKey)) clusterSeed.set(clusterKey, newNode);
      }
    }

    const {
      nodeSizingIntensity,
      edgeWidthIntensity,
    } = physicsRef.current;
    const sizingI = Math.max(0, Math.min(1, nodeSizingIntensity));
    const edgeI = Math.max(0, Math.min(1, edgeWidthIntensity));

    // Peer-relative edge thickness from sustained (decayed) weight.
    let maxEdgeWeight = 0;
    for (const c of visibleConns) {
      if (!layoutNodes.current.has(c.source) || !layoutNodes.current.has(c.target)) continue;
      const w = c.weight ?? 1;
      if (w > maxEdgeWeight) maxEdgeWeight = w;
    }
    if (maxEdgeWeight <= 0) maxEdgeWeight = 1;

    layoutEdges.current = visibleConns
      .filter(c =>
        layoutNodes.current.has(c.source) &&
        layoutNodes.current.has(c.target)
      )
      .map(c => {
        const weight = c.weight ?? 1;
        const classicWidth = Math.max(1, Math.min(4, 1 + Math.log1p(weight)));
        const relativeWidth = calculateRelativeEdgeWidth(weight / maxEdgeWeight);
        const thickness = classicWidth + (relativeWidth - classicWidth) * edgeI;
        return {
          id: c.id,
          sourceId: c.source,
          targetId: c.target,
          color: c.packetColor ?? getProtocolColor(c.protocol),
          protocol: c.protocol,
          dstPort: c.dstPort,
          alpha: Math.max(0, 1 - (now - c.lastActive) / connectionLifetime),
          weight,
          thickness,
          lastActive: c.lastActive,
        };
      });

    // Experimental mapping (per-intensity):
    //   ball size  → connection count (degree)
    //   line width → throughput (edge weight) — set above
    const degreeById = new Map<string, number>();
    for (const edge of layoutEdges.current) {
      degreeById.set(edge.sourceId, (degreeById.get(edge.sourceId) ?? 0) + 1);
      degreeById.set(edge.targetId, (degreeById.get(edge.targetId) ?? 0) + 1);
    }
    let maxDegree = 0;
    for (const deg of degreeById.values()) if (deg > maxDegree) maxDegree = deg;
    if (maxDegree <= 0) maxDegree = 1;

    layoutNodes.current.forEach(node => {
      const degree = degreeById.get(node.id) ?? 0;
      const degRel = degree / maxDegree;
      node.degree = degree;
      node.load = sizingI > 0 ? degRel : 0;
      const sizedRadius = calculateRelativeNodeRadius(degRel, NODE_RADIUS_MIN, NODE_RADIUS_MAX);
      const targetRadius = NODE_RADIUS + (sizedRadius - NODE_RADIUS) * sizingI;
      node.radius += (targetRadius - node.radius) * RADIUS_SMOOTH;
      node.effectiveRadius = node.radius;
    });
  }, []);

  const tickLayout = useCallback((dt: number) => {
    const dtNorm = dt / 16.67;
    const {
      nodeSpacing,
      connectionPullStrength,
      collisionRepulsion,
      damping,
      connectionLifetime,
      nodeLifetime,
      driftAwayStrength,
      centerPullStrength,
      springRestLength,
    } = physicsRef.current;

    const { isPined } = usePinStore.getState();
    const vp = viewportRef.current;
    // World is larger than the viewport (WORLD_SCALE) so there's zoom headroom.
    const worldW = (vp.width || 1280) * WORLD_SCALE;
    const worldH = (vp.height || 800) * WORLD_SCALE;
    const centerX = worldW / 2;
    const centerY = worldH / 2;
    const now = Date.now();
    const retain = Math.pow(Math.max(0, 1 - damping), dtNorm);
    const maxVelocity = 18;

    const connectedIds = new Set<string>();
    layoutEdges.current.forEach(edge => {
      if (now - edge.lastActive <= connectionLifetime) {
        connectedIds.add(edge.sourceId);
        connectedIds.add(edge.targetId);
      }
    });

    // Spacing honours the slider directly, capped only by what the whole WORLD
    // (not the viewport) can physically hold at this population — so on a big
    // 4K world a 300px setting really spreads nodes out instead of being
    // throttled to ~150px by a viewport-area cap. The cap only kicks in when the
    // population genuinely can't fit at the requested spacing (prevents grinding).
    const width = vp.width || 1280;
    const height = vp.height || 800;
    const population = Math.max(1, layoutNodes.current.size);
    const worldCap = Math.max(12, Math.sqrt((worldW * worldH) / population) - NODE_RADIUS * 2);
    const adaptiveSpacing = Math.min(nodeSpacing, worldCap);
    const minPairDist = NODE_RADIUS * 2 + adaptiveSpacing;

    // ── Hex territories for ALL subnets (importance-ordered) ─────────────────
    // Every subnet gets a hex cell (busiest subnet = center hex, quieter ones
    // fan outward). QUIET nodes settle firmly into their territory so subnets
    // spread across the world; CONNECTED nodes get only a whisper of home
    // tether, so their springs pull them OUT of their territory to aggregate
    // with live peers — crossing grids toward wherever the conversation is.
    // Territory is home base, not a cage.
    const clusterWeight = new Map<string, number>();
    layoutEdges.current.forEach(e => {
      if (now - e.lastActive > connectionLifetime) return;
      const sc = layoutNodes.current.get(e.sourceId)?.clusterKey;
      const tc = layoutNodes.current.get(e.targetId)?.clusterKey;
      if (sc) clusterWeight.set(sc, (clusterWeight.get(sc) ?? 0) + e.weight);
      if (tc) clusterWeight.set(tc, (clusterWeight.get(tc) ?? 0) + e.weight);
    });
    const allSubnets = new Set<string>();
    const subnetPop = new Map<string, number>();
    layoutNodes.current.forEach(n => {
      allSubnets.add(n.clusterKey);
      subnetPop.set(n.clusterKey, (subnetPop.get(n.clusterKey) ?? 0) + 1);
    });

    allSubnets.forEach(key => {
      const slot = clusterSlots.current.get(key);
      if (slot) slot.lastSeen = now;
      else clusterSlots.current.set(key, { index: 0, lastSeen: now });
    });
    for (const [key, slot] of clusterSlots.current) {
      if (now - slot.lastSeen > 30000) {
        clusterSlots.current.delete(key);
        clusterTargets.current.delete(key);
      }
    }

    const orderedSubnets = Array.from(allSubnets).sort((a, b) =>
      (clusterWeight.get(b) ?? 0) - (clusterWeight.get(a) ?? 0) || a.localeCompare(b));
    const cells = hexCells(orderedSubnets.length);
    const rings = hexRingsFor(orderedSubnets.length);
    const hexSize = Math.min(worldW, worldH) / (2 * (rings + 1.2));

    // Stretch the (isotropic) hex field horizontally to fill a widescreen world,
    // so a 16:9 monitor uses its left/right real-estate instead of leaving the
    // territories in a tall centered column.
    const aspectStretch = Math.min(1.9, Math.max(1, worldW / worldH));
    const clusterHome = new Map<string, { x: number; y: number }>();
    orderedSubnets.forEach((key, i) => {
      const cell = cells[i];
      const px = hexToPixel(cell.q, cell.r, hexSize);
      const tx = centerX + px.x * aspectStretch;
      const ty = centerY + px.y;
      // Smoothed home so a subnet gliding to a new hex (importance shift) flows.
      const t = clusterTargets.current.get(key) ?? { x: tx, y: ty };
      t.x += (tx - t.x) * 0.05 * dtNorm;
      t.y += (ty - t.y) * 0.05 * dtNorm;
      clusterTargets.current.set(key, t);
      clusterHome.set(key, t);
    });

    // ── Focus bursts: surface scan / fan-out hubs to the centre ──────────────
    // Interest = distinct live peers (fan-out breadth) + distinct dst ports
    // (port-sweep breadth). The few highest-interest hosts (a scan is one host
    // hitting many hosts across many ports) are pulled to the centre and their
    // targets arranged in a radial burst around them — a readable nmap "star".
    // Everything else is bulk context (dimmed by the renderer).
    const fanOut = new Map<string, Set<string>>();
    const scanPorts = new Map<string, Set<number>>();
    const addTo = <T,>(m: Map<string, Set<T>>, k: string, v: T) => {
      let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(v);
    };
    layoutEdges.current.forEach(edge => {
      if (now - edge.lastActive > connectionLifetime) return;
      addTo(fanOut, edge.sourceId, edge.targetId);
      addTo(fanOut, edge.targetId, edge.sourceId);
      if (edge.dstPort) addTo(scanPorts, edge.sourceId, edge.dstPort);
    });
    const interestOf = (id: string) => (fanOut.get(id)?.size ?? 0) + (scanPorts.get(id)?.size ?? 0) * 1.5;
    const FOCUS_MAX = 4;
    const FOCUS_THRESHOLD = 8;          // genuine fan-out, not 1:1 chatter
    const hubs = Array.from(layoutNodes.current.keys())
      .filter(id => !isPined(id) && interestOf(id) >= FOCUS_THRESHOLD)
      .sort((a, b) => interestOf(b) - interestOf(a))
      .slice(0, FOCUS_MAX);
    const burstTarget = new Map<string, { x: number; y: number }>();
    const focusSet = new Set<string>();
    const minDim = Math.min(worldW, worldH);
    hubs.forEach((hubId, hi) => {
      focusSet.add(hubId);
      // Spread multiple hubs on a tight ring around centre so the burst reads as
      // one central cluster, not scattered off-centre.
      const hubAng = hubs.length > 1 ? (hi / hubs.length) * Math.PI * 2 : 0;
      const hubR = hubs.length > 1 ? minDim * 0.06 : 0;
      const hx = centerX + Math.cos(hubAng) * hubR;
      const hy = centerY + Math.sin(hubAng) * hubR;
      burstTarget.set(hubId, { x: hx, y: hy });
      const victims = Array.from(fanOut.get(hubId) ?? []);
      const rBurst = Math.min(minDim * 0.26, Math.max(minPairDist * 2, minPairDist * Math.sqrt(victims.length) * 0.7));
      victims.forEach(vid => {
        if (isPined(vid) || focusSet.has(vid)) return;   // don't steal pins / other hubs' nodes
        const nh = hashStr(vid);
        const ang = (nh % 360) * Math.PI / 180;
        const rr = rBurst * (0.55 + ((nh >> 9) % 100) / 100 * 0.45);
        burstTarget.set(vid, { x: hx + Math.cos(ang) * rr, y: hy + Math.sin(ang) * rr });
        focusSet.add(vid);
      });
    });

    // ── Pinned nodes dock in a fixed SCREEN-space frame ──────────────────────
    // Straight down a column left of the top-right debug panel (UnifiedDebugPanel:
    // fixed, right:10px, width:400px, maxHeight:80vh — clearing it horizontally
    // is the only robust option since its height varies with content), then
    // wrapping right→left across the bottom; overflow stacks upward so a full
    // /24 stays on-screen. Positions are screen px converted to world coords
    // through the live camera, so the dock stays glued to the screen under any
    // pan/zoom. Placed BEFORE the home loop so neighbours can target the dock.
    layoutNodes.current.forEach(n => { n.pinned = isPined(n.id); });
    const pinnedList = Array.from(layoutNodes.current.values())
      .filter(n => n.pinned)
      .sort((a, b) => a.id.localeCompare(b.id));
    const screenW = vp.width || 1280;
    const screenH = vp.height || 800;
    const leftMargin = 60;
    const hStep = 150;
    // Clears the debug panel's left edge (screenW - 410) with margin; clamped for narrow viewports
    const dockRightX = Math.max(leftMargin + hStep, screenW - 440);
    const dockTopY = 70;
    const dockBottomY = Math.max(dockTopY + 64, screenH - 45);
    const vStep = 64;   // more vertical room per pin so its neighbour fan doesn't crowd the next pin
    const rightColCount = Math.max(1, Math.floor((dockBottomY - dockTopY) / vStep));
    const bottomCols = Math.max(1, Math.floor((dockRightX - leftMargin) / hStep));
    const pinExpired: string[] = [];
    pinnedList.forEach((node, i) => {
      let sx: number, sy: number;
      if (i < rightColCount) {
        sx = dockRightX;
        sy = dockTopY + i * vStep;
      } else {
        const j = i - rightColCount;
        const row = Math.floor(j / bottomCols);
        const colInRow = j % bottomCols;
        sx = dockRightX - colInRow * hStep;
        sy = dockBottomY - row * vStep;
      }
      node.x = sx / camera.zoom + camera.x;
      node.y = sy / camera.zoom + camera.y;
      node.vx = 0;
      node.vy = 0;
      // Track last live connection; fade over the final PIN_FADE_MS and expire
      // after PIN_IDLE_MS of no connection (the pin rule survives — it re-docks
      // if the host talks again).
      if (connectedIds.has(node.id)) pinnedLastConn.current.set(node.id, now);
      const idle = now - (pinnedLastConn.current.get(node.id) ?? now);
      if (idle >= PIN_IDLE_MS) {
        pinExpired.push(node.id);
        node.alpha = 0;
      } else {
        node.alpha = idle > PIN_IDLE_MS - PIN_FADE_MS
          ? Math.max(0, (PIN_IDLE_MS - idle) / PIN_FADE_MS)
          : 1;
      }
    });
    pinExpired.forEach(id => {
      layoutNodes.current.delete(id);
      pinnedLastConn.current.delete(id);
      useNetworkStore.getState().removeNode(id);
    });

    // Neighbours of pinned nodes migrate to the dock, but instead of piling on
    // the pin they fan out on a compact arc opening toward screen centre (so a
    // right-edge pin's talkers spread left into open canvas, a bottom pin's
    // spread up). Strongest edge decides which pin a neighbour belongs to.
    const pinNbrs = new Map<string, { pinId: string; w: number }>();
    layoutEdges.current.forEach(edge => {
      if (now - edge.lastActive > connectionLifetime) return;
      const s = layoutNodes.current.get(edge.sourceId);
      const t = layoutNodes.current.get(edge.targetId);
      if (!s || !t || s.pinned === t.pinned) return;    // need exactly one pinned
      const pin = s.pinned ? s : t;
      const nb = s.pinned ? t : s;
      const cur = pinNbrs.get(nb.id);
      if (!cur || edge.weight > cur.w) pinNbrs.set(nb.id, { pinId: pin.id, w: edge.weight });
    });
    const byPin = new Map<string, string[]>();
    pinNbrs.forEach((v, nbId) => {
      const arr = byPin.get(v.pinId);
      if (arr) arr.push(nbId); else byPin.set(v.pinId, [nbId]);
    });
    const pinAttractor = new Map<string, { x: number; y: number }>();
    const fanGap = NODE_RADIUS * 2 + 26;              // compact, dock-local spacing
    byPin.forEach((nbIds, pinId) => {
      const pin = layoutNodes.current.get(pinId);
      if (!pin) return;
      nbIds.sort();
      let ix = centerX - pin.x, iy = centerY - pin.y;  // inward = toward screen centre
      const il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il;
      const inwardAng = Math.atan2(iy, ix);
      const n = nbIds.length;
      const R = Math.max(fanGap * 1.6, (fanGap * n) / Math.PI);  // radius grows with count
      const step = fanGap / R;                         // ~fanGap arc spacing between neighbours
      nbIds.forEach((nbId, k) => {
        const a = inwardAng + (k - (n - 1) / 2) * step;
        pinAttractor.set(nbId, { x: pin.x + Math.cos(a) * R, y: pin.y + Math.sin(a) * R });
      });
    });

    // Per-node home = subnet hex center + a deterministic spread. Territory SIZE
    // scales with subnet population (radius ∝ √count) so a 240-node subnet fans
    // out across a big disk instead of piling into one hex, while a 2-node subnet
    // stays compact. The √ radial term keeps areal density even (no center
    // pileup). This is what actually uses the screen — the dominant subnets, the
    // ones carrying most of the nodes, spread wide instead of clumping.
    const territoryRadius = (key: string) =>
      Math.max(hexSize * 0.3, minPairDist * Math.sqrt(subnetPop.get(key) ?? 1) * 0.55);

    // Publish the territory geometry for the renderer's plates. Rebuilt in
    // place each tick: cluster count is small and the map identity is stable,
    // so this stays out of React entirely, like the rest of the layout.
    clusterMeta.current.clear();
    clusterHome.forEach((h, key) => {
      clusterMeta.current.set(key, { x: h.x, y: h.y, r: territoryRadius(key), count: subnetPop.get(key) ?? 0 });
    });
    layoutNodes.current.forEach(node => {
      node.focus = focusSet.has(node.id);
      const h = clusterHome.get(node.clusterKey);
      if (h) {
        const nh = hashStr(node.id);
        const ang = (nh % 360) * Math.PI / 180;
        const rad = Math.sqrt(((nh >> 9) % 100) / 100) * territoryRadius(node.clusterKey);
        node.homeX = h.x + Math.cos(ang) * rad;
        node.homeY = h.y + Math.sin(ang) * rad;
      }

      if (node.pinned) return;                          // docked above

      const attractor = pinAttractor.get(node.id);
      if (attractor) {
        // Talking to a pinned node → migrate strongly toward its dock. This pull
        // overrides territory home so even far / long-connected neighbours
        // travel all the way to the pin and cluster beside it.
        node.vx += (attractor.x - node.x) * 0.05 * dtNorm;
        node.vy += (attractor.y - node.y) * 0.05 * dtNorm;
        return;
      }

      const burst = burstTarget.get(node.id);
      if (burst) {
        // Focus hub or one of its targets → pull hard into the central burst,
        // overriding territory home so the whole scan pattern gathers in the
        // middle as a readable star (springs on these edges are weak, so this
        // pull sets the geometry).
        node.vx += (burst.x - node.x) * 0.09 * dtNorm;
        node.vy += (burst.y - node.y) * 0.09 * dtNorm;
        return;
      }

      if (!h) return;
      // Connected nodes keep a real pull home so subnets hold their territory
      // and spread across the world; springs still bend them toward live peers,
      // forming bridges BETWEEN territories rather than one central clump.
      // Quiet nodes settle firmly into their hex.
      const homePull = connectedIds.has(node.id) ? 0.02 : 0.028;
      node.vx += (node.homeX - node.x) * homePull * dtNorm;
      node.vy += (node.homeY - node.y) * homePull * dtNorm;
    });

    const toRemove: string[] = [];
    layoutNodes.current.forEach(node => {
      if (isPined(node.id)) return;

      const age = now - node.lastActive;
      if (age > nodeLifetime) {
        toRemove.push(node.id);
        return;
      }

      // Cull only if a node has drifted far outside the whole WORLD (not the
      // viewport) — the world is larger than the screen, so most nodes live
      // off-viewport legitimately and must not be removed.
      const offscreen = node.x < -300 || node.x > worldW + 300 ||
        node.y < -300 || node.y > worldH + 300;
      if (offscreen) {
        toRemove.push(node.id);
        return;
      }

      // Connected nodes are opaque; quiet nodes fade over their remaining life
      // but stay home in their territory (the home-pull above handles position).
      if (connectedIds.has(node.id)) {
        node.alpha = 1;
      } else {
        const fadeAge = Math.max(0, age - connectionLifetime);
        const fadeWindow = Math.max(1, nodeLifetime - connectionLifetime);
        node.alpha = Math.max(0, 1 - fadeAge / fadeWindow);
      }
    });

    toRemove.forEach(id => {
      layoutNodes.current.delete(id);
      useNetworkStore.getState().removeNode(id);
    });

    // Spatial-hash repulsion: O(n * neighbors) instead of O(n^2) so 1000 nodes
    // stays real-time. Cell size = the largest interaction distance.
    const nodes = Array.from(layoutNodes.current.values());
    const maxSoft = (NODE_RADIUS * 2 + adaptiveSpacing) * 1.6;
    const cellSize = Math.max(24, maxSoft);
    const grid = new Map<number, LayoutNode[]>();
    const cellOf = (x: number, y: number) => (Math.floor(x / cellSize) * 73856093) ^ (Math.floor(y / cellSize) * 19349663);
    nodes.forEach(node => {
      const key = cellOf(node.x, node.y);
      const bucket = grid.get(key);
      if (bucket) bucket.push(node); else grid.set(key, [node]);
    });

    const applyPair = (a: LayoutNode, b: LayoutNode) => {
      if (isPined(a.id) && isPined(b.id)) return;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // Quiet nodes keep half the footprint — dying conversations yield space
      // to active ones instead of holding territory while they fade.
      const aQuiet = !connectedIds.has(a.id);
      const bQuiet = !connectedIds.has(b.id);
      const spacing = (aQuiet || bQuiet) ? adaptiveSpacing * 0.5 : adaptiveSpacing;
      const minDist = a.effectiveRadius + b.effectiveRadius + spacing;
      const softDist = minDist * 1.6;
      if (Math.abs(dx) > softDist || Math.abs(dy) > softDist) return;

      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (dist >= softDist) return;

      const strength = dist < minDist
        ? collisionRepulsion * 0.65 * (minDist - dist) / dist
        : collisionRepulsion * 0.08 * (softDist - dist) / dist;
      const push = strength * dtNorm;

      if (!isPined(a.id)) {
        a.vx -= dx * push;
        a.vy -= dy * push;
      }
      if (!isPined(b.id)) {
        b.vx += dx * push;
        b.vy += dy * push;
      }

      if (dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const correction = Math.min((minDist - dist) * 0.5, 10);
        const aPinned = isPined(a.id);
        const bPinned = isPined(b.id);
        if (!aPinned && !bPinned) {
          a.x -= nx * correction * 0.5;
          a.y -= ny * correction * 0.5;
          b.x += nx * correction * 0.5;
          b.y += ny * correction * 0.5;
        } else if (!aPinned) {
          a.x -= nx * correction;
          a.y -= ny * correction;
        } else if (!bPinned) {
          b.x += nx * correction;
          b.y += ny * correction;
        }
      }
    };

    nodes.forEach((node, idx) => {
      (node as any).__idx = idx;
    });
    nodes.forEach(node => {
      const cx = Math.floor(node.x / cellSize);
      const cy = Math.floor(node.y / cellSize);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get((gx * 73856093) ^ (gy * 19349663));
          if (!bucket) continue;
          for (const other of bucket) {
            if ((other as any).__idx <= (node as any).__idx) continue;
            applyPair(node, other);
          }
        }
      }
    });

    const liveDegree = new Map<string, number>();
    layoutEdges.current.forEach(edge => {
      if (now - edge.lastActive > connectionLifetime) return;
      liveDegree.set(edge.sourceId, (liveDegree.get(edge.sourceId) ?? 0) + 1);
      liveDegree.set(edge.targetId, (liveDegree.get(edge.targetId) ?? 0) + 1);
    });

    layoutEdges.current.forEach(edge => {
      if (now - edge.lastActive > connectionLifetime) return;

      const source = layoutNodes.current.get(edge.sourceId);
      const target = layoutNodes.current.get(edge.targetId);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const edgeDegree = Math.max(liveDegree.get(source.id) ?? 1, liveDegree.get(target.id) ?? 1);
      const degreeResponse = Math.max(0.18, Math.min(1, Math.sqrt(8 / edgeDegree)));
      const weightResponse = Math.max(0.65, Math.min(1.6, Math.sqrt(edge.weight)));
      // Tethered pairs actively converge (agar.io-style): springs are the
      // dominant force for connected nodes, rest length shrinks with density
      // and with flow weight so heavy talkers sit closest. Same-subnet pairs
      // pull into tight grape-clusters; cross-subnet edges are long loose
      // tethers BETWEEN blobs — that contrast is what makes groups readable.
      const sameCluster = source.clusterKey === target.clusterKey;
      const baseRest = Math.min(springRestLength, adaptiveSpacing + NODE_RADIUS * 2 + 15);
      const tightRest = Math.max(NODE_RADIUS * 2 + adaptiveSpacing + 6, baseRest - Math.min(25, edge.weight * 3));
      // Cross-subnet edges are the whole point now: they must pull connected
      // nodes together ACROSS territories so live conversations aggregate. Only
      // a slightly longer rest length and modestly softer response than
      // same-subnet, not the near-zero pull that used to lock nodes home.
      // Same-subnet: tight rest + strong response → talkers snap close together.
      // Cross-subnet: a LONG, LOOSE tether (rest scales with hex spacing, response
      // cut hard) so live conversations lean toward each other WITHOUT dragging
      // whole territories into a central hairball. This contrast is what spreads
      // clusters across the screen while keeping connected pairs visibly close.
      // Edges touching a pinned node use a short rest + strong response so the
      // neighbour sits right beside the dock (the attractor already walks it
      // there; this keeps it snug instead of held off at a long rest length).
      const pinEdge = source.pinned || target.pinned;
      // Pin and focus (burst) edges: the attractor arc / burst target defines the
      // geometry, so keep these springs very weak — they draw the spoke without
      // collapsing the arrangement onto the anchor.
      const focusEdge = (source.focus || target.focus) && !pinEdge;
      const restLength = pinEdge
        ? NODE_RADIUS * 2 + adaptiveSpacing * 0.5
        : sameCluster ? tightRest : tightRest + Math.min(320, hexSize * 0.6);
      const clusterResponse = (pinEdge ? 1.3 : sameCluster ? 1.05 : 0.4) * (pinEdge || focusEdge ? 0.15 : 1);
      const displacement = Math.max(-400, Math.min(400, dist - restLength));
      const spring = connectionPullStrength * 0.007 * clusterResponse * weightResponse * degreeResponse * displacement * dtNorm;
      const nx = dx / dist;
      const ny = dy / dist;

      if (!isPined(source.id)) {
        source.vx += nx * spring;
        source.vy += ny * spring;
      }
      if (!isPined(target.id)) {
        target.vx -= nx * spring;
        target.vy -= ny * spring;
      }
    });

    const edgeMargin = 40;
    layoutNodes.current.forEach(node => {
      if (isPined(node.id)) return;
      node.vx *= retain;
      node.vy *= retain;
      node.vx = Math.max(-maxVelocity, Math.min(maxVelocity, node.vx));
      node.vy = Math.max(-maxVelocity, Math.min(maxVelocity, node.vy));
      node.x += node.vx * dtNorm;
      node.y += node.vy * dtNorm;

      // Hard walls at the WORLD edges (world is larger than the viewport), so
      // aggregating masses stay inside the world instead of being shoved out.
      if (node.x < edgeMargin) { node.x = edgeMargin; node.vx = Math.max(0, node.vx); }
      if (node.x > worldW - edgeMargin) { node.x = worldW - edgeMargin; node.vx = Math.min(0, node.vx); }
      if (node.y < edgeMargin) { node.y = edgeMargin; node.vy = Math.max(0, node.vy); }
      if (node.y > worldH - edgeMargin) { node.y = worldH - edgeMargin; node.vy = Math.min(0, node.vy); }
    });
  }, []);

  const tick = useCallback((now: number) => {
    const rawDelta = lastTickTime.current > 0 ? now - lastTickTime.current : 16;
    lastTickTime.current = now;
    accumulator.current += Math.min(rawDelta, 100);

    while (accumulator.current >= PHYSICS_STEP) {
      // Membership/edge sync scans the whole connection store — ~10 Hz is
      // imperceptible (edge alpha fades over seconds) and keeps the 30 Hz
      // physics steps cheap at firehose connection counts.
      syncCountdown.current -= 1;
      if (syncCountdown.current <= 0) {
        const t0 = performance.now();
        deltaSync();
        if (import.meta.env.DEV) (window as any).__VIBES_PERF = { ...(window as any).__VIBES_PERF, syncMs: performance.now() - t0 };
        syncCountdown.current = 3;
      }
      if (import.meta.env.DEV) {
        const t1 = performance.now();
        tickLayout(PHYSICS_STEP);
        (window as any).__VIBES_PERF = { ...(window as any).__VIBES_PERF, tickMs: performance.now() - t1 };
      } else {
        tickLayout(PHYSICS_STEP);
      }
      accumulator.current -= PHYSICS_STEP;
    }
  }, [deltaSync, tickLayout]);

  return { layoutNodes, layoutEdges, clusterMeta, tick };
}
