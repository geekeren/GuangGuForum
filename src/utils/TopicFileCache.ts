import Taro from "@tarojs/taro";
import type { CacheCategory, CacheMeta } from "./CacheService";
import { FILE_CACHE_MAX_BYTES, evictionComparator } from "./cachePolicy";

const DIRECTORY = "guozaoke-topic-cache-v1";
const VERSION = 1;
const CATEGORIES = ["topic", "node", "user", "link", "system", "other"];

// Shared only to protect in-flight files from another instance's recovery scan.
const activeTemps = new Map<string, number>();
let instanceSequence = 0;
// Root deletion cannot race a write from a second cache instance.
const clearingRoots = new Set<string>();

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
  reserved?: boolean;
  done?: Promise<void>;
  resolveDone?: () => void;
}

type RemovalReason = "missing" | "deleted";

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
  // Profile HTML includes query pages, not the separate /u/:username/favorites API.
  return /^\/t\/[^/]+\/?$/.test(pathname) || /^\/search\/reply\/[^/]+\/?$/.test(pathname) ||
    /^\/u\/[^/]+\/?$/.test(pathname);
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
    CATEGORIES.includes(m.category) && ["low", "normal", "high"].includes(m.priority);
}

function missing(error: unknown): boolean {
  const e = error as { code?: string; errMsg?: string; message?: string } | null;
  return e?.code === "ENOENT" || /no such file|not exist|not found|ENOENT/i.test(e?.errMsg || e?.message || "");
}

export default class TopicFileCache {
  private fs: FileSystem | null = null;
  private directory = "";
  private legacyDirectory = "";
  private initialized = false;
  private rootDeleted = false;
  private initializationFailed = false;
  private initializing: Promise<boolean> | null = null;
  // Metadata commits/scans serialize; slow writes and ordinary reads do not.
  private commits: Promise<void> = Promise.resolve();
  private asyncCommitActive = false;
  private fullClearActive = false;
  private fullClearing: Promise<number> | null = null;
  private stateVersion = 0;
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

  // File I/O stays storage-independent. The owner supplies persisted LRU order;
  // standalone instances use successful reads/writes with creation-time fallback.
  private accessOrder: string[] = [];

