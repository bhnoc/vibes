/**
 * Country + ASN lookup for public IPv4 addresses.
 * Backed by ip-api.com with an 8-hour localStorage cache.
 */

export type GeoInfo = {
  countryCode: string;
  country: string;
  asn: string;      // e.g. "AS15169"
  asName: string;   // e.g. "Google LLC"
  fetchedAt: number;
};

const CACHE_KEY = 'vibes-geoip-cache-v1';
const TTL_MS = 8 * 60 * 60 * 1000;
const BATCH_LIMIT = 15;
const FLUSH_MS = 2000;
const FAIL_COOLDOWN_MS = 30 * 60 * 1000; // don't hammer failed IPs

type CacheEntry =
  | { ok: true; info: GeoInfo }
  | { ok: false; fetchedAt: number };

const memory = new Map<string, CacheEntry>();
const pending = new Set<string>();
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

/** Subscribe to cache updates (e.g. trigger a label refresh). */
export function subscribeGeo(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function loadCache() {
  if (memory.size > 0) return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [ip, entry] of Object.entries(obj)) {
      if (!entry || typeof entry !== 'object') continue;
      const age = now - (entry.ok ? entry.info.fetchedAt : entry.fetchedAt);
      if (age >= 0 && age < TTL_MS) memory.set(ip, entry);
    }
  } catch {
    /* corrupt cache — start fresh */
  }
}

function persistCache() {
  try {
    const obj: Record<string, CacheEntry> = {};
    memory.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
}

/** RFC1918 / loopback / link-local / CGNAT / docs — skip lookup. */
export function isExternalIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
  if ([a, b, c, d].some(n => n > 255)) return false;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast / reserved
  return true;
}

function isFresh(entry: CacheEntry, now: number): boolean {
  const t = entry.ok ? entry.info.fetchedAt : entry.fetchedAt;
  if (entry.ok) return now - t < TTL_MS;
  return now - t < FAIL_COOLDOWN_MS;
}

/** Sync read — null if unknown / expired / private. */
export function getGeo(ip: string): GeoInfo | null {
  if (!isExternalIPv4(ip)) return null;
  loadCache();
  const entry = memory.get(ip);
  if (!entry || !entry.ok) return null;
  if (Date.now() - entry.info.fetchedAt >= TTL_MS) return null;
  return entry.info;
}

/** Queue a lookup for a public IP (no-op if cached / in-flight / private). */
export function requestGeo(ip: string): void {
  if (!isExternalIPv4(ip)) return;
  loadCache();
  const now = Date.now();
  const existing = memory.get(ip);
  if (existing && isFresh(existing, now)) return;
  if (pending.has(ip) || queued.has(ip)) return;
  queued.add(ip);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueue();
    }, FLUSH_MS);
  }
}

async function flushQueue(): Promise<void> {
  if (queued.size === 0) return;
  const batch: string[] = [];
  for (const ip of queued) {
    batch.push(ip);
    queued.delete(ip);
    pending.add(ip);
    if (batch.length >= BATCH_LIMIT) break;
  }
  if (queued.size > 0 && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueue();
    }, FLUSH_MS);
  }

  try {
    // Free tier is HTTP-only; fine for local Vite (http://localhost).
    const res = await fetch('http://ip-api.com/batch?fields=status,message,country,countryCode,as,asname,query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(query => ({ query }))),
    });
    if (!res.ok) throw new Error(`geo http ${res.status}`);
    const rows = await res.json() as Array<{
      status: string;
      message?: string;
      country?: string;
      countryCode?: string;
      as?: string;
      asname?: string;
      query?: string;
    }>;
    const now = Date.now();
    for (let i = 0; i < batch.length; i++) {
      const ip = batch[i];
      const row = rows[i];
      if (row && row.status === 'success' && row.query) {
        const asField = (row.as || '').trim();
        const asn = asField.split(/\s+/)[0] || '';
        memory.set(row.query, {
          ok: true,
          info: {
            countryCode: (row.countryCode || '').toUpperCase(),
            country: row.country || '',
            asn,
            asName: row.asname || asField.replace(/^\S+\s*/, ''),
            fetchedAt: now,
          },
        });
      } else {
        memory.set(ip, { ok: false, fetchedAt: now });
      }
      pending.delete(ip);
    }
    persistCache();
    notify();
  } catch {
    const now = Date.now();
    batch.forEach(ip => {
      memory.set(ip, { ok: false, fetchedAt: now });
      pending.delete(ip);
    });
    persistCache();
  }
}

/** ISO-3166 alpha-2 → regional-indicator flag emoji. */
export function flagEmoji(countryCode: string): string {
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const A = 0x1F1E6;
  return String.fromCodePoint(
    A + cc.charCodeAt(0) - 65,
    A + cc.charCodeAt(1) - 65,
  );
}

/** Short label line: "🇺🇸 AS15169" or "US AS15169". */
export function formatGeoLabel(info: GeoInfo): string {
  const flag = flagEmoji(info.countryCode);
  const head = flag || info.countryCode || '??';
  const asn = info.asn || '';
  return asn ? `${head} ${asn}` : head;
}
