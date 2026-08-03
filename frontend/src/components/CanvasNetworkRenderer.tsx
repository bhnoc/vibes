import React, { useEffect, useRef, useCallback } from 'react';
import { useSizeStore } from '../stores/sizeStore';
import { useGraphLayout, WORLD_SCALE, camera } from '../hooks/useGraphLayout';
import { useThemeStore, subnetNodeColor, edgeColor, Theme } from '../stores/themeStore';
import { usePinStore } from '../stores/pinStore';
import { usePhysicsStore } from '../stores/physicsStore';

// Start zoomed out so the whole (larger-than-viewport) world fits, leaving real
// room to zoom in. zoom = 1/WORLD_SCALE with pan (0,0) maps world → viewport 1:1.
const FIT_ZOOM = 1 / WORLD_SCALE;

// Pulses and ripples are decoration on top of the data; when the OS asks for
// reduced motion the map keeps every fact and drops the travel animation.
const reducedMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Same algorithm as themeStore's hash, so a territory plate lands on exactly
 *  the hue its member nodes drew from the theme band. */
function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Soft-glow sprites, cached per colour.
 *
 * A per-node radial gradient is the single most expensive thing a 2D canvas can
 * do in a loop; a cached sprite blitted with drawImage is nearly free. Hue and
 * lightness are quantised by the callers, which keeps the cache to a few dozen
 * entries per theme instead of one per node.
 */
const glowSprites = new Map<string, HTMLCanvasElement>();
const SPRITE = 64;

function glowSprite(h: number, s: number, l: number): HTMLCanvasElement {
  const key = `${h}|${s}|${l}`;
  let sprite = glowSprites.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = SPRITE;
    sprite.height = SPRITE;
    const g = sprite.getContext('2d')!;
    const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    grad.addColorStop(0, `hsla(${h},${s}%,${l}%,0.9)`);
    grad.addColorStop(0.35, `hsla(${h},${s}%,${l}%,0.35)`);
    grad.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    glowSprites.set(key, sprite);
  }
  return sprite;
}