  constructor(maxEntries = 1000, maxBytes = FILE_CACHE_MAX_BYTES,
    private readonly onRemoved?: (key: string, reason: RemovalReason) => void,
    private readonly onPublished?: (key: string, meta: CacheMeta) => void,
    private readonly getAccessOrder?: () => readonly string[]) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : 1000;
    this.maxBytes = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : FILE_CACHE_MAX_BYTES;
  }

  private touch(key: string) {
    if (this.getAccessOrder) return; // The owner already persists the shared order.
    this.accessOrder = this.accessOrder.filter(candidate => this.entries.has(candidate));
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) this.accessOrder.splice(index, 1);
    this.accessOrder.push(key);
  }

  get(key: string): { payload: string; meta: CacheMeta } | null {
    if (!isTopicFileKey(key)) return null;
    if (this.rootDeleted && !this.hasPending(key) && !this.fullClearActive) { this.removed(key, "missing"); return null; }
    if (!this.ensureReady()) return null;
    try {
      const entry = this.readEntry(this.fileName(key));
      if (!entry || entry.meta.key !== key) return null;
      if (Date.now() > entry.meta.expiresAt) {
        // Age-based cleanup must not cancel a newer in-flight replacement.
        if (!this.hasPending(key)) this.remove(key);
        return null;
      }
      this.touch(key);
      return { payload: entry.payload, meta: { ...entry.meta } };
    } catch (error) {
      if (missing(error)) {
        if (!this.hasPending(key)) this.removed(key, "missing");
      }
      else this.warn("read failed", error);
      return null;
    }
  }

  // Deliberately does not expire/delete: migration and settings need expired metadata.
  getMeta(key: string): CacheMeta | null {
    if (!isTopicFileKey(key) || (!this.initialized && !this.ensureReady())) return null;
    return this.getMetaCached(key);
  }

  /** Pure memory snapshot even before initialization or after a filesystem failure. */
  getMetaCached(key: string): CacheMeta | null {
    const meta = this.entries.get(key)?.meta;
    return meta ? { ...meta } : null;
  }

  getAllMeta(): CacheMeta[] {
    if (!this.initialized && !this.ensureReady()) return [];
    return this.getAllMetaCached();
  }

  getAllMetaCached(): CacheMeta[] {
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

  /** Stable revision; category clears advance affected key generations. */
  getRevision(key: string): string {
    // Keep tokens stable across cold metadata discovery; category clear advances
    // affected key generations, while read tokens validate the parsed category.
    if (!this.generations.has(key)) this.generations.set(key, 0);
    return this.keyRevision(key);
  }

  private keyRevision(key: string): string {
    return `${this.generations.get(key) || 0}:${this.epoch}`;
  }

  async getAsync(key: string): Promise<{ payload: string; meta: CacheMeta } | null> {
    if (!isTopicFileKey(key)) return null;
    if (this.rootDeleted && !this.hasPending(key) && !this.fullClearActive) { this.removed(key, "missing"); return null; }
    const revision = this.getRevision(key);
    const keyRevision = this.keyRevision(key);
    const categories = new Map(CATEGORIES.map((category) => [category, this.categoryEpoch(category as CacheCategory)]));
    if (!await this.ensureReadyAsync() || keyRevision !== this.keyRevision(key)) return null;
    try {
      const name = this.fileName(key);
      const raw = await this.readRawAsync(name);
      const entry = this.parseEntry(raw);
      const current = () => keyRevision === this.keyRevision(key) && !!entry &&
        categories.get(entry.meta.category) === this.categoryEpoch(entry.meta.category);
      if (!current() || !entry || entry.meta.key !== key) return null;
      // A cold scan may have encountered EIO before this successful read.
      const registered = await this.commit(() => {
        if (!current()) return false;
        this.entries.set(key, { meta: entry.meta, name });
        this.files.set(name, utf8ByteLength(raw));
        this.stateVersion++;
        return true;
      });
      if (!registered || !current()) return null;
      if (Date.now() > entry.meta.expiresAt) {
        if (!this.hasPending(key)) await this.removeAsync(key);
        return null;
      }
      this.touch(key);
      return { payload: entry.payload, meta: { ...entry.meta } };
    } catch (error) {
      if (missing(error)) {
        if (revision === this.getRevision(key) && !this.hasPending(key)) await this.commit(() => {
          if (revision === this.getRevision(key) && !this.hasPending(key)) this.removed(key, "missing");
        });
      } else this.warn("read failed", error);
      return null;
    }
  }

  async getMetaAsync(key: string): Promise<CacheMeta | null> {
    if (!isTopicFileKey(key) || !await this.ensureReadyAsync()) return null;
    return this.commit(() => this.getMetaCached(key));
  }

  async getAllMetaAsync(): Promise<CacheMeta[]> {
    if (!await this.ensureReadyAsync()) {
      if (this.initializationFailed) throw new Error("Topic file cache metadata unavailable");
      return [];
    }
    return this.commit(() => [...this.entries.values()].map((entry) => ({ ...entry.meta })));
  }

  async setAsync(key: string, payload: string, meta: CacheMeta, expectedRevision?: string): Promise<boolean> {
    if (!isTopicFileKey(key) || (expectedRevision !== undefined && expectedRevision !== this.getRevision(key))) return false;
    // Registration is before the first await, including failed latest attempts.
    const generation = this.invalidateKey(key);
    if (this.fullClearActive || typeof payload !== "string" || !validMeta(meta) || meta.key !== key) return false;
    const normalized = { ...meta, size: utf8ByteLength(payload) };
    const serialized = JSON.stringify({ version: VERSION, payload, meta: normalized });
    const write: PendingWrite = {
      key, meta: normalized, bytes: utf8ByteLength(serialized), generation,
      name: `${this.fileName(key)}.${Date.now().toString(36)}.${this.instance}.${++this.sequence}.tmp`,
      epoch: this.epoch, categoryEpoch: this.categoryEpoch(meta.category), reserved: false,
    };
    write.done = new Promise<void>((resolve) => { write.resolveDone = resolve; });
    this.pending.set(write.name, write);
    try {
      if (!await this.ensureReadyAsync(false, true) || !this.isCurrent(write)) return false;
      const prepared = await this.commit(async () => {
        if (!this.isCurrent(write) || !await this.destinationMatchesAsync(key) || !this.isCurrent(write) ||
          write.bytes > this.maxBytes || !await this.makeRoomAsync(write.bytes, key) || !this.isCurrent(write)) return false;
        write.reserved = true;
        activeTemps.set(this.path(write.name), write.bytes);
        return true;
      });
      if (!prepared || !this.isCurrent(write)) return false;
      // Slow temporary write is deliberately outside the commit queue.
      await new Promise<void>((resolve, reject) => this.fs!.writeFile({
        filePath: this.path(write.name), data: serialized, encoding: "utf8",
        success: () => resolve(), fail: reject,
      }));
      return await this.commit(async () => {
        if (!this.isCurrent(write) || !await this.destinationMatchesAsync(key) || !this.isCurrent(write)) return false;
        return this.publish(write, true);
      });
    } catch (error) {
      this.warn("async write failed", error);
      return false;
    } finally {
      await this.commit(() => {
        if (write.reserved) this.finish(write);
        else this.pending.delete(write.name);
        write.resolveDone?.();
      });
    }
  }

  async removeAsync(key: string): Promise<boolean> {
    if (!isTopicFileKey(key)) return false;
    this.invalidateKey(key);
    const revision = this.getRevision(key);
    if (this.rootDeleted && !this.fullClearActive) { this.removed(key, "deleted"); return true; }
    if (!await this.ensureReadyAsync()) return false;
    return this.commit(() => this.removeCheckedAsync(key, revision));
  }

  clearAsync(category?: CacheCategory): Promise<number> {
    this.invalidateCategory(category);
    if (this.fullClearing) return this.fullClearing;
    const root = this.requestedCacheRoot();
    if (category === undefined) {
      this.fullClearActive = true;
      if (root) {
        if (clearingRoots.has(root)) {
          this.fullClearActive = false;
          return Promise.reject(new Error("Cache root clear already in progress"));
        }
        clearingRoots.add(root);
      }
    }
    const pending = category === undefined ? [...this.pending.values()].map((write) => write.done || Promise.resolve()) : [];
    const clearing = this.clearPreparedAsync(category, pending);
    if (category === undefined) {
      this.fullClearing = clearing;
      const finish = () => {
        this.fullClearActive = false;
        this.fullClearing = null;
        if (root) clearingRoots.delete(root);
      };
      void clearing.then(finish, finish);
    }
    return clearing;
  }

  private async clearPreparedAsync(category: CacheCategory | undefined, pending: Promise<void>[]): Promise<number> {
    if (this.rootDeleted && category !== undefined) return 0;
    // Temp callbacks may create files late; drain cancellation outside the queue.
    await Promise.all(pending);
    if (!await this.ensureReadyAsync(true)) {
      if (this.emptyUnsupported()) return 0;
      throw new Error("Topic file cache filesystem unavailable");
    }
    return this.commit(async () => {
      // Scans must finish successfully before clear reports success.
      await this.scanAsync(false, category === undefined ? "deleted" : "missing");
      let count = 0;
      let failed = this.unsafeSize;
      const knownNames = new Set([...this.entries.values()].map((entry) => entry.name));
      for (const [key, entry] of [...this.entries]) {
        if (category !== undefined && entry.meta.category !== category) continue;
        const revision = this.getRevision(key);
        if (await this.removeCheckedAsync(key, revision)) count++;
        else failed = true;
      }
      if (category === undefined) {
        for (const name of [...this.files.keys()]) {
          if (knownNames.has(name) || activeTemps.has(this.path(name))) continue;
          if (!this.deleteGarbage(name)) failed = true;
        }
      }
      if (failed) throw new Error("Some topic cache files could not be deleted");
      if (category === undefined) {
        if ([...activeTemps.keys()].some((path) => path.startsWith(`${this.cacheRoot()}/`))) {
          throw new Error("Another cache instance has active temporary files");
        }
        try {
          await new Promise<void>((resolve, reject) => this.fs!.rmdir({
            dirPath: this.cacheRoot(), recursive: true, success: () => resolve(), fail: reject,
          }));
        } catch (error) { if (!missing(error)) throw error; }
        this.initialized = false;
        this.rootDeleted = true;
        this.entries.clear();
        this.files.clear();
        this.stateVersion++;
      }
      this.unsafeSize = false;
      return count;
    });
  }

  /** Recovery/maintenance failures remain retryable and do not reject callers. */
  async cleanupAsync(): Promise<void> {
    if (!await this.ensureReadyAsync()) return;
    try {
      await this.commit(async () => {
        await this.scanAsync();
        for (const [key, entry] of [...this.entries]) {
          if (Date.now() > entry.meta.expiresAt && !this.hasPending(key)) {
            this.invalidateKey(key);
            await this.removeCheckedAsync(key, this.getRevision(key));
          }
        }
        await this.makeRoomAsync(0);
      });
    } catch (error) { this.warn("cleanup failed", error); }
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
      this.removed(key, "deleted");
      return true;
    } catch (error) {
      if (missing(error)) {
        this.removed(key, "deleted");
        return true;
      }
      this.warn("delete failed", error);
      return false;
    }
  }

  clear(category?: CacheCategory): number {
    this.invalidateCategory(category);
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
    if (category === undefined) {
      // Compatibility callers cannot synchronously wait for a slow temp write.
      if (typeof this.fs!.rmdirSync === "function") {
        if (this.pending.size > 0 || [...activeTemps.keys()].some((path) => path.startsWith(`${this.cacheRoot()}/`))) {
          throw new Error("Topic cache writes still finishing; use clearAsync");
        }
        try { this.fs!.rmdirSync(this.cacheRoot(), true); }
        catch (error) { if (!missing(error)) throw error; }
        this.initialized = false;
        this.rootDeleted = true;
        this.entries.clear();
        this.files.clear();
        this.stateVersion++;
      }
    }
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

  private commit<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.commits.then(async () => {
      this.asyncCommitActive = true;
      try { return await operation(); }
      finally { this.asyncCommitActive = false; }
    });
    this.commits = result.then(() => {}, () => {});
    return result;
  }

  private emptyUnsupported(): boolean {
    return !this.initializationFailed && this.entries.size === 0 && this.files.size === 0 &&
      ![...this.pending.values()].some((write) => this.isCurrent(write));
  }

  private acquire(async: boolean): boolean {
    const root = Taro.env?.USER_DATA_PATH;
    if (typeof root !== "string" || !root || typeof Taro.getFileSystemManager !== "function") return false;
    const fs = Taro.getFileSystemManager();
    const methods = async
      ? ["access", "mkdir", "readdir", "readFile", "stat", "writeFile", "renameSync", "unlinkSync"] as const
      : ["accessSync", "mkdirSync", "readdirSync", "readFileSync", "writeFileSync", "renameSync", "unlinkSync"] as const;
    if (!fs || methods.some((method) => typeof fs[method] !== "function")) return false;
    this.fs = fs;
    this.directory = `${root.replace(/\/$/, "")}/caches/${DIRECTORY}`;
    this.legacyDirectory = `${root.replace(/\/$/, "")}/${DIRECTORY}`;
    return true;
  }

  private ensureReadyAsync(forClear = false, forWrite = false): Promise<boolean> {
    if (this.rootDeleted && !forClear && !forWrite) return Promise.resolve(false);
    const root = this.requestedCacheRoot();
    if (!forClear && (this.fullClearActive || (root && clearingRoots.has(root)))) return Promise.resolve(false);
    if (this.initializing) return this.initializing;
    if (this.initialized) return Promise.resolve(true);
    const initialization = this.commit(async () => {
      if (this.initialized) return true;
      try {
        if (!this.acquire(true)) return false;
        try {
          await new Promise<void>((resolve, reject) => this.fs!.access({
            path: this.directory, success: () => resolve(), fail: reject,
          }));
        } catch (error) {
          if (!missing(error)) throw error;
          await new Promise<void>((resolve, reject) => this.fs!.mkdir({
            dirPath: this.directory, recursive: true, success: () => resolve(), fail: reject,
          }));
        }
        await this.migrateLegacyAsync();
        await this.scanAsync();
        this.initialized = true;
        this.rootDeleted = false;
        this.initializationFailed = false;
        return true;
      } catch (error) {
        this.initializationFailed = this.fs !== null;
        this.warn("initialization failed", error);
        return false;
      }
    });
    this.initializing = initialization;
    void initialization.then(() => { if (this.initializing === initialization) this.initializing = null; });
    return initialization;
  }

  private async readRawAsync(name: string, directory = this.directory): Promise<string> {
    const raw = await new Promise<string | ArrayBuffer>((resolve, reject) => this.fs!.readFile({
      filePath: `${directory}/${name}`, encoding: "utf8", success: (result) => resolve(result.data), fail: reject,
    }));
    if (typeof raw !== "string") throw new Error("Expected UTF-8 file contents");
    return raw;
  }

  /** Recover the previous directory without rewriting timestamps or envelopes. */
  private async migrateLegacyAsync(): Promise<void> {
    let names: string[];
    try {
      names = await new Promise<string[]>((resolve, reject) => this.fs!.readdir({
        dirPath: this.legacyDirectory, success: (result) => resolve(result.files), fail: reject,
      }));
    } catch (error) { if (missing(error)) return; throw error; }
    for (const name of names) {
      if (!this.validName(name)) throw new Error("Invalid legacy cache filename");
      const oldPath = `${this.legacyDirectory}/${name}`;
      // Another old-version instance can still be writing into the old directory.
      if (activeTemps.has(oldPath)) throw new Error("Legacy cache write still active");
      let entry: FileEntry | null;
      try { entry = this.parseEntry(await this.readRawAsync(name, this.legacyDirectory)); }
      catch (error) { if (missing(error)) continue; throw error; }
      if (!entry || name !== this.fileName(entry.meta.key)) {
        try { this.fs!.unlinkSync(oldPath); } catch (error) { if (!missing(error)) throw error; }
        continue;
      }
      let destination: FileEntry | null;
      try { destination = await this.readEntryAsync(name); }
      catch (error) {
        if (!missing(error)) throw error;
        // Queue excludes publication until this short commit is complete.
        this.fs!.renameSync(oldPath, this.path(name));
        continue;
      }
      if (!destination) {
        // Malformed data owned by this cache directory is garbage, not a collision.
        try { this.fs!.unlinkSync(this.path(name)); } catch (error) { if (!missing(error)) throw error; }
        this.fs!.renameSync(oldPath, this.path(name));
        continue;
      }
      if (destination.meta.key !== entry.meta.key) throw new Error("Legacy cache destination mismatch");
      // A file in the new directory is authoritative; never overwrite a live value.
      try { this.fs!.unlinkSync(oldPath); } catch (error) { if (!missing(error)) throw error; }
    }
  }

  private migrateLegacy(): void {
    let names: string[];
    try { names = this.fs!.readdirSync(this.legacyDirectory); }
    catch (error) { if (missing(error)) return; throw error; }
    for (const name of names) {
      if (!this.validName(name)) throw new Error("Invalid legacy cache filename");
      const oldPath = `${this.legacyDirectory}/${name}`;
      if (activeTemps.has(oldPath)) throw new Error("Legacy cache write still active");
      let entry: FileEntry | null;
      try {
        const raw = this.fs!.readFileSync(oldPath, "utf8");
        if (typeof raw !== "string") throw new Error("Expected UTF-8 file contents");
        entry = this.parseEntry(raw);
      } catch (error) { if (missing(error)) continue; throw error; }
      if (!entry || name !== this.fileName(entry.meta.key)) {
        try { this.fs!.unlinkSync(oldPath); } catch (error) { if (!missing(error)) throw error; }
        continue;
      }
      let destination: FileEntry | null;
      try { destination = this.readEntry(name); }
      catch (error) {
        if (!missing(error)) throw error;
        this.fs!.renameSync(oldPath, this.path(name));
        continue;
      }
      if (!destination) {
        // Malformed data owned by this cache directory is garbage, not a collision.
        try { this.fs!.unlinkSync(this.path(name)); } catch (error) { if (!missing(error)) throw error; }
        this.fs!.renameSync(oldPath, this.path(name));
        continue;
      }
      if (destination.meta.key !== entry.meta.key) throw new Error("Legacy cache destination mismatch");
      try { this.fs!.unlinkSync(oldPath); } catch (error) { if (!missing(error)) throw error; }
    }
  }

  private async readEntryAsync(name: string): Promise<FileEntry | null> {
    return this.parseEntry(await this.readRawAsync(name));
  }

  private async destinationMatchesAsync(key: string): Promise<boolean> {
    try {
      const entry = await this.readEntryAsync(this.fileName(key));
      return !!entry && entry.meta.key === key;
    } catch (error) {
      if (missing(error)) return true;
      this.warn("destination check failed", error);
      return false;
    }
  }

  private async removeCheckedAsync(key: string, revision: string): Promise<boolean> {
    if (revision !== this.getRevision(key)) return false;
    try {
      const entry = await this.readEntryAsync(this.fileName(key));
      if (revision !== this.getRevision(key) || !entry || entry.meta.key !== key) return false;
      this.fs!.unlinkSync(this.path(this.fileName(key)));
      this.removed(key, "deleted");
      return true;
    } catch (error) {
      if (missing(error)) {
        if (revision !== this.getRevision(key)) return false;
        this.removed(key, "deleted");
        return true;
      }
      this.warn("delete failed", error);
      return false;
    }
  }

  private validName(name: string): boolean {
    return !!name && !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
  }

  /** Called inside the queue; sync compatibility mutations make a stale scan retry. */
  private async scanAsync(deleteInvalid = true, missingReason: RemovalReason = "missing"): Promise<void> {
    const version = this.stateVersion;
    const revisions = new Map([...this.entries.keys()].map((key) => [key, this.getRevision(key)]));
    const names = await new Promise<string[]>((resolve, reject) => this.fs!.readdir({
      dirPath: this.directory, success: (result) => resolve(result.files), fail: reject,
    }));
    const entries = new Map<string, DiskEntry>();
    const files = new Map<string, number>();
    const previousByName = new Map([...this.entries.values()].map((entry) => [entry.name, entry]));
    const garbage: string[] = [];
    const confirmedMissing = new Set<string>();
    let unsafe = false;
    for (const name of names) {
      if (!this.validName(name)) { unsafe = true; continue; }
      if (activeTemps.has(this.path(name))) continue;
      try {
        const raw = await this.readRawAsync(name);
        files.set(name, utf8ByteLength(raw));
        const entry = this.parseEntry(raw);
        if (entry && name === this.fileName(entry.meta.key)) entries.set(entry.meta.key, { meta: entry.meta, name });
        else garbage.push(name);
      } catch (error) {
        if (missing(error)) { confirmedMissing.add(name); continue; }
        this.warn("scan failed", error);
        try {
          const size = await new Promise<number>((resolve, reject) => this.fs!.stat({
            path: this.path(name), success: (result) => resolve(result.stats.size), fail: reject,
          }));
          if (!Number.isFinite(size) || size < 0) throw new Error("Unknown file size");
          files.set(name, size);
        } catch (statError) {
          if (missing(statError)) { confirmedMissing.add(name); continue; }
          unsafe = true;
        }
        const previous = previousByName.get(name);
        if (previous) entries.set(previous.meta.key, previous);
      }
    }
    // A directory snapshot alone is not proof of missing for a previously indexed key.
    for (const [name, previous] of previousByName) {
      if (names.includes(name) || activeTemps.has(this.path(name))) continue;
      try {
        const raw = await this.readRawAsync(name);
        files.set(name, utf8ByteLength(raw));
        const entry = this.parseEntry(raw);
        if (entry && name === this.fileName(entry.meta.key)) entries.set(entry.meta.key, { meta: entry.meta, name });
        else garbage.push(name);
      } catch (error) {
        if (missing(error)) confirmedMissing.add(name);
        else {
          entries.set(previous.meta.key, previous);
          const size = this.files.get(name);
          if (size === undefined) unsafe = true;
          else files.set(name, size);
        }
      }
    }
    if (version !== this.stateVersion) return this.scanAsync(deleteInvalid, missingReason);
    // No awaits from here through map publication/callbacks.
    if (deleteInvalid) for (const name of garbage) {
      if (activeTemps.has(this.path(name))) continue;
      try { this.fs!.unlinkSync(this.path(name)); files.delete(name); }
      catch (error) { if (missing(error)) files.delete(name); else this.warn("garbage delete failed", error); }
    }
    // Preparing/live writes are protected even if the older disk entry disappeared.
    for (const [key, previous] of this.entries) {
      if ((revisions.get(key) !== this.getRevision(key) || this.hasPending(key)) && !entries.has(key)) {
        entries.set(key, previous);
        const bytes = this.files.get(previous.name);
        if (bytes !== undefined) files.set(previous.name, bytes);
      }
    }
    this.entries = entries;
    this.accessOrder = this.accessOrder.filter(key => entries.has(key));
    this.files = files;
    this.unsafeSize = unsafe;
    this.stateVersion++;
    for (const name of confirmedMissing) {
      const previous = previousByName.get(name);
      if (previous && revisions.get(previous.meta.key) === this.getRevision(previous.meta.key) && !this.hasPending(previous.meta.key)) {
        this.removed(previous.meta.key, missingReason);
      }
    }
  }

  private async makeRoomAsync(extraBytes: number, key?: string): Promise<boolean> {
    if (this.unsafeSize || this.maxEntries === 0) return false;
    for (const entry of this.evictionCandidates(key)) {
      if (entry.meta.expiresAt >= Date.now() && this.fits(extraBytes, key)) break;
      this.invalidateKey(entry.meta.key);
      await this.removeCheckedAsync(entry.meta.key, this.getRevision(entry.meta.key));
    }
    return this.fits(extraBytes, key);
  }

  private ensureReady(forWrite = false): boolean {
    if (this.rootDeleted && !forWrite) return false;
    // Never interleave synchronous mutations with an async target validation.
    const root = this.requestedCacheRoot();
    if (this.initializing || this.asyncCommitActive || this.fullClearActive || (root && clearingRoots.has(root))) return false;
    if (this.initialized) return true;
    try {
      if (!this.acquire(false)) return false;
      const fs = this.fs!;
      try { fs.accessSync(this.directory); }
      catch (error) {
        if (!missing(error)) throw error;
        fs.mkdirSync(this.directory, true);
      }
      this.migrateLegacy();
      this.scan();
      this.initialized = true;
      this.rootDeleted = false;
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
    const revisions = new Map([...this.entries.keys()].map((key) => [key, this.getRevision(key)]));
    const absent = new Set<string>();
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
        if (missing(error)) { absent.add(name); continue; }
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
    for (const [name, previous] of previousByName) {
      if (names.includes(name)) continue;
      try {
        const raw = this.fs!.readFileSync(this.path(name), "utf8");
        if (typeof raw !== "string") throw new Error("Expected UTF-8 file contents");
        files.set(name, utf8ByteLength(raw));
        const entry = this.parseEntry(raw);
        if (entry && name === this.fileName(entry.meta.key)) entries.set(entry.meta.key, { meta: entry.meta, name });
      } catch (error) {
        if (missing(error)) absent.add(name);
        else {
          entries.set(previous.meta.key, previous);
          const size = this.files.get(name);
          if (size === undefined) unsafe = true;
          else files.set(name, size);
        }
      }
    }
    for (const [key, previous] of this.entries) if (this.hasPending(key) && !entries.has(key)) {
      entries.set(key, previous);
      const bytes = this.files.get(previous.name);
      if (bytes !== undefined) files.set(previous.name, bytes);
    }
    this.entries = entries;
    this.accessOrder = this.accessOrder.filter(key => entries.has(key));
    this.files = files;
    this.unsafeSize = unsafe;
    this.stateVersion++;
    for (const name of absent) {
      const previous = previousByName.get(name);
      if (previous && revisions.get(previous.meta.key) === this.getRevision(previous.meta.key) && !this.hasPending(previous.meta.key)) {
        this.removed(previous.meta.key, "missing");
      }
    }
  }

  private prepare(key: string, payload: string, meta: CacheMeta): { write: PendingWrite; serialized: string } | null {
    if (!isTopicFileKey(key)) return null;
    const generation = this.invalidateKey(key);
    if (typeof payload !== "string" || !validMeta(meta) || meta.key !== key || !this.ensureReady(true)) return null;
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
    }
  }

  private publish(write: PendingWrite, destinationChecked = false): boolean {
    if (!this.isCurrent(write) || (!destinationChecked && !this.destinationMatches(write.key))) return false;
    const name = this.fileName(write.key);
    // Do not unlink the old destination first. Rename success is not an atomicity promise.
    this.fs!.renameSync(this.path(write.name), this.path(name));
    this.files.set(name, write.bytes);
    this.entries.set(write.key, { meta: write.meta, name });
    this.touch(write.key);
    // Reads begun during this pending write must become stale even after finish.
    this.invalidateKey(write.key);
    this.stateVersion++;
    // Index tracking/source cleanup must share this commit, not race after await.
    try { this.onPublished?.(write.key, { ...write.meta }); }
    catch (error) { this.warn("publication callback failed", error); }
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
      // Revisions survive completion so stale reads/migrations never match again.
      this.stateVersion++;
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

  private fits(extraBytes: number, key?: string): boolean {
    const keys = new Set(this.entries.keys());
    for (const write of this.pending.values()) if (this.isCurrent(write) && write.reserved !== false) keys.add(write.key);
    if (key !== undefined) keys.add(key);
    let bytes = [...this.files.values()].reduce((sum, value) => sum + value, 0);
    for (const [path, reserved] of activeTemps) if (path.startsWith(`${this.directory}/`)) bytes += reserved;
    return keys.size <= this.maxEntries && bytes + extraBytes <= this.maxBytes;
  }

  private evictionCandidates(key?: string): DiskEntry[] {
    const compare = evictionComparator(this.getAccessOrder?.() ?? this.accessOrder);
    return [...this.entries.values()]
      .filter(entry => entry.meta.key !== key && !this.hasPending(entry.meta.key))
      .sort((a, b) => compare(a.meta, b.meta));
  }

  private makeRoom(extraBytes: number, key?: string): boolean {
    if (this.unsafeSize || this.maxEntries === 0) return false;
    for (const entry of this.evictionCandidates(key)) {
      if (entry.meta.expiresAt >= Date.now() && this.fits(extraBytes, key)) break;
      this.remove(entry.meta.key);
    }
    return this.fits(extraBytes, key);
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
    this.accessOrder = this.accessOrder.filter(key => this.entries.has(key));
    this.stateVersion++;
  }

  private removed(key: string, reason: RemovalReason): void {
    const name = this.fileName(key);
    // A hash collision is never grounds to forget another key's metadata.
    this.entries.delete(key);
    this.accessOrder = this.accessOrder.filter(candidate => candidate !== key);
    if (![...this.entries.values()].some((entry) => entry.name === name)) this.files.delete(name);
    this.stateVersion++;
    try { this.onRemoved?.(key, reason); }
    catch (error) { this.warn("removal callback failed", error); }
  }

  private invalidateKey(key: string): number {
    const generation = (this.generations.get(key) || 0) + 1;
    this.generations.set(key, generation);
    return generation;
  }

  private invalidateCategory(category?: CacheCategory): void {
    if (category !== undefined && !CATEGORIES.includes(category)) throw new Error("Invalid cache category");
    if (category === undefined) this.epoch++;
    else {
      this.categoryEpochs.set(category, this.categoryEpoch(category) + 1);
      const keys = new Set([...this.entries].filter(([, entry]) => entry.meta.category === category).map(([key]) => key));
      for (const write of this.pending.values()) if (write.meta.category === category) keys.add(write.key);
      // Unknown legacy keys remain conservative; known unrelated keys stay stable.
      for (const key of this.generations.keys()) {
        if (!this.entries.has(key) && ![...this.pending.values()].some((write) => write.key === key)) keys.add(key);
      }
      for (const key of keys) this.invalidateKey(key);
    }
  }

  private categoryEpoch(category: CacheCategory): number {
    return this.categoryEpochs.get(category) || 0;
  }

  private isCurrent(write: PendingWrite): boolean {
    const root = this.requestedCacheRoot();
    return !(root && clearingRoots.has(root)) && write.generation === this.generations.get(write.key) && write.epoch === this.epoch &&
      write.categoryEpoch === this.categoryEpoch(write.meta.category);
  }

  private requestedCacheRoot(): string {
    const root = Taro.env?.USER_DATA_PATH;
    return typeof root === "string" && root ? `${root.replace(/\/$/, "")}/caches` : "";
  }

  private cacheRoot(): string {
    return this.directory.slice(0, -(DIRECTORY.length + 1));
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
