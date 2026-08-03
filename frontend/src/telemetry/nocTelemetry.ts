import { create } from 'zustand';
import { usePacketStore, Packet } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';

/**
 * Live telemetry for the NOC console.
 *
 * The renderers already consume the packet stream frame by frame; the console
 * needs the same stream expressed as numbers an operator can read at a glance.
 * Doing that in React would mean re-rendering the whole dock on every batch, so
 * ingest is deliberately kept outside React: a module-level engine subscribes to
 * the packet store, folds each new packet into plain accumulators, and publishes
 * one immutable snapshot per second. Panels subscribe to the snapshot, so the
 * dock repaints at 1 Hz no matter how hard the capture is running.
 *
 * Every number here is derived from packets that actually arrived. Nothing is
 * simulated or smoothed into looking healthier than it is, because a NOC panel
 * that flatters the data is worse than no panel.
 */

/** Two minutes of history at 1 Hz — enough for a sparkline to show a spike and its decay. */
const WINDOW_SAMPLES = 120;
const SAMPLE_MS = 1000;

/** Talker and protocol weights decay so a burst fades instead of pinning the table forever. */
const DECAY_PER_SAMPLE = 0.82;

const HALF_WINDOW_SAMPLES = WINDOW_SAMPLES / 2;

const MAX_TALKERS = 8;
const MAX_SERVICES = 6;
const MAX_LOG_LINES = 200;
const MAX_ALERTS = 40;

/** Detection thresholds, stated once so the alert text and the test agree. */
const PORT_SCAN_PORTS = 25;
const HOST_SWEEP_HOSTS = 40;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Talker {
  host: string;
  bytes: number;
  packets: number;
  /** Share of the window's traffic, 0-100. */
  pct: number;
}

export interface ProtocolSlice {
  protocol: string;
  packets: number;
  bytes: number;
  pct: number;
}

export interface ServiceSlice {
  port: number;
  name: string;
  packets: number;
  pct: number;
}

export interface Alert {
  id: string;
  level: Severity;
  /** Fixed vocabulary. Adding a new event type means adding it here, not inventing prose. */
  event: string;
  src: string;
  detail: string;
  hits: number;
  firstSeen: number;
  lastSeen: number;
  acknowledged: boolean;
}

export interface LogLine {
  id: number;
  time: string;
  tag: string;
  text: string;
  tone: 'critical' | 'warn' | 'ok' | 'info' | 'rf' | 'debug';
}

export interface TelemetrySnapshot {
  /** Wall-clock of the most recent sample. */
  sampledAt: number;
  /** Seconds since a packet last arrived. Drives every panel's freshness flag. */
  secondsSincePacket: number;
  live: boolean;

  packetsPerSecond: number;
  bytesPerSecond: number;
  totalPackets: number;
  totalBytes: number;

  peakPps: number;

  ppsSeries: number[];
  bpsSeries: number[];
  hostSeries: number[];
  flowSeries: number[];

  hosts: number;
  flows: number;

  protocols: ProtocolSlice[];
  talkers: Talker[];
  services: ServiceSlice[];
  alerts: Alert[];
  log: LogLine[];

  /** Distinct destination ports touched in the current window, per source. */
  scanSuspects: number;
}

const EMPTY: TelemetrySnapshot = {
  sampledAt: 0,
  secondsSincePacket: Infinity,
  live: false,
  packetsPerSecond: 0,
  bytesPerSecond: 0,
  totalPackets: 0,
  totalBytes: 0,
  peakPps: 0,
  ppsSeries: [],
  bpsSeries: [],
  hostSeries: [],
  flowSeries: [],
  hosts: 0,
  flows: 0,
  protocols: [],
  talkers: [],
  services: [],
  alerts: [],
  log: [],
  scanSuspects: 0,
};

/* -------------------------------------------------------------------------- */
/* Well-known services                                                         */
/* -------------------------------------------------------------------------- */

const SERVICES: Record<number, string> = {
  20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns',
  67: 'dhcp', 68: 'dhcp', 69: 'tftp', 80: 'http', 110: 'pop3', 123: 'ntp',
  137: 'netbios', 138: 'netbios', 139: 'netbios', 143: 'imap', 161: 'snmp',
  389: 'ldap', 443: 'https', 445: 'smb', 465: 'smtps', 514: 'syslog',
  587: 'submission', 636: 'ldaps', 993: 'imaps', 995: 'pop3s',
  1433: 'mssql', 1900: 'ssdp', 3306: 'mysql', 3389: 'rdp', 5060: 'sip',
  5353: 'mdns', 5432: 'postgres', 5900: 'vnc', 6379: 'redis',
  8080: 'http-alt', 8443: 'https-alt', 9200: 'elastic', 27017: 'mongodb',
};

