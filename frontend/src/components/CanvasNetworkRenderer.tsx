import React, { useEffect, useRef, useCallback } from 'react';
import { useSizeStore } from '../stores/sizeStore';
import { useGraphLayout, WORLD_SCALE, camera } from '../hooks/useGraphLayout';
import { useThemeStore, subnetNodeColor, edgeColor, Theme } from '../stores/themeStore';
import { usePinStore } from '../stores/pinStore';
import { formatGeoLabel, getGeo, isExternalIPv4, requestGeo } from '../utils/geoLookup';

// Start zoomed out so the whole (larger-than-viewport) world fits, leaving real
// room to zoom in. zoom = 1/WORLD_SCALE with pan (0,0) maps world → viewport 1:1.
const FIT_ZOOM = 1 / WORLD_SCALE;

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
  const { layoutNodes, layoutEdges, tick } = useGraphLayout();

  // Active theme read per-frame via a ref so switching recolors instantly
  // with zero React re-renders in the render loop.
  const themeRef = useRef<Theme>(useThemeStore.getState().theme);
  useEffect(() => {
    themeRef.current = useThemeStore.getState().theme;
    return useThemeStore.subscribe(s => { themeRef.current = s.theme; });
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

    // Clear to the theme background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, vp.width, vp.height);

    ctx.save();
    ctx.translate(-vp.x * vp.zoom, -vp.y * vp.zoom);
    ctx.scale(vp.zoom, vp.zoom);

    const nodes = layoutNodes.current;
    const edges = layoutEdges.current;

    const edgeDegree = new Map<string, number>();
    const connectedIds = new Set<string>();
    edges.forEach(edge => {
      if (edge.alpha <= 0) return;
      connectedIds.add(edge.sourceId);
      connectedIds.add(edge.targetId);
      edgeDegree.set(edge.sourceId, (edgeDegree.get(edge.sourceId) ?? 0) + 1);
      edgeDegree.set(edge.targetId, (edgeDegree.get(edge.targetId) ?? 0) + 1);
    });

    // ── Draw edges (strokes only) ───────────────────────────────────────────
    // Port labels are a second pass so fat throughput strokes never cover them
    // (and later edges can't paint over earlier labels).
    type PortLabelJob = {
      label: string;
      mx: number;
      my: number;
      fontSize: number;
      fill: string;
      overview: boolean;
    };
    const portLabelJobs: PortLabelJob[] = [];
    edges.forEach(edge => {
      const src = nodes.get(edge.sourceId);
      const tgt = nodes.get(edge.targetId);
      if (!src || !tgt || edge.alpha <= 0) return;

      const proto = edge.protocol?.toLowerCase() ?? '';
      const degree = Math.max(edgeDegree.get(edge.sourceId) ?? 1, edgeDegree.get(edge.targetId) ?? 1);
      const degreeAlpha = Math.max(0.5, Math.min(1, Math.sqrt(24 / degree)));
      const weightBoost = Math.max(0.75, Math.min(1.4, Math.sqrt(edge.weight)));
      const edgeAlpha = Math.min(1, edge.alpha * degreeAlpha * weightBoost);
      // Thickness comes from layout (peer-relative throughput). Mild weight
      // boost keeps busy flows readable without fighting the sizing model.
      const baseWidth = edge.thickness ?? Math.max(1, Math.min(4, 1 + Math.log1p(edge.weight)));
      // Cap high enough for Experimental edge-width intensity (up to ~2× default span).
      const weightedWidth = Math.min(18, baseWidth * Math.max(0.85, Math.min(1.25, weightBoost)));
      const lineWidth = proto === 'icmp' ? Math.max(1, weightedWidth - 0.75) : weightedWidth;

      ctx.strokeStyle = edgeColor(proto, edgeAlpha, theme);
      ctx.lineWidth   = lineWidth;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();

      // Queue port/protocol labels for the overlay pass. Show ALL when zoomed
      // in; at overview, only interesting edges (high fan-out / pinned) up to
      // a budget. dstPort is the store's latest, so port switches relabel.
      const interestingEdge = degree >= 6 || src.pinned || tgt.pinned;
      if ((edge.dstPort ?? 0) > 0 && (
        vp.zoom > 1.5 ||
        (interestingEdge && vp.zoom >= FIT_ZOOM * 0.9)
      )) {
        portLabelJobs.push({
          label: `${edge.protocol?.toUpperCase() ?? ''}:${edge.dstPort}`,
          mx: (src.x + tgt.x) / 2,
          my: (src.y + tgt.y) / 2,
          fontSize: 11 / vp.zoom,
          fill: edgeColor(
            edge.protocol,
            vp.zoom <= 1.5 ? Math.min(1, edge.alpha + 0.4) : edge.alpha,
            theme,
          ),
          overview: vp.zoom <= 1.5,
        });
      }
    });

    // ── Port labels (always above edge strokes) ─────────────────────────────
    let portLabels = 0;
    const portLabelBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const job of portLabelJobs) {
      if (job.overview && portLabels >= 70) break;
      ctx.font = `${job.fontSize}px monospace`;
      if (job.overview) {
        const tw = ctx.measureText(job.label).width;
        const box = {
          x1: job.mx - tw / 2,
          y1: job.my - job.fontSize,
          x2: job.mx + tw / 2,
          y2: job.my + job.fontSize,
        };
        const clash = portLabelBoxes.some(b =>
          box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
        );
        if (clash) continue;
        portLabelBoxes.push(box);
        portLabels++;
      }
      // Dark halo so text stays legible on top of fat neon strokes.
      ctx.lineWidth = 3 / vp.zoom;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(job.label, job.mx, job.my);
      ctx.fillStyle = job.fill;
      ctx.fillText(job.label, job.mx, job.my);
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
    nodes.forEach(node => {
      if (node.alpha <= 0) return;

      const hr = parseInt(node.highlightColor.slice(1, 3), 16);
      const hg = parseInt(node.highlightColor.slice(3, 5), 16);
      const hb = parseInt(node.highlightColor.slice(5, 7), 16);
      // Pinned + focus nodes always render fully-present (and labelled); bulk is
      // dimmed while a focus burst is active so the middle is the watch zone.
      const isFocus = node.focus;
      const isConnected = connectedIds.has(node.id) || node.pinned || isFocus;
      // Hide quiet / non-IP ghosts: no live edge (and not pinned/focus) → no ball.
      // Node lifetime alone used to leave a field of unlabeled dots after flows died.
      if (!isConnected) return;
      if (!node.id.includes('.')) return;
      const dimBulk = anyFocus && !isFocus && !node.pinned;
      const visualAlpha = isFocus ? 1 : node.alpha * (dimBulk ? 0.34 : 1);

      // Node fill: per-subnet hue from the active theme, brighter when talking.
      // This is what makes subnet blobs read as coherent color groups.
      const bodyColor = subnetNodeColor(node.clusterKey, 1, theme);

      // Glow ring — always for focus nodes (stronger), plus active nodes.
      if (isFocus || (node.radius > 7 && isConnected && !dimBulk)) {
        ctx.fillStyle = `rgba(${hr},${hg},${hb},${(isFocus ? 0.45 : visualAlpha * 0.3)})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * (isFocus ? 2.2 : 1.5), 0, Math.PI * 2);
        ctx.fill();
      }

      // Node body (focus nodes drawn larger so the star pops)
      const bodyR = isFocus ? node.radius * 1.5 : node.radius;
      ctx.globalAlpha = visualAlpha;
      ctx.fillStyle   = bodyColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, bodyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label connected nodes (the active conversations). Font is constant on
      // screen regardless of zoom; overlapping labels are always dropped, so
      // the overview shows a clean sparse set and detail fills in on zoom-in.
      // Cap labels per frame: canvas fillText/measureText is costly, and at
      // wide spacing few labels overlap (so many would draw). Bound it.
      // External IPs also request a cached country/ASN lookup (8h TTL).
      if ((isFocus || labelBoxes.length < 140) && isConnected && node.id.includes('.') && vp.zoom >= labelZoomThreshold) {
        if (isExternalIPv4(node.id)) requestGeo(node.id);
        const geo = getGeo(node.id);
        const geoLine = geo ? formatGeoLabel(geo) : '';
        const fontSize = labelScreenPx / vp.zoom; // constant screen px
        const lineGap = fontSize * 1.15;
        ctx.font      = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        const pad = 3 / vp.zoom;
        const textY = node.y + node.radius + fontSize + pad;
        const tw = Math.max(
          ctx.measureText(node.id).width,
          geoLine ? ctx.measureText(geoLine).width : 0,
        );
        const blockH = fontSize + (geoLine ? lineGap : 0);
        const labelBox = {
          x1: node.x - tw / 2 - pad,
          y1: textY - fontSize - pad,
          x2: node.x + tw / 2 + pad,
          y2: textY - fontSize + blockH + pad,
        };
        const overlapsLabel = labelBoxes.some(box =>
          labelBox.x1 < box.x2 &&
          labelBox.x2 > box.x1 &&
          labelBox.y1 < box.y2 &&
          labelBox.y2 > box.y1
        );
        if (overlapsLabel) return; // always cull overlaps → clean at every zoom
        labelBoxes.push(labelBox);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(labelBox.x1, labelBox.y1, tw + pad * 2, blockH + pad * 2);
        ctx.fillStyle = `rgba(${hr},${hg},${hb},${node.alpha})`;
        ctx.fillText(node.id, node.x, textY);
        if (geoLine) {
          ctx.fillStyle = `rgba(${hr},${hg},${hb},${node.alpha * 0.85})`;
          ctx.fillText(geoLine, node.x, textY + lineGap);
        }
      }
    });

    ctx.textAlign = 'left';
    ctx.restore();

    // No-data overlay
    if (nodes.size === 0) {
      ctx.fillStyle = '#444';
      ctx.font      = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for network activity...', vp.width / 2, vp.height / 2);
      ctx.textAlign = 'left';
    }

    animationRef.current = requestAnimationFrame(render);
  }, [tick, layoutNodes, layoutEdges]);

  // Start/stop render loop
  useEffect(() => {
    if (canvasRef.current) animationRef.current = requestAnimationFrame(render);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [render]);

  // ── Pan / zoom / click-to-pin / keyboard ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
    let hitId: string | null = null;
    // Nodes drift under physics, so track the last hovered identity and prefer
    // that on click rather than re-hit-testing a moved ball.
    let hoverId: string | null = null;
    const CLICK_DRAG_THRESHOLD = 4; // px before a press counts as pan, not pin

    const setCursor = (cursor: string) => {
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    };

    const hitTestNode = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const vp = viewportRef.current;
      // Match renderer visibility: only pin what you can see.
      const liveIds = new Set<string>();
      for (const e of layoutEdges.current) {
        if (e.alpha <= 0) continue;
        liveIds.add(e.sourceId);
        liveIds.add(e.targetId);
      }
      let bestId: string | null = null;
      let bestDistSq = Infinity;
      for (const node of layoutNodes.current.values()) {
        if (node.alpha <= 0) continue;
        if (!node.pinned && !node.focus && !liveIds.has(node.id)) continue;
        if (!node.id.includes('.')) continue;
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

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left-click only for pin / pan
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      hitId = hitTestNode(e.clientX, e.clientY) ?? hoverId;
      setCursor('grabbing');
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) {
        hoverId = hitTestNode(e.clientX, e.clientY);
        setCursor(hoverId ? 'pointer' : 'grab');
        return;
      }
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!moved && dx * dx + dy * dy > CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
        moved = true;
      }
      viewportRef.current.x -= (e.clientX - lastX) / viewportRef.current.zoom;
      viewportRef.current.y -= (e.clientY - lastY) / viewportRef.current.zoom;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = false;
      // Plain click (no drag) on a node toggles pin.
      if (!moved && hitId) {
        const { isPined, addPinningRule, removePinningRule } = usePinStore.getState();
        if (isPined(hitId)) removePinningRule(hitId);
        else addPinningRule(hitId);
      }
      hitId = null;
      hoverId = hitTestNode(e.clientX, e.clientY);
      setCursor(hoverId ? 'pointer' : 'grab');
    };
    const onLeave = () => {
      dragging = false;
      hitId = null;
      hoverId = null;
      setCursor('grab');
    };
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
  }, [layoutNodes, layoutEdges]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', background: 'black' }}
    />
  );
});

CanvasNetworkRenderer.displayName = 'CanvasNetworkRenderer';
