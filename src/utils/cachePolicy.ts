// Retention is independent of network revalidation and API schema versions.
// Use a finite sentinel so metadata survives JSON serialization and validation.
export const RETAIN_UNTIL_EVICTED = Number.MAX_SAFE_INTEGER;
export const FILE_CACHE_MAX_BYTES = 150 * 1024 * 1024;
export const STORAGE_HIGH_WATER = 0.8;
export const STORAGE_LOW_WATER = 0.6;
export const TOPIC_INDEX_MAX_ENTRIES = 1000;
export const TOPIC_INDEX_MAX_BYTES = 512 * 1024;

export function utf8Size(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export function expirationFor(ttl: number | undefined, now: number): number {
  return ttl === undefined ? RETAIN_UNTIL_EVICTED : now + ttl;
}

interface EvictionMeta {
  key: string;
  createdAt: number;
  expiresAt: number;
  priority: "low" | "normal" | "high";
}
const PRIORITY = { low: 0, normal: 1, high: 2 };

// The shared index persists least-to-most recently accessed keys across restarts.
// Untracked legacy entries fall back to creation time without inventing access.
export function evictionComparator(keys: readonly string[], now = Date.now()) {
  const ranks = new Map(keys.map((key, index) => [key, index]));
  return (a: EvictionMeta, b: EvictionMeta): number => {
    const expired = Number(b.expiresAt < now) - Number(a.expiresAt < now);
    if (expired) return expired;
    const priority = PRIORITY[a.priority] - PRIORITY[b.priority];
    if (priority) return priority;
    const ar = ranks.get(a.key);
    const br = ranks.get(b.key);
    if (ar !== undefined && br !== undefined) return ar - br;
    if (ar !== undefined || br !== undefined) return ar === undefined ? -1 : 1;
    return a.createdAt - b.createdAt;
  };
}