/** Ports that should never see traffic on a conference guest network without a look. */
const SENSITIVE_PORTS: Record<number, Severity> = {
  22: 'medium', 23: 'high', 445: 'high', 3389: 'high', 1433: 'medium',
  3306: 'medium', 5432: 'medium', 5900: 'high', 6379: 'high', 27017: 'medium',
};

const serviceName = (port: number) => SERVICES[port] || `port ${port}`;

/* -------------------------------------------------------------------------- */
/* Formatting helpers, exported so panels never invent their own units         */
/* -------------------------------------------------------------------------- */

export function formatCount(n: number): string {
  if (!isFinite(n)) return '—';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatBitrate(bytesPerSecond: number): string {
  const bits = bytesPerSecond * 8;
  if (bits < 1000) return `${Math.round(bits)} bps`;
  if (bits < 1_000_000) return `${(bits / 1000).toFixed(1)} kbps`;
  if (bits < 1_000_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`;
  return `${(bits / 1_000_000_000).toFixed(2)} Gbps`;
}

/** Absolute first, relative second — the NOC timestamp contract. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

export function formatRelative(seconds: number): string {
  if (!isFinite(seconds)) return 'never';
  if (seconds < 2) return 'live';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

interface TelemetryState {
  snapshot: TelemetrySnapshot;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => void;
  reset: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  snapshot: EMPTY,
  acknowledge: (id) =>
    set((s) => {
      acknowledged.add(id);
      return { snapshot: { ...s.snapshot, alerts: s.snapshot.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) } };
    }),
  acknowledgeAll: () =>
    set((s) => {
      s.snapshot.alerts.forEach((a) => acknowledged.add(a.id));
      return { snapshot: { ...s.snapshot, alerts: s.snapshot.alerts.map((a) => ({ ...a, acknowledged: true })) } };
    }),
  reset: () => {
    resetAccumulators();
    set({ snapshot: EMPTY });
  },
}));

/* -------------------------------------------------------------------------- */
/* Engine                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Byte and packet weights decay smoothly, but "how many distinct ports has this
 * host touched" cannot decay — a set only grows. Left alone, any host that stays
 * on the wire long enough eventually looks like a port scan. So the distinct
 * counts run on two buckets: the current half-window and the one before it. The
 * pair is rotated every half-window, which keeps the effective look-back between
 * one and two minutes and lets old behaviour actually fall out.
 */
interface HostAccumulator {
  bytes: number;
  packets: number;
  dstPorts: Set<number>;
  dstHosts: Set<string>;
  prevPorts: Set<number>;
  prevHosts: Set<string>;
}

/** Size of a ∪ b without building the union. */
function unionSize<T>(a: Set<T>, b: Set<T>): number {
  if (!b.size) return a.size;
  let n = a.size;
  for (const v of b) if (!a.has(v)) n += 1;
  return n;
}

let lastSeq = 0;
let lastPacketAt = 0;
let totalPackets = 0;
let totalBytes = 0;
let peakPps = 0;
let logSeq = 0;
let sampleTick = 0;

/** Counters reset every sample. */
let intervalPackets = 0;
let intervalBytes = 0;

/** Decayed weights carried across samples. */
let protoPackets = new Map<string, number>();
let protoBytes = new Map<string, number>();
let hostStats = new Map<string, HostAccumulator>();
let servicePackets = new Map<number, number>();

let ppsSeries: number[] = [];
let bpsSeries: number[] = [];
let hostSeries: number[] = [];
let flowSeries: number[] = [];

let alerts: Alert[] = [];
const acknowledged = new Set<string>();
let log: LogLine[] = [];

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function resetAccumulators() {
  lastSeq = 0;
  lastPacketAt = 0;
  totalPackets = 0;
  totalBytes = 0;
  peakPps = 0;
  sampleTick = 0;
  intervalPackets = 0;
  intervalBytes = 0;
  protoPackets = new Map();
  protoBytes = new Map();
  hostStats = new Map();
  servicePackets = new Map();
  ppsSeries = [];
  bpsSeries = [];
  hostSeries = [];
  flowSeries = [];
  alerts = [];
  acknowledged.clear();
  log = [];
}

function hostFor(id: string): HostAccumulator {
  let h = hostStats.get(id);
  if (!h) {
    h = { bytes: 0, packets: 0, dstPorts: new Set(), dstHosts: new Set(), prevPorts: new Set(), prevHosts: new Set() };
    hostStats.set(id, h);
  }
  return h;
}

function bump<K>(map: Map<K, number>, key: K, by: number) {
  map.set(key, (map.get(key) || 0) + by);
}

function ingest(packets: Packet[]) {
  if (!packets.length) return;

  // clearPackets() restarts the store's sequence counter at zero. Without this
  // the watermark stays above every future packet and the engine goes deaf for
  // the rest of the session.
  const newest = packets[packets.length - 1].seq ?? 0;
  if (newest < lastSeq) lastSeq = 0;

  // The packet store fires every 50ms and holds up to a thousand packets, so
  // scanning the buffer forwards would re-walk mostly-seen history twenty times
  // a second. Sequence numbers are monotonic and the buffer is append-ordered,
  // so walking back from the end to the first already-seen packet touches only
  // what actually arrived.
  let start = packets.length;
  while (start > 0 && (packets[start - 1].seq ?? 0) > lastSeq) start -= 1;

  for (let i = start; i < packets.length; i += 1) {
    const p = packets[i];
    lastSeq = p.seq ?? lastSeq;

    const size = p.size || 0;
    intervalPackets += 1;
    intervalBytes += size;
    totalPackets += 1;
    totalBytes += size;
    lastPacketAt = Date.now();

    const proto = (p.protocol || 'other').toLowerCase();
    bump(protoPackets, proto, 1);
    bump(protoBytes, proto, size);

    if (p.src) {
      const h = hostFor(p.src);
      h.bytes += size;
      h.packets += 1;
      if (p.dst) h.dstHosts.add(p.dst);
      if (p.dst_port) h.dstPorts.add(p.dst_port);
    }
    if (p.dst) {
      const h = hostFor(p.dst);
      h.bytes += size;
      h.packets += 1;
    }

    if (p.dst_port) bump(servicePackets, p.dst_port, 1);
  }
}

function decay() {
  const scale = (map: Map<any, number>) => {
    for (const [k, v] of map) {
      const next = v * DECAY_PER_SAMPLE;
      if (next < 0.5) map.delete(k);
      else map.set(k, next);
    }
  };
  scale(protoPackets);
  scale(protoBytes);
  scale(servicePackets);

  sampleTick += 1;
  const rotate = sampleTick % HALF_WINDOW_SAMPLES === 0;

  for (const [id, h] of hostStats) {
    h.bytes *= DECAY_PER_SAMPLE;
    h.packets *= DECAY_PER_SAMPLE;
    if (h.packets < 0.5) {
      hostStats.delete(id);
      continue;
    }
    if (rotate) {
      h.prevPorts = h.dstPorts;
      h.prevHosts = h.dstHosts;
      h.dstPorts = new Set();
      h.dstHosts = new Set();
    }
  }
}

function push(series: number[], value: number): number[] {
  const next = series.length >= WINDOW_SAMPLES ? series.slice(1) : series.slice();
  next.push(value);
  return next;
}

function raise(id: string, level: Severity, event: string, src: string, detail: string, now: number) {
  const existing = alerts.find((a) => a.id === id);
  if (existing) {
    existing.hits += 1;
    existing.lastSeen = now;
    existing.detail = detail;
    return;
  }
  alerts = [
    { id, level, event, src, detail, hits: 1, firstSeen: now, lastSeen: now, acknowledged: acknowledged.has(id) },
    ...alerts,
  ].slice(0, MAX_ALERTS);

  appendLog(level === 'critical' || level === 'high' ? 'critical' : 'warn', level.toUpperCase(), `${event} · ${src} · ${detail}`, now);
}

function appendLog(tone: LogLine['tone'], tag: string, text: string, now: number) {
  log = [...log, { id: ++logSeq, time: formatClock(now), tag, text, tone }].slice(-MAX_LOG_LINES);
}

/**
 * Detection heuristics.
 *
 * These are intentionally simple and stated in the alert text, because an
 * operator has to be able to tell in one line why the console flagged something
 * and decide whether it is a finding or a noisy laptop.
 */
function detect(now: number, pps: number) {
  let scanSuspects = 0;

  for (const [host, h] of hostStats) {
    // Cheap upper bound first: the union can never exceed the sum, so most hosts
    // never pay for the set walk.
    if (h.dstPorts.size + h.prevPorts.size >= PORT_SCAN_PORTS) {
      const ports = unionSize(h.dstPorts, h.prevPorts);
      if (ports >= PORT_SCAN_PORTS) {
        scanSuspects += 1;
        raise(
          `portscan:${host}`,
          ports >= PORT_SCAN_PORTS * 4 ? 'critical' : 'high',
          'Port scan',
          host,
          `${ports} distinct ports in the last 2 min`,
          now,
        );
      }
    }

    if (h.dstHosts.size + h.prevHosts.size >= HOST_SWEEP_HOSTS) {
      const dests = unionSize(h.dstHosts, h.prevHosts);
      if (dests >= HOST_SWEEP_HOSTS) {
        scanSuspects += 1;
        raise(
          `sweep:${host}`,
          dests >= HOST_SWEEP_HOSTS * 4 ? 'critical' : 'high',
          'Host sweep',
          host,
          `${dests} distinct destinations in the last 2 min`,
          now,
        );
      }
    }
  }

  const icmp = protoPackets.get('icmp') || 0;
  const allProto = Array.from(protoPackets.values()).reduce((a, b) => a + b, 0) || 1;
  if (pps > 40 && icmp / allProto > 0.4) {
    raise('icmp-flood', 'high', 'ICMP flood', 'multiple sources', `${Math.round((icmp / allProto) * 100)}% of the window is ICMP`, now);
  }

  for (const [port, count] of servicePackets) {
    const level = SENSITIVE_PORTS[port];
    if (level && count >= 20) {
      raise(`sensitive:${port}`, level, 'Sensitive service', serviceName(port), `${Math.round(count)} packets to ${serviceName(port)}`, now);
    }
  }

  return scanSuspects;
}

function sample() {
  const now = Date.now();
  const pps = intervalPackets * (1000 / SAMPLE_MS);
  const bps = intervalBytes * (1000 / SAMPLE_MS);
  intervalPackets = 0;
  intervalBytes = 0;

  peakPps = Math.max(peakPps, pps);

  const { nodes, connections } = useNetworkStore.getState();

  ppsSeries = push(ppsSeries, pps);
  bpsSeries = push(bpsSeries, bps);
  hostSeries = push(hostSeries, nodes.length);
  flowSeries = push(flowSeries, connections.length);

  const scanSuspects = detect(now, pps);

  const totalProtoPackets = Array.from(protoPackets.values()).reduce((a, b) => a + b, 0) || 1;
  const protocols: ProtocolSlice[] = Array.from(protoPackets.entries())
    .map(([protocol, packets]) => ({
      protocol,
      packets: Math.round(packets),
      bytes: Math.round(protoBytes.get(protocol) || 0),
      pct: (packets / totalProtoPackets) * 100,
    }))
    .sort((a, b) => b.packets - a.packets);

  const talkerEntries = Array.from(hostStats.entries()).sort((a, b) => b[1].bytes - a[1].bytes);
  const topBytes = talkerEntries[0]?.[1].bytes || 1;
  const talkers: Talker[] = talkerEntries.slice(0, MAX_TALKERS).map(([host, h]) => ({
    host,
    bytes: Math.round(h.bytes),
    packets: Math.round(h.packets),
    pct: Math.max(2, (h.bytes / topBytes) * 100),
  }));

  const totalServicePackets = Array.from(servicePackets.values()).reduce((a, b) => a + b, 0) || 1;
  const services: ServiceSlice[] = Array.from(servicePackets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SERVICES)
    .map(([port, packets]) => ({ port, name: serviceName(port), packets: Math.round(packets), pct: (packets / totalServicePackets) * 100 }));

  const secondsSincePacket = lastPacketAt ? (now - lastPacketAt) / 1000 : Infinity;

  // Heartbeat line, once every ten samples, so an idle console still shows it
  // is watching rather than looking frozen.
  if (ppsSeries.length % 10 === 0 && pps > 0) {
    appendLog('debug', 'STAT', `${Math.round(pps)} pps · ${formatBitrate(bps)} · ${nodes.length} hosts · ${connections.length} flows`, now);
  }

  decay();

  useTelemetryStore.setState({
    snapshot: {
      sampledAt: now,
      secondsSincePacket,
      live: secondsSincePacket < 3,
      packetsPerSecond: pps,
      bytesPerSecond: bps,
      totalPackets,
      totalBytes,
      peakPps,
      ppsSeries,
      bpsSeries,
      hostSeries,
      flowSeries,
      hosts: nodes.length,
      flows: connections.length,
      protocols,
      talkers,
      services,
      alerts: alerts.map((a) => ({ ...a, acknowledged: acknowledged.has(a.id) })),
      log,
      scanSuspects,
    },
  });
}

/** Idempotent: React StrictMode mounts effects twice in development. */
export function startTelemetry(): () => void {
  if (unsubscribe && timer) return stopTelemetry;

  ingest(usePacketStore.getState().packets);
  unsubscribe = usePacketStore.subscribe((state) => ingest(state.packets));
  timer = setInterval(sample, SAMPLE_MS);

  return stopTelemetry;
}

export function stopTelemetry() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearInterval(timer);
  timer = null;
}

/** Panels read the snapshot through this so they all repaint on the same tick. */
export const useTelemetry = () => useTelemetryStore((s) => s.snapshot);
