import Taro from "@tarojs/taro";
import type { CacheCategory, CacheMeta } from "./CacheService";

const DIRECTORY = "guozaoke-topic-cache-v1";
const VERSION = 1;
const CATEGORIES = ["topic", "node", "user", "link", "system", "other"];
const PRIORITIES: Record<string, number> = { low: 0, normal: 1, high: 2 };

// Shared only to protect in-flight files from another instance's recovery scan.
const activeTemps = new Map<string, number>();
let instanceSequence = 0;

type FileSystem = ReturnType<typeof Taro.getFileSystemManager>;
interface FileEntry {
  version: number;
  payload: string;
  meta: CacheMeta;
}
interface DiskEntry {
  meta: CacheMeta;
  name: string;
}
interface PendingWrite {
  key: string;
  meta: CacheMeta;
  name: string;
  bytes: number;
  generation: number;
  epoch: number;
  categoryEpoch: number;
}

/** Match the scoped HTML key, not a category or a route appearing in a query. */
export function isTopicFileKey(key: string): boolean {
  if (typeof key !== "string") return false;
  // Both topic_index and the shared cache index remain in storage.
  if (key === "topic_index") return false;
  const scoped = /^html_v2_([a-zA-Z0-9-]+)_(.+?)_(https?:\/\/.*)$/.exec(key);
  if (!scoped || /[\r\n\u0000]/.test(key)) return false;
  // ROOT_URL's origin; the proxy is a transport, not a cache-key origin.
  const forum = /^https:\/\/www\.guozaoke\.com(?::443)?(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i.exec(scoped[3]);
  if (!forum) return false;
  const pathname = forum[1] || "/";
  // Reject traversal-shaped paths instead of classifying before URL normalization.
  if (pathname.includes("\\\\") || pathname.split("/").some((segment) => {
    const decodedDots = segment.replace(/%2e/gi, ".");
    return decodedDots === "." || decodedDots === "..";
  })) return false;
  // Home/node lists stay in storage; only topic and exact reply detail move to files.
  return /^\/t\/[^/]+\/?$/.test(pathname) || /^\/search\/reply\/[^/]+\/?$/.test(pathname);
}

/** UTF-8 encoding, including replacement of unpaired UTF-16 surrogates. */
export function utf8ByteLength(value: string): number {
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

function validMeta(meta: unknown): meta is CacheMeta {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as CacheMeta;
  return isTopicFileKey(m.key) && Number.isFinite(m.size) && Number.isInteger(m.size) && m.size >= 0 &&
    Number.isFinite(m.createdAt) && m.createdAt >= 0 && Number.isFinite(m.expiresAt) && m.expiresAt >= 0 &&
    CATEGORIES.includes(m.category) && Object.prototype.hasOwnProperty.call(PRIORITIES, m.priority);
}

function missing(error: unknown): boolean {
  const e = error as { code?: string; errMsg?: string; message?: string } | null;
  return e?.code === "ENOENT" || /no such file|not exist|not found|ENOENT/i.test(e?.errMsg || e?.message || "");
}

export default class TopicFileCache {
  private fs: FileSystem | null = null;
  private directory = "";
  private initialized = false;
  private initializationFailed = false;
  private unsafeSize = false;
  private entries = new Map<string, DiskEntry>();
  // Includes garbage that could not be deleted, but never duplicates active reservations.
  private files = new Map<string, number>();
  private generations = new Map<string, number>();
  private pending = new Map<string, PendingWrite>();
  private epoch = 0;
  private categoryEpochs = new Map<CacheCategory, number>();
  private sequence = 0;
  private readonly instance = ++instanceSequence;
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(maxEntries = 1000, maxBytes = 20 * 1024 * 1024) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : 1000;
    this.maxBytes = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 20 * 1024 * 1024;
  }

  get(key: string): { payload: string; meta: CacheMeta } | null {
    if (!isTopicFileKey(key) || !this.ensureReady()) return null;
    try {
      const entry = this.readEntry(this.fileName(key));
      if (!entry || entry.meta.key !== key) return null;
      if (Date.now() > entry.meta.expiresAt) {
        // Age-based cleanup must not cancel a newer in-flight replacement.
        if (!this.hasPending(key)) this.remove(key);
        return null;
      }
      return { payload: entry.payload, meta: { ...entry.meta } };
    } catch (error) {
      if (missing(error)) this.forget(this.fileName(key));
      else this.warn("read failed", error);
      return null;
    }
  }

  // Deliberately does not expire/delete: migration and settings need expired metadata.
  getMeta(key: string): CacheMeta | null {
    if (!isTopicFileKey(key) || !this.ensureReady()) return null;
    const meta = this.entries.get(key)?.meta;
    return meta ? { ...meta } : null;
  }

  getAllMeta(): CacheMeta[] {
    if (!this.ensureReady()) return [];
    return [...this.entries.values()].map((entry) => ({ ...entry.meta }));
  }

  set(key: string, payload: string, meta: CacheMeta): boolean {
    const prepared = this.prepare(key, payload, meta);
    if (!prepared) return false;
    const { write, serialized } = prepared;
    try {
      this.fs!.writeFileSync(this.path(write.name), serialized, "utf8");
      return this.publish(write);
    } catch (error) {
      this.warn("write failed", error);
      return false;
    } finally {
      this.finish(write);
    }
  }

  setAsync(key: string, payload: string, meta: CacheMeta): Promise<boolean> {
    const prepared = this.prepare(key, payload, meta);
    if (!prepared) return Promise.resolve(false);
    const { write, serialized } = prepared;
    return new Promise((resolve) => {
      let completed = false;
      const complete = (written: boolean, error?: unknown) => {
        if (completed) return;
        completed = true;
        let published = false;
        try {
          if (written) published = this.publish(write);
          else this.warn("async write failed", error);
        } catch (failure) {
          this.warn("publish failed", failure);
        } finally {
          this.finish(write);
        }
        resolve(published);
      };
      try {
        this.fs!.writeFile({
          filePath: this.path(write.name), data: serialized, encoding: "utf8",
          success: () => complete(true), fail: (error) => complete(false, error),
        });
      } catch (error) {
        complete(false, error);
      }
    });
  }

  remove(key: string): boolean {
    if (!isTopicFileKey(key)) return false;
    this.invalidateKey(key);
    if (!this.ensureReady()) return false;
    const name = this.fileName(key);
    try {
      const entry = this.readEntry(name);
      // Never delete an unreadable or colliding file on behalf of this key.
      if (!entry || entry.meta.key !== key) return false;
      this.fs!.unlinkSync(this.path(name));
      this.forget(name);
      return true;
    } catch (error) {
      if (missing(error)) {
        this.forget(name);
        return true;
      }
      this.warn("delete failed", error);
      return false;
    }
  }

  clear(category?: CacheCategory): number {
    if (category !== undefined && !CATEGORIES.includes(category)) throw new Error("Invalid cache category");
    if (category === undefined) this.epoch++;
    else this.categoryEpochs.set(category, this.categoryEpoch(category) + 1);
    if (!this.ensureReady()) {
      // Platforms/test mocks without FS must not break unrelated storage clearing.
      if (!this.initializationFailed && this.entries.size === 0 && this.files.size === 0 && this.pending.size === 0) return 0;
      throw new Error("Topic file cache filesystem unavailable");
    }
    let count = 0;
    let failed = false;
    // Unknown newly-arrived files must not be silently skipped by a manual clear.
    // This enumerates basenames only; normal reads/stats still use the cached map.
    try {
      for (const name of this.fs!.readdirSync(this.directory)) {
        if (!name || name.includes("/") || name.includes("\\\\") || name === "." || name === "..") {
          failed = true;
          continue;
        }
        if (activeTemps.has(this.path(name))) continue;
        // Revalidate even known files: metadata can be stale after disk corruption.
        const raw = this.fs!.readFileSync(this.path(name), "utf8");
        if (typeof raw !== "string") throw new Error("Unknown cache file size");
        this.forget(name);
        this.files.set(name, utf8ByteLength(raw));
        const entry = this.parseEntry(raw);
        if (entry && name === this.fileName(entry.meta.key)) this.entries.set(entry.meta.key, { meta: entry.meta, name });
      }
    } catch (error) {
      this.warn("clear scan failed", error);
      failed = true;
    }
    const publishedNames = new Set<string>();
    for (const [key, entry] of [...this.entries]) {
      publishedNames.add(entry.name);
      if (category !== undefined && entry.meta.category !== category) continue;
      if (this.remove(key)) count++;
      else failed = true;
    }
    if (category === undefined) {
      for (const name of [...this.files.keys()]) {
        if (publishedNames.has(name) || activeTemps.has(this.path(name))) continue;
        if (!this.deleteGarbage(name)) failed = true;
      }
    }
    if (failed) throw new Error("Some topic cache files could not be deleted");
    this.unsafeSize = false;
    return count;
  }

  /** Recovery/daily maintenance; no storage fallback and no exception to callers. */
  cleanup(): void {
    if (!this.ensureReady()) return;
    try {
      this.scan();
      for (const [key, entry] of [...this.entries]) {
        if (Date.now() > entry.meta.expiresAt && !this.hasPending(key)) this.remove(key);
      }
      this.makeRoom(0);
    } catch (error) {
      this.warn("cleanup failed", error);
    }
  }

  hasPending(key: string): boolean {
    for (const write of this.pending.values()) {
      if (write.key === key && this.isCurrent(write)) return true;
    }
    return false;
  }

  private ensureReady(): boolean {
    if (this.initialized) return true;
    try {
      const root = Taro.env?.USER_DATA_PATH;
      if (typeof root !== "string" || !root || typeof Taro.getFileSystemManager !== "function") return false;
      const fs = Taro.getFileSystemManager();
      const methods = ["accessSync", "mkdirSync", "readdirSync", "readFileSync", "writeFileSync", "writeFile", "renameSync", "unlinkSync"] as const;
      if (!fs || methods.some((method) => typeof fs[method] !== "function")) return false;
      this.fs = fs;
      this.directory = `${root.replace(/\/$/, "")}/${DIRECTORY}`;
      try { fs.accessSync(this.directory); }
      catch (error) {
        if (!missing(error)) throw error;
        fs.mkdirSync(this.directory, true);
      }
      this.scan();
      this.initialized = true;
      this.initializationFailed = false;
      return true;
    } catch (error) {
      // Once an actual FS was obtained, failed access/scan is not an empty cache.
      this.initializationFailed = this.fs !== null;
      this.warn("initialization failed", error);
      return false;
    }
  }

  private scan(): void {
    const names = this.fs!.readdirSync(this.directory);
    const entries = new Map<string, DiskEntry>();
    const files = new Map<string, number>();
    let unsafe = false;
    const previousByName = new Map([...this.entries.values()].map((entry) => [entry.name, entry]));
    for (const name of names) {
      // readdir returns basenames; never trust traversal-shaped mock/corrupt results.
      if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
        unsafe = true;
        continue;
      }
      if (activeTemps.has(this.path(name))) continue;
      try {
        const raw = this.fs!.readFileSync(this.path(name), "utf8");
        if (typeof raw !== "string") throw new Error("Expected UTF-8 file contents");
        files.set(name, utf8ByteLength(raw));
        const entry = this.parseEntry(raw);
        if (entry && name === this.fileName(entry.meta.key)) entries.set(entry.meta.key, { meta: entry.meta, name });
        else {
          try { this.fs!.unlinkSync(this.path(name)); files.delete(name); }
          catch (error) { if (missing(error)) files.delete(name); else this.warn("garbage delete failed", error); }
        }
      } catch (error) {
        if (missing(error)) continue;
        this.warn("scan failed", error);
        // An unreadable file still consumes disk. If its size is unknowable, stop writes.
        try {
          const stat = this.fs!.statSync(this.path(name));
          if (!Number.isFinite(stat.size) || stat.size < 0) throw new Error("Unknown file size");
          files.set(name, stat.size);
        } catch { unsafe = true; }
        const previous = previousByName.get(name);
        if (previous) entries.set(previous.meta.key, previous);
      }
    }
    this.entries = entries;
    this.files = files;
    this.unsafeSize = unsafe;
  }

  private prepare(key: string, payload: string, meta: CacheMeta): { write: PendingWrite; serialized: string } | null {
    if (!isTopicFileKey(key)) return null;
    const generation = this.invalidateKey(key);
    if (typeof payload !== "string" || !validMeta(meta) || meta.key !== key || !this.ensureReady()) return null;
    const normalized = { ...meta, size: utf8ByteLength(payload) };
    const serialized = JSON.stringify({ version: VERSION, payload, meta: normalized });
    const bytes = utf8ByteLength(serialized);
    try {
      if (!this.destinationMatches(key) || bytes > this.maxBytes || !this.makeRoom(bytes, key)) return null;
      const name = `${this.fileName(key)}.${Date.now().toString(36)}.${this.instance}.${++this.sequence}.tmp`;
      const write: PendingWrite = {
        key, meta: normalized, name, bytes, generation,
        epoch: this.epoch, categoryEpoch: this.categoryEpoch(meta.category),
      };
      this.generations.set(key, generation);
      this.pending.set(name, write);
      activeTemps.set(this.path(name), bytes);
      return { write, serialized };
    } catch (error) {
      this.warn("prepare failed", error);
      return null;
    } finally {
      if (!this.hasAnyPending(key)) this.generations.delete(key);
    }
  }

  private publish(write: PendingWrite): boolean {
    if (!this.isCurrent(write) || !this.destinationMatches(write.key)) return false;
    const name = this.fileName(write.key);
    // Do not unlink the old destination first. Rename success is not an atomicity promise.
    this.fs!.renameSync(this.path(write.name), this.path(name));
    this.files.set(name, write.bytes);
    this.entries.set(write.key, { meta: write.meta, name });
    return true;
  }

  private finish(write: PendingWrite): void {
    try {
      this.fs!.unlinkSync(this.path(write.name));
    } catch (error) {
      if (!missing(error)) {
        // Conservatively retain the full reservation if a partial/temp file remains.
        this.files.set(write.name, write.bytes);
        this.warn("temporary delete failed", error);
      }
    } finally {
      activeTemps.delete(this.path(write.name));
      this.pending.delete(write.name);
      // Completed keys without a pending write no longer need generation tombstones.
      if (!this.hasAnyPending(write.key)) this.generations.delete(write.key);
    }
  }

  private destinationMatches(key: string): boolean {
    try {
      const entry = this.readEntry(this.fileName(key));
      return !!entry && entry.meta.key === key;
    } catch (error) {
      if (missing(error)) return true;
      this.warn("destination check failed", error);
      return false;
    }
  }

  private readEntry(name: string): FileEntry | null {
    const raw = this.fs!.readFileSync(this.path(name), "utf8");
    return typeof raw === "string" ? this.parseEntry(raw) : null;
  }

  private parseEntry(raw: string): FileEntry | null {
    try {
      const entry = JSON.parse(raw) as FileEntry;
      if (entry?.version !== VERSION || typeof entry.payload !== "string" || !validMeta(entry.meta) ||
        entry.meta.size !== utf8ByteLength(entry.payload)) return null;
      return entry;
    } catch { return null; }
  }

  private makeRoom(extraBytes: number, key?: string): boolean {
    if (this.unsafeSize || this.maxEntries === 0) return false;
    const fits = () => {
      const keys = new Set(this.entries.keys());
      for (const write of this.pending.values()) if (this.isCurrent(write)) keys.add(write.key);
      if (key !== undefined) keys.add(key);
      let bytes = [...this.files.values()].reduce((sum, value) => sum + value, 0);
      for (const [path, reserved] of activeTemps) if (path.startsWith(`${this.directory}/`)) bytes += reserved;
      return keys.size <= this.maxEntries && bytes + extraBytes <= this.maxBytes;
    };
    const now = Date.now();
    const candidates = [...this.entries.values()].filter((entry) => entry.meta.key !== key && !this.hasPending(entry.meta.key)).sort((a, b) => {
      const expired = Number(b.meta.expiresAt < now) - Number(a.meta.expiresAt < now);
      return expired || PRIORITIES[a.meta.priority] - PRIORITIES[b.meta.priority] || a.meta.createdAt - b.meta.createdAt;
    });
    for (const entry of candidates) {
      if (entry.meta.expiresAt >= now && fits()) break;
      this.remove(entry.meta.key);
    }
    return fits();
  }

  private deleteGarbage(name: string): boolean {
    try {
      this.fs!.unlinkSync(this.path(name));
      this.forget(name);
      return true;
    } catch (error) {
      if (missing(error)) { this.forget(name); return true; }
      this.warn("garbage delete failed", error);
      return false;
    }
  }

  private forget(name: string): void {
    this.files.delete(name);
    for (const [key, entry] of this.entries) if (entry.name === name) this.entries.delete(key);
  }

  private invalidateKey(key: string): number {
    const generation = (this.generations.get(key) || 0) + 1;
    // With no in-flight write, no tombstone needs to survive the current call.
    if (this.hasAnyPending(key)) this.generations.set(key, generation);
    return generation;
  }

  private hasAnyPending(key: string): boolean {
    return [...this.pending.values()].some((write) => write.key === key);
  }

  private categoryEpoch(category: CacheCategory): number {
    return this.categoryEpochs.get(category) || 0;
  }

  private isCurrent(write: PendingWrite): boolean {
    return write.generation === this.generations.get(write.key) && write.epoch === this.epoch &&
      write.categoryEpoch === this.categoryEpoch(write.meta.category);
  }

  private path(name: string): string {
    return `${this.directory}/${name}`;
  }

  private fileName(key: string): string {
    // Two independent 32-bit hashes; the full key in the envelope is authoritative.
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    for (let i = 0; i < key.length; i++) {
      a = Math.imul(a ^ key.charCodeAt(i), 0x01000193);
      b = Math.imul(b ^ key.charCodeAt(i), 0x85ebca6b);
    }
    return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}.json`;
  }

  private warn(message: string, error?: unknown): void {
    // Error codes only: FS errors can contain account-scoped paths; never log payloads/keys.
    const code = (error as { code?: string } | null)?.code;
    console.warn(`[TopicFileCache] ${message}`, typeof code === "string" ? code : "");
  }
}