/** Rounded rect that tolerates older canvas implementations. */
function chipPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export const CanvasNetworkRenderer: React.FC = React.memo(() => {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  // Pan/zoom/viewport live in the shared module `camera` so the layout can read
  // them to dock pinned nodes in fixed screen space.
  const viewportRef  = useRef(camera);
  const frameCount   = useRef(0);
  const lastFpsTime  = useRef(0);
  const fpsRef       = useRef(0);

  const { width, height } = useSizeStore();
  const { layoutNodes, layoutEdges, clusterMeta, tick } = useGraphLayout();

  // Active theme read per-frame via a ref so switching recolors instantly
  // with zero React re-renders in the render loop.
  const themeRef = useRef<Theme>(useThemeStore.getState().theme);
  const physicsRef = useRef(usePhysicsStore.getState());
  useEffect(() => {
    themeRef.current = useThemeStore.getState().theme;
    physicsRef.current = usePhysicsStore.getState();
    const unsubTheme = useThemeStore.subscribe(s => { themeRef.current = s.theme; });
    const unsubPhysics = usePhysicsStore.subscribe(s => { physicsRef.current = s; });
    return () => {
      unsubTheme();
      unsubPhysics();
    };
  }, []);

  // ── Canvas resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !width || !height) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    viewportRef.current.width  = width;
    viewportRef.current.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  // ── Render loop ─────────────────────────────────────────────────────────────
  const render = useCallback((now: number) => {
    // Advance physics first — one RAF drives everything
    tick(now);

    const canvas = canvasRef.current;
    const vp     = viewportRef.current;
    if (!canvas || !vp.width || !vp.height) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // FPS counter
    frameCount.current++;
    if (now - lastFpsTime.current >= 1000) {
      fpsRef.current     = frameCount.current;
      frameCount.current = 0;
      lastFpsTime.current = now;
    }

    const theme = themeRef.current;
    const wall = Date.now();

    // Clear to the theme background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, vp.width, vp.height);

    ctx.save();
    ctx.translate(-vp.x * vp.zoom, -vp.y * vp.zoom);
    ctx.scale(vp.zoom, vp.zoom);
    ctx.lineCap = 'round';

    const nodes = layoutNodes.current;
    const edges = layoutEdges.current;

    // World-space measurements: a hairline is one SCREEN pixel whatever the
    // zoom, and the visible world rect bounds everything the frame can touch.
    const px = 1 / vp.zoom;
    const wx0 = vp.x;
    const wy0 = vp.y;
    const wx1 = vp.x + vp.width / vp.zoom;
    const wy1 = vp.y + vp.height / vp.zoom;

    // ── Grid ────────────────────────────────────────────────────────────────
    // A faint world-anchored lattice. Its real job is kinetic: it makes pan and
    // zoom read as moving over a surface instead of the nodes sliding on glass.
    const GRID = 160;
    ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.05)`;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let gx = Math.floor(wx0 / GRID) * GRID; gx <= wx1; gx += GRID) {
      ctx.moveTo(gx, wy0);
      ctx.lineTo(gx, wy1);
    }
    for (let gy = Math.floor(wy0 / GRID) * GRID; gy <= wy1; gy += GRID) {
      ctx.moveTo(wx0, gy);
      ctx.lineTo(wx1, gy);
    }
    ctx.stroke();

    // ── Territory plates ────────────────────────────────────────────────────
    // Each subnet's home, drawn as ground truth under the traffic: a barely-there
    // wash in the subnet's own hue, a dashed survey line, and the subnet name.
    // Nodes wander out of their territory toward live conversations by design;
    // the plate is what tells the operator where they wandered FROM.
    const hueSpan = theme.nodeHueMax - theme.nodeHueMin;
    const plateFont = `${Math.round(10 * px * 100) / 100}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.setLineDash([5 * px, 7 * px]);
    clusterMeta.current.forEach((m, key) => {
      if (m.count < 3) return;
      if (m.x + m.r < wx0 || m.x - m.r > wx1 || m.y + m.r < wy0 || m.y - m.r > wy1) return;
      const hue = Math.round(theme.nodeHueMin + ((hashStr(key) % 1000) / 1000) * hueSpan);

      ctx.fillStyle = `hsla(${hue},${theme.nodeSat}%,55%,0.035)`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${hue},${theme.nodeSat}%,60%,0.14)`;
      ctx.lineWidth = px;
      ctx.stroke();

      ctx.font = plateFont;
      ctx.textAlign = 'center';
      ctx.fillStyle = `hsla(${hue},${Math.round(theme.nodeSat * 0.6)}%,72%,0.55)`;
      ctx.fillText(key, m.x, m.y - m.r - 8 * px);
    });
    ctx.setLineDash([]);

    const edgeDegree = new Map<string, number>();
    const connectedIds = new Set<string>();
    edges.forEach(edge => {
      if (edge.alpha <= 0) return;
      connectedIds.add(edge.sourceId);
      connectedIds.add(edge.targetId);
      edgeDegree.set(edge.sourceId, (edgeDegree.get(edge.sourceId) ?? 0) + 1);
      edgeDegree.set(edge.targetId, (edgeDegree.get(edge.targetId) ?? 0) + 1);
    });

    const { edgeWidthIntensity } = physicsRef.current;
    const edgeI = Math.max(0, Math.min(1, edgeWidthIntensity));

    // ── Draw edges ──────────────────────────────────────────────────────────
    // Budget for port labels shown at the zoomed-out overview (interesting
    // edges only) so scan ports read without diving all the way in.
    let portLabels = 0;
    const portLabelBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    // Throughput width only changes stroke thickness — not opacity — so quiet
    // links stay visible. Draw thin→thick so hot pipes sit on top.
    const drawEdges = edgeI > 0
      ? Array.from(edges).sort((a, b) => a.weight - b.weight)
      : Array.from(edges);
    drawEdges.forEach(edge => {
      const src = nodes.get(edge.sourceId);
      const tgt = nodes.get(edge.targetId);
      if (!src || !tgt || edge.alpha <= 0) return;

      const proto = edge.protocol?.toLowerCase() ?? '';
      const degree = Math.max(edgeDegree.get(edge.sourceId) ?? 1, edgeDegree.get(edge.targetId) ?? 1);
      const classicDegreeAlpha = Math.max(0.5, Math.min(1, Math.sqrt(24 / degree)));
      const classicWeightBoost = Math.max(0.75, Math.min(1.4, Math.sqrt(edge.weight)));
      // Classic edge alpha only (no experimental quiet-link fade).
      const edgeAlpha = Math.min(1, edge.alpha * classicDegreeAlpha * classicWeightBoost);
      const weightedWidth = edge.thickness ?? Math.max(1, Math.min(4, 1 + Math.log1p(edge.weight)));
      const lineWidth = proto === 'icmp' ? Math.max(1, weightedWidth * 0.7) : weightedWidth;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      // Heavy pipes get a wide, faint halo under the core stroke, so throughput
      // reads as brightness bleeding off the line — not just thickness.
      if (weightedWidth >= 2) {
        ctx.strokeStyle = edgeColor(proto, edgeAlpha * 0.16, theme);
        ctx.lineWidth = lineWidth * 3.2;
        ctx.stroke();
      }
      ctx.strokeStyle = edgeColor(proto, edgeAlpha, theme);
      ctx.lineWidth   = lineWidth;
      ctx.stroke();

      // Port/protocol label. Show ALL of them when zoomed in; at the overview,
      // show only interesting edges (high fan-out degree, or touching a pinned
      // node) up to a budget, so scans reveal their target ports without having
      // to zoom all the way in. dstPort is the store's latest, so a connection
      // that switches ports relabels automatically.
      const interestingEdge = degree >= 6 || src.pinned || tgt.pinned;
      const showPort = (edge.dstPort ?? 0) > 0 && (
        vp.zoom > 1.5 ||
        (interestingEdge && vp.zoom >= FIT_ZOOM * 0.9 && portLabels < 70)
      );
      if (showPort) {
        const label   = `${edge.protocol?.toUpperCase() ?? ''}:${edge.dstPort}`;
        const fontSize = 11 / vp.zoom;                 // constant screen px
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        // Overview labels cull overlaps so the watch zone stays legible.
        if (vp.zoom <= 1.5) {
          const tw = ctx.measureText(label).width;
          const box = { x1: mx - tw / 2, y1: my - fontSize, x2: mx + tw / 2, y2: my + fontSize };
          const clash = portLabelBoxes.some(b => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
          if (!clash) {
            portLabelBoxes.push(box);
            ctx.fillStyle = edgeColor(edge.protocol, Math.min(1, edge.alpha + 0.4), theme);
            ctx.fillText(label, mx, my);
            portLabels++;
          }
        } else {
          ctx.fillStyle = edgeColor(edge.protocol, edge.alpha, theme);
          ctx.fillText(label, mx, my);
        }
      }
    });

    // ── Packet pulses ───────────────────────────────────────────────────────
    // A bright mote travels each live flow from source to destination, its pace
    // set by flow weight. This is what makes the map read as traffic moving
    // rather than as a diagram of where traffic once was. drawEdges is sorted
    // quiet→hot when width intensity is on, so slicing from the end budgets the
    // effect to the heaviest flows at firehose edge counts.
    if (!reducedMotion) {
      const PULSE_EDGE_CAP = 320;
      const pulseEdges = drawEdges.length > PULSE_EDGE_CAP ? drawEdges.slice(-PULSE_EDGE_CAP) : drawEdges;
      for (const edge of pulseEdges) {
        if (edge.alpha <= 0.25) continue;
        const src = nodes.get(edge.sourceId);
        const tgt = nodes.get(edge.targetId);
        if (!src || !tgt) continue;

        const seed = hashStr(edge.id);
        // Heavier flows pulse faster and carry more motes.
        const period = Math.max(650, 1600 - edge.weight * 90);
        const motes = 1 + Math.min(2, Math.floor(edge.weight / 4));
        const r = Math.max(1.6, (edge.thickness ?? 1.5) * 0.9);
        ctx.fillStyle = edgeColor(edge.protocol, Math.min(1, edge.alpha + 0.3), theme);
        for (let k = 0; k < motes; k += 1) {
          const t = ((now / period) + (seed % 997) / 997 + k / motes) % 1;
          const mx = src.x + (tgt.x - src.x) * t;
          const my = src.y + (tgt.y - src.y) * t;
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── Draw nodes ──────────────────────────────────────────────────────────
    // Labels are readable even at the zoomed-out fit level: font is sized in
    // constant SCREEN pixels (world font = screenPx / zoom), and overlapping
    // labels are always culled so overview stays clean — only the labels that
    // fit without colliding get drawn, more appearing as you zoom in.
    const labelZoomThreshold = FIT_ZOOM * 0.85; // visible at the default fit zoom
    const labelScreenPx = nodes.size > 500 ? 9 : 11;
    const labelBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    // When a focus burst exists, dim the bulk so the central scan/fan-out star
    // stands out as the thing to watch.
    let anyFocus = false;
    nodes.forEach(n => { if (n.focus) anyFocus = true; });

    const drawNodes = Array.from(nodes.values()).filter(n => n.alpha > 0);

    // Label chips sit on a wash of the theme background so text stays legible
    // over grid, plates and edges without resorting to an opaque black box.
    const bgR = parseInt(theme.background.slice(1, 3), 16) || 0;
    const bgG = parseInt(theme.background.slice(3, 5), 16) || 0;
    const bgB = parseInt(theme.background.slice(5, 7), 16) || 0;
    const chipFill = `rgba(${bgR},${bgG},${bgB},0.72)`;

    for (const node of drawNodes) {
      const hr = parseInt(node.highlightColor.slice(1, 3), 16);
      const hg = parseInt(node.highlightColor.slice(3, 5), 16);
      const hb = parseInt(node.highlightColor.slice(5, 7), 16);
      // Pinned + focus nodes always render fully-present (and labelled); bulk is
      // dimmed while a focus burst is active so the middle is the watch zone.
      const isFocus = node.focus;
      const isConnected = connectedIds.has(node.id) || node.pinned || isFocus;
      const dimBulk = anyFocus && !isFocus && !node.pinned;

      const visualAlpha = isFocus ? 1
        : isConnected ? node.alpha * (dimBulk ? 0.34 : 1)
        : node.alpha * (anyFocus ? 0.1 : 0.35);
      const talkBright = isConnected ? 1 : 0.35;
      const bodyColor = subnetNodeColor(node.clusterKey, isFocus ? 1 : talkBright, theme);

      // The glow sprite is keyed on quantised hue/lightness so the whole field
      // shares a few dozen cached gradients instead of paying for one per node.
      const hue = Math.round(theme.nodeHueMin + ((hashStr(node.clusterKey) % 1000) / 1000) * hueSpan);
      const brightQ = Math.round((isFocus ? 1 : talkBright) * 4) / 4;
      const lightQ = Math.round(theme.nodeLightMin + (theme.nodeLightMax - theme.nodeLightMin) * brightQ);

      const bodyR = isFocus ? node.radius * 1.5 : isConnected ? node.radius : node.radius * 0.7;

      const showGlow = isFocus || (isConnected && !dimBulk);
      if (showGlow) {
        const R = bodyR * (isFocus ? 3.4 : 2.3);
        ctx.globalAlpha = (isFocus ? 0.85 : 0.45) * visualAlpha;
        ctx.drawImage(glowSprite(hue, theme.nodeSat, lightQ), node.x - R, node.y - R, R * 2, R * 2);
      }

      // Body with a lighter core: reads as a lit orb rather than a flat disc.
      ctx.globalAlpha = visualAlpha;
      ctx.fillStyle   = bodyColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, bodyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${hue},${theme.nodeSat}%,${Math.min(92, lightQ + 24)}%,0.5)`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, bodyR * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Hosts that carried a packet in the last couple of seconds emit a slow
      // expanding ripple — recency made visible at a glance, phase-offset per
      // host so the field shimmers instead of strobing in unison.
      if (!reducedMotion && isConnected && !dimBulk && wall - node.lastActive < 2500) {
        const phase = ((wall + (hashStr(node.id) % 1400)) % 1400) / 1400;
        ctx.globalAlpha = (1 - phase) * 0.35 * visualAlpha;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.arc(node.x, node.y, bodyR + phase * bodyR * 2.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Pinned hosts wear a dashed accent ring: the one persistent, operator-made
      // mark on the map deserves the theme's own colour.
      if (node.pinned) {
        ctx.strokeStyle = `rgba(${theme.primaryRgb}, ${0.85 * node.alpha})`;
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([3 * px, 3 * px]);
        ctx.beginPath();
        ctx.arc(node.x, node.y, bodyR + 4 * px, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (
        (isFocus || labelBoxes.length < 140) &&
        isConnected &&
        node.id.includes('.') &&
        vp.zoom >= labelZoomThreshold
      ) {
        const fontSize = labelScreenPx / vp.zoom; // constant screen px
        ctx.font      = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        const pad = 3 / vp.zoom;
        const textY = node.y + node.radius + fontSize + pad;
        const tw    = ctx.measureText(node.id).width;
        const labelBox = {
          x1: node.x - tw / 2 - pad,
          y1: textY - fontSize - pad,
          x2: node.x + tw / 2 + pad,
          y2: textY + pad,
        };
        const overlapsLabel = labelBoxes.some(box =>
          labelBox.x1 < box.x2 &&
          labelBox.x2 > box.x1 &&
          labelBox.y1 < box.y2 &&
          labelBox.y2 > box.y1
        );
        if (overlapsLabel) continue; // always cull overlaps → clean at every zoom
        labelBoxes.push(labelBox);
        ctx.fillStyle = chipFill;
        chipPath(ctx, labelBox.x1, labelBox.y1, tw + pad * 2, fontSize + pad * 2, 3 * px);
        ctx.fill();
        ctx.fillStyle = `rgba(${hr},${hg},${hb},${node.alpha})`;
        ctx.fillText(node.id, node.x, textY);
      }
    }

    ctx.textAlign = 'left';
    ctx.restore();

    // The empty state lives in the DOM (see CanvasStage), where it can use the
    // real type scale and say why the map is blank rather than just that it is.

    animationRef.current = requestAnimationFrame(render);
  }, [tick, layoutNodes, layoutEdges, clusterMeta]);

  // Start/stop render loop
  useEffect(() => {
    if (canvasRef.current) animationRef.current = requestAnimationFrame(render);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [render]);

  // ── Pan / zoom / keyboard ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
    let hitId: string | null = null;
    // Last node confirmed under the cursor by a mousemove (identity, not
    // position). Nodes drift fast under the physics layout — 20-40px within
    // 100-300ms is typical, far more than any fixed click radius could absorb
    // without also snagging neighbours. So a click targets whichever node the
    // cursor most recently hovered, however far it's since wandered, rather
    // than re-testing distance at the moment of the click.
    let hoverId: string | null = null;
    const CLICK_DRAG_THRESHOLD = 4; // px of movement before a click becomes a pan

    const setCursor = (cursor: string) => {
      if (canvas.style.cursor !== cursor) {
        canvas.style.cursor = cursor;
      }
    };

    // Screen (client) coords → nearest node under the cursor, or null.
    // Optimized with squared distance comparison and direct iterator to avoid
    // Math.hypot / square root overhead in the mousemove hot path.
    const hitTestNode = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const vp = viewportRef.current;
      let bestId: string | null = null;
      let bestDistSq = Infinity;
      for (const node of layoutNodes.current.values()) {
        if (node.alpha <= 0) continue;
        const nx = (node.x - vp.x) * vp.zoom;
        const ny = (node.y - vp.y) * vp.zoom;
        const hitR = Math.max(node.radius * vp.zoom, 9);
        const dx = sx - nx;
        const dy = sy - ny;
        const dSq = dx * dx + dy * dy;
        if (dSq <= hitR * hitR && dSq < bestDistSq) {
          bestId = node.id;
          bestDistSq = dSq;
        }
      }
      return bestId;
    };

    const onDown  = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left-click triggers pinning and drag selection
      dragging = true; moved = false;
      lastX = e.clientX; lastY = e.clientY;
      downX = e.clientX; downY = e.clientY;
      // Prefer a fresh hit (covers a click with no preceding hover event);
      // fall back to the last hovered node so a drifted target still counts.
      hitId = hitTestNode(e.clientX, e.clientY) ?? hoverId;
      setCursor('grabbing');
    };
    const onMove  = (e: MouseEvent) => {
      if (!dragging) {
        hoverId = hitTestNode(e.clientX, e.clientY);
        setCursor(hoverId ? 'pointer' : 'grab');
        return;
      }
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!moved && dx * dx + dy * dy > CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) moved = true;
      viewportRef.current.x -= (e.clientX - lastX) / viewportRef.current.zoom;
      viewportRef.current.y -= (e.clientY - lastY) / viewportRef.current.zoom;
      lastX = e.clientX; lastY = e.clientY;
    };
    const onUp    = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = false;
      // A plain click (no drag) landing on a node toggles its pin — the fast
      // path for pinning instead of typing /pin <ip> in the command bar.
      if (!moved && hitId) {
        const { isPined, addPinningRule, removePinningRule } = usePinStore.getState();
        if (isPined(hitId)) removePinningRule(hitId); else addPinningRule(hitId);
      }
      hitId = null;
      hoverId = hitTestNode(e.clientX, e.clientY);
      setCursor(hoverId ? 'pointer' : 'grab');
    };
    const onLeave = () => { dragging = false; hitId = null; hoverId = null; setCursor('grab'); };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newZoom = Math.max(0.1, Math.min(5, viewportRef.current.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      const rect    = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const wx = mx / viewportRef.current.zoom + viewportRef.current.x;
      const wy = my / viewportRef.current.zoom + viewportRef.current.y;
      viewportRef.current.zoom = newZoom;
      viewportRef.current.x    = wx - mx / newZoom;
      viewportRef.current.y    = wy - my / newZoom;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') { viewportRef.current.x = 0; viewportRef.current.y = 0; viewportRef.current.zoom = FIT_ZOOM; }
    };

    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel',      onWheel, { passive: false });
    document.addEventListener('keydown',  onKey);
    canvas.style.cursor = 'grab';
    canvas.tabIndex = 0;

    return () => {
      canvas.removeEventListener('mousedown',  onDown);
      canvas.removeEventListener('mousemove',  onMove);
      canvas.removeEventListener('mouseup',    onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel',      onWheel);
      document.removeEventListener('keydown',  onKey);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // The clear pass already paints the theme background; letting the element
      // stay transparent keeps a single source of truth for the map's ground.
      style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
    />
  );
});

CanvasNetworkRenderer.displayName = 'CanvasNetworkRenderer';
