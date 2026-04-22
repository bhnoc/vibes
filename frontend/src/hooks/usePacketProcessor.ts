import { useEffect, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore, Node } from '../stores/networkStore';
import { logger } from '../utils/logger';

// Generate a stable spawn position from an IP address.
// Uses IP structure to cluster addresses by subnet — 192.168.x in one region,
// 10.x in another, etc. Physics will refine positions after spawn.
const generatePosition = (ip: string): { x: number, y: number } => {
  const parts = ip.split('.');

  if (parts.length === 4) {
    const [a, b, c, d] = parts.map(Number);

    let regionX = 600;
    let regionY = 400;

    if (a === 192 && b === 168) {
      regionX = 200; regionY = 150;
    } else if (a === 10) {
      regionX = 500; regionY = 300;
    } else if (a === 172) {
      regionX = 800; regionY = 200;
    } else if (a === 8 || a === 1) {
      regionX = 350; regionY = 450;
    } else {
      regionX = 100 + (a % 20) * 50;
      regionY = 400 + (a % 10) * 40;
    }

    const x = regionX + (c * 2) + (d % 50) - 25;
    const y = regionY + (d * 1.5) + (c % 40) - 20;
    return { x: Math.max(50, Math.min(1400, x)), y: Math.max(50, Math.min(800, y)) };
  }

  // Non-IP: hash-based position
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash = hash & hash;
  }
  return {
    x: 200 + (Math.abs(hash) % 800),
    y: 150 + (Math.abs(hash >> 8) % 500),
  };
};

function getPacketColor(src: string, dst: string, protocol?: string): string {
  const id = `${src}-${dst}`;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  const r = Math.max(100, Math.abs(hash) % 256);
  const g = Math.max(100, Math.abs(hash >> 8) % 256);
  const b = Math.max(100, Math.abs(hash >> 16) % 256);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
  }
  h = Math.round(60 * h);
  if (h < 0) h += 360;
  const shift: Record<string, number> = { tcp: 30, udp: 60, icmp: 90, http: 120, https: 150 };
  h = (h + (shift[protocol?.toLowerCase() ?? ''] ?? 0)) % 360;
  return `hsl(${h}, 85%, 60%)`;
}

interface FlowEntry {
  src: string;
  dst: string;
  protocol?: string;
  srcPort?: number;
  dstPort?: number;
  lastActive: number;
  packetSource?: string;
}

// Flow-window aggregation: drain packets into a per-flow map, flush to store
// every FLUSH_INTERVAL ms. This decouples packet rate from store update rate,
// making the frontend safe at 10G/100G where individual packet processing would
// overwhelm the GC.
const FLUSH_INTERVAL = 50; // ms between store flushes
const MAX_NEW_FLOWS_PER_FLUSH = 200; // cap on new node/connection pairs per flush

export const usePacketProcessor = () => {
  const { packets } = usePacketStore();
  const lastProcessedSeqRef = useRef<number>(0);
  const flowBuffer = useRef<Map<string, FlowEntry>>(new Map());
  const lastAutocleanTimeRef = useRef<number>(Date.now());

  // Reset cursor when packet history is cleared
  useEffect(() => {
    if (packets.length === 0) {
      lastProcessedSeqRef.current = 0;
      flowBuffer.current.clear();
    }
  }, [packets.length]);

  // Stage 1: drain new packets into flowBuffer (cheap — no store writes)
  useEffect(() => {
    const newPackets = packets.filter(p => (p.seq ?? 0) > lastProcessedSeqRef.current);
    if (newPackets.length === 0) return;

    let maxSeq = lastProcessedSeqRef.current;
    const now = Date.now();

    newPackets.forEach(packet => {
      const seq = packet.seq ?? 0;
      if (seq > maxSeq) maxSeq = seq;
      if (!packet.src || !packet.dst) return;

      const key = `${packet.src}→${packet.dst}`;
      const existing = flowBuffer.current.get(key);
      if (existing) {
        existing.lastActive = now;
        if (packet.protocol) existing.protocol = packet.protocol;
      } else {
        flowBuffer.current.set(key, {
          src: packet.src,
          dst: packet.dst,
          protocol: packet.protocol,
          srcPort: packet.src_port,
          dstPort: packet.dst_port,
          lastActive: now,
          packetSource: packet.source,
        });
      }
    });

    lastProcessedSeqRef.current = maxSeq;
  }, [packets]);

  // Stage 2: flush flowBuffer to store every FLUSH_INTERVAL ms.
  // Uses addFlowBatch so every node lands in the same set() call as its connection —
  // eliminating the orphan-node window caused by throttled individual adds.
  useEffect(() => {
    const interval = setInterval(() => {
      if (flowBuffer.current.size === 0) return;

      const { nodes: currentNodes, addFlowBatch, limitNetworkSize } = useNetworkStore.getState();
      const existingIds = new Set(currentNodes.map(n => n.id));
      let newFlowCount = 0;
      const now = Date.now();

      const batch: Array<{ src: Node; dst: Node; conn: import('../stores/networkStore').Connection }> = [];

      flowBuffer.current.forEach((flow) => {
        const isNewSrc = !existingIds.has(flow.src);
        const isNewDst = !existingIds.has(flow.dst);

        if ((isNewSrc || isNewDst) && newFlowCount >= MAX_NEW_FLOWS_PER_FLUSH) return;

        const srcPos = generatePosition(flow.src);
        const dstPos = generatePosition(flow.dst);

        batch.push({
          src: {
            id: flow.src, label: flow.src,
            x: srcPos.x, y: srcPos.y,
            size: 10, lastActive: flow.lastActive,
            packetSource: flow.packetSource,
            ports: new Set(flow.srcPort ? [flow.srcPort] : []),
          } as Node,
          dst: {
            id: flow.dst, label: flow.dst,
            x: dstPos.x, y: dstPos.y,
            size: 10, lastActive: flow.lastActive,
            packetSource: flow.packetSource,
            ports: new Set(flow.dstPort ? [flow.dstPort] : []),
          } as Node,
          conn: {
            id: `${flow.src}-${flow.dst}`,
            source: flow.src,
            target: flow.dst,
            protocol: flow.protocol,
            lastActive: now,
            packetColor: getPacketColor(flow.src, flow.dst, flow.protocol),
            srcPort: flow.srcPort,
            dstPort: flow.dstPort,
          },
        });

        if (isNewSrc) existingIds.add(flow.src);
        if (isNewDst) existingIds.add(flow.dst);
        if (isNewSrc || isNewDst) newFlowCount++;
      });

      flowBuffer.current.clear();

      if (batch.length > 0) addFlowBatch(batch);

      if (Date.now() - lastAutocleanTimeRef.current > 15000) {
        limitNetworkSize(3000, 5000);
        lastAutocleanTimeRef.current = Date.now();
      }
    }, FLUSH_INTERVAL);

    return () => clearInterval(interval);
  }, []);
};
