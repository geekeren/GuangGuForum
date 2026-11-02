import Taro from "@tarojs/taro";
import type { ICacheService } from "guanggu-forum-api";
import TopicFileCache, { isTopicFileKey } from "./TopicFileCache";
import { expirationFor, evictionComparator, STORAGE_HIGH_WATER, STORAGE_LOW_WATER, utf8Size } from "./cachePolicy";

const META_PREFIX = "__cache_meta_";
const INDEX_KEY = "__cache_index__";
const LAST_CLEANUP_KEY = "__cache_cleanup_date__";
const DEFAULT_MAX_ENTRIES = 1000;

type CachePriority = "low" | "normal" | "high";

export enum CacheCategory {
  Topic = "topic",
  Node = "node",
  User = "user",
  Link = "link",
  System = "system",
  Other = "other",
}

const CATEGORY_LABELS: Record<CacheCategory, string> = {
  [CacheCategory.Topic]: "帖子缓存",
  [CacheCategory.Node]: "节点缓存",
  [CacheCategory.User]: "用户主页缓存",
  [CacheCategory.Link]: "链接预览",
  [CacheCategory.System]: "系统数据",
  [CacheCategory.Other]: "其他",
};

const NON_CLEARABLE_CATEGORIES = new Set<CacheCategory>([CacheCategory.System]);
export const CACHE_UPGRADE_VERSION = "2026-11-01-v3";

const SYSTEM_STORAGE_KEYS = new Set([
  "cookies", "current_username", "saved_accounts", "search_preferences", "search_history",
  "add_to_desktop_already_added", "theme_preference", "comment_emoji_usage", "image_compression_enabled",
]);
const AUTH_STORAGE_KEY = /(?:^|[_-])(?:cookies?|password|passwd|pwd|tokens?|session|credentials?|secret|private[_-]?key)(?:$|[_-])/i;
const LEGACY_BUSINESS_KEYS = new Set(["node_navigation", "legacy_node_navigation", "topic_index"]);

function isSystemKey(key: string): boolean {
  return SYSTEM_STORAGE_KEYS.has(key) || key.startsWith("cache_upgrade_") || key.startsWith("recent_viewed_topics_v1_") || AUTH_STORAGE_KEY.test(key);
}

function isLegacyBusinessKey(key: string): boolean {
  return key.startsWith("html_") || key.startsWith("link_html_") || LEGACY_BUSINESS_KEYS.has(key);
}

export interface CacheMeta {
  key: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  priority: CachePriority;
  category: CacheCategory;
}

export interface CategoryStats {
  category: CacheCategory;
  label: string;
  count: number;
  size: number;
}

interface CacheIndex {
  keys: string[];
}

class CategoryAccessor {
  constructor(private cs: CacheService, private category: CacheCategory) {}

  getStats(): CategoryStats {
    const metas = this.cs.getAllMeta().filter((m) => m.category === this.category);
    return {
      category: this.category,
      label: CATEGORY_LABELS[this.category],
      count: metas.length,
      size: metas.reduce((sum, m) => sum + m.size, 0),
    };
  }

  clear(): number {
    return this.cs.clearCategory(this.category);
  }

  getAllMeta(): CacheMeta[] {
    return this.cs.getAllMeta().filter((m) => m.category === this.category);
  }
}

class CacheService implements ICacheService {
  private maxEntries: number;
  private topicFiles: TopicFileCache;
  private fileReads = new Map<string, { revision: string; promise: Promise<any> }>();
  private indexTrim: Promise<void> | null = null;
  private deferredRemovals = new Map<string, "missing" | "deleted">();
  private confirmedMissing = new Map<string, string>();

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.topicFiles = new TopicFileCache(maxEntries, undefined, (key, reason) => {
      this.onFileRemoved(key, reason);
    }, key => {
      // Commit storage references with file publication, not an await-later callback.
      this.deferredRemovals.delete(key);
      this.confirmedMissing.delete(key);
      this.removeLegacyTopicKey(key);
      this.trackKey(key);
    }, () => this.getIndex().keys);
  }

  private onFileRemoved(key: string, reason: "missing" | "deleted") {
    if (reason === "missing") this.confirmedMissing.set(key, this.topicFiles.getRevision(key));
    else this.confirmedMissing.delete(key);
    try {
      // Missing legacy payloads may still be migrated. Never erase their only source.
      if (reason === "missing" && this.getStorageMeta(key, true)) return;
      if (reason === "deleted") this.removeLegacyTopicKey(key, true);
      this.untrackKey(key, true);
      this.deferredRemovals.delete(key);
    } catch {
      this.deferredRemovals.set(key, reason);
      console.warn("[CacheService] file index removal deferred");
    }
  }

  // ─── Category Access ───

  category(cat: CacheCategory): CategoryAccessor {
    return new CategoryAccessor(this, cat);
  }

  getAllCategoryStats(): CategoryStats[] {
    return this.categoryStats(this.getAllMeta());
  }

  async getAllCategoryStatsAsync(): Promise<CategoryStats[]> {
    return this.categoryStats(await this.getAllMetaAsync());
  }

  private categoryStats(metas: CacheMeta[]): CategoryStats[] {
    const stats = new Map(Object.values(CacheCategory).map(category => [category, {
      category, label: CATEGORY_LABELS[category], count: 0, size: 0,
    }]));
    for (const meta of metas) {
      const stat = stats.get(meta.category)!;
      stat.count++;
      stat.size += meta.size;
    }
    return [...stats.values()].filter(stat => stat.count > 0);
  }

  // ─── Core ───

  get<T = any>(key: string): T | null {
    if (isTopicFileKey(key)) {
      this.migrateTopicKey(key);
      const entry = this.topicFiles.get(key);
      if (!entry) {
        this.reconcileFileIndex();
        return null;
      }
      this.touchKey(key);
      try { return JSON.parse(entry.payload) as T; } catch { return entry.payload as T; }
    }
    this.ensureNotExpired(key);
    try {
      const raw = Taro.getStorageSync(key);
      if (!raw) return null;
      let value = raw;
      if (typeof raw === "string") {
        try { value = JSON.parse(raw); } catch {}
      }
      if (isSystemKey(key) && this.getMeta(key)?.category !== CacheCategory.System) {
        this.saveMeta(key, {
          key, size: this.approxSize(raw), createdAt: Date.now(),
          expiresAt: expirationFor(undefined, Date.now()), priority: "normal", category: CacheCategory.System,
        });
        this.trackKey(key);
      }
      if (this.getStorageMeta(key)) this.touchKey(key);
      return value as T;
    } catch (e) {
      console.warn("[CacheService] get failed", key, e);
    }
    return null;
  }

  getAsync<T = any>(key: string): Promise<T | null> {
    if (!isTopicFileKey(key)) return Promise.resolve(this.get<T>(key));
    const revision = this.topicFiles.getRevision(key);
    const pending = this.fileReads.get(key);
    if (pending?.revision === revision) return pending.promise;
    const promise = this.readAndMigrateFile<T>(key, revision).catch(() => {
      console.warn("[CacheService] file cache read deferred");
      return null;
    });
    this.fileReads.set(key, { revision, promise });
    void promise.finally(() => {
      if (this.fileReads.get(key)?.promise === promise) this.fileReads.delete(key);
    });
    return promise;
  }

  private async readAndMigrateFile<T>(key: string, revision: string): Promise<T | null> {
    let entry = await this.topicFiles.getAsync(key);
    if (this.topicFiles.getRevision(key) !== revision) return null;
    if (!entry && this.confirmedMissing.get(key) === revision && !this.topicFiles.hasPending(key)) {
      const meta = this.getStorageMeta(key);
      if (meta && meta.category !== CacheCategory.System) {
        if (Date.now() > meta.expiresAt) {
          // Discard only the expired storage source, not an unreadable destination.
          this.removeLegacyTopicKey(key);
        } else {
          const raw = Taro.getStorageSync(key);
          if (raw) {
            const payload = typeof raw === "string" ? raw : JSON.stringify(raw);
            const published = await this.topicFiles.setAsync(key, payload, meta, revision);
            if (published) {
              revision = this.topicFiles.getRevision(key);
              entry = await this.topicFiles.getAsync(key);
            }
          }
        }
      }
    }
    if (!entry || this.topicFiles.getRevision(key) !== revision) return null;
    this.confirmedMissing.delete(key);
    // No awaits between checking current metadata and updating the storage index.
    const current = this.topicFiles.getMetaCached(key);
    if (!current || current.createdAt !== entry.meta.createdAt || this.topicFiles.hasPending(key)) return null;
    this.removeLegacyTopicKey(key);
    this.touchKey(key);
    try { return JSON.parse(entry.payload) as T; } catch { return entry.payload as T; }
  }

  set(
    key: string,
    value: any,
    options: {
      category: CacheCategory;
      ttl?: number;
      priority?: CachePriority;
    },
  ): boolean {
    const expiresAt = expirationFor(options.ttl, Date.now());
    const priority = options.priority ?? "normal";
    const category = isSystemKey(key) ? CacheCategory.System : options.category;
    const clearable = !NON_CLEARABLE_CATEGORIES.has(category);
    const stored = typeof value === "string" ? value : JSON.stringify(value);

    if (isTopicFileKey(key)) {
      const success = this.topicFiles.set(key, stored, {
        key, size: 0, createdAt: Date.now(), expiresAt,
        priority, category: options.category,
      });
      if (success && this.topicFiles.getMetaCached(key)) {
        this.removeLegacyTopicKey(key);
        this.trackKey(key);
        this.reconcileFileIndex();
      }
      return success;
    }

    if (!this.prepareStorageWrite(key, stored, clearable)) return false;
    try {
      Taro.setStorageSync(key, stored);
    } catch (e) {
      console.warn("[CacheService] set failed, evicting and retrying", key, e);
      this.evict(clearable ? 0.2 : 0.1, key);
      try {
        Taro.setStorageSync(key, stored);
      } catch (e2) {
        console.warn("[CacheService] set retry failed", key, e2);
        return false;
      }
    }

    const metadataSaved = this.saveMeta(key, {
      key,
      size: this.approxSize(stored),
      createdAt: Date.now(),
      expiresAt,
      priority,
      category,
    });
    if (!metadataSaved) return false;
    this.trackKey(key);
    return true;
  }

  async setAsync(
    key: string,
    value: any,
    options: {
      category: CacheCategory;
      ttl?: number;
      priority?: CachePriority;
    },
  ): Promise<boolean> {
    const expiresAt = expirationFor(options.ttl, Date.now());
    const priority = options.priority ?? "normal";
    const stored = typeof value === "string" ? value : JSON.stringify(value);

    if (isTopicFileKey(key)) {
      const write = this.topicFiles.setAsync(key, stored, {
        key, size: 0, createdAt: Date.now(), expiresAt,
        priority, category: options.category,
      });
      return await write;
    }

    // Keep storage writes ordered without yielding between quota checks,
    // payload and metadata. Multiple storage keys are not a durable transaction.
    // File payloads above retain fully asynchronous I/O.
    return this.set(key, value, options);
  }

  remove(key: string, force = false) {
    if (isTopicFileKey(key)) {
      // Cache invalidation must not turn a usable network response into an error.
      if (!this.topicFiles.remove(key)) {
        console.warn("[CacheService] topic invalidation deferred");
        return;
      }
      return; // The backend callback cleaned the index at the deletion commit.
    }
    if (!force) {
      if (isSystemKey(key)) return;
      const meta = this.getMeta(key);
      if (meta && NON_CLEARABLE_CATEGORIES.has(meta.category)) return;
    }
    try { Taro.removeStorageSync(key); } catch (e) { console.warn("[CacheService] remove failed", key, e); }
    try { Taro.removeStorageSync(META_PREFIX + key); } catch {}
    this.untrackKey(key);
  }

  async removeAsync(key: string, force = false): Promise<boolean> {
    if (!isTopicFileKey(key)) {
      if (!force && (isSystemKey(key) || this.getStorageMeta(key)?.category === CacheCategory.System)) return false;
      try {
        Taro.removeStorageSync(key);
        Taro.removeStorageSync(META_PREFIX + key);
        this.untrackKey(key, true);
        return true;
      } catch { console.warn("[CacheService] storage deletion deferred"); return false; }
    }
    // Backend callback untracks in the same commit as deletion, before a new write.
    const success = await this.topicFiles.removeAsync(key);
    if (!success) console.warn("[CacheService] file invalidation deferred");
    return success && !this.deferredRemovals.has(key);
  }

  // ─── Meta ───

  getMeta(key: string, strict = false): CacheMeta | null {
    if (isTopicFileKey(key)) {
      const meta = this.topicFiles.getMeta(key);
      if (meta) return meta;
    }
    return this.getStorageMeta(key, strict);
  }

  private getStorageMeta(key: string, strict = false): CacheMeta | null {
    let raw: any;
    try {
      raw = Taro.getStorageSync(META_PREFIX + key);
    } catch (e) {
      if (strict) throw e;
      console.warn("[CacheService] getMeta failed", key, e);
      return null;
    }
    try {
      if (!raw) return null;
      const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (meta && meta.key === key && typeof meta.createdAt === "number" &&
          typeof meta.expiresAt === "number" && typeof meta.size === "number" &&
          Object.values(CacheCategory).includes(meta.category) &&
          ["low", "normal", "high"].includes(meta.priority)) return meta as CacheMeta;
    } catch (e) {
      console.warn("[CacheService] getMeta failed", key, e);
    }
    return null;
  }

  getAllMeta(): CacheMeta[] {
    const index = this.getIndex();
    const metas: CacheMeta[] = [];
    for (const key of index.keys) {
      const meta = this.getMeta(key);
      if (meta) metas.push(meta);
    }
    for (const key of this.legacyTopicKeys()) {
      const meta = this.getStorageMeta(key);
      if (meta) metas.push(meta);
    }
    const byKey = new Map(metas.map(meta => [meta.key, meta]));
    for (const meta of this.topicFiles.getAllMeta()) byKey.set(meta.key, meta);
    return [...byKey.values()];
  }

  async getAllMetaAsync(): Promise<CacheMeta[]> {
    const files = await this.topicFiles.getAllMetaAsync();
    const metas = new Map(this.storageMetas().map(meta => [meta.key, meta]));
    for (const meta of files) metas.set(meta.key, meta);
    return [...metas.values()];
  }

  private storageMetas(): CacheMeta[] {
    const keys = new Set([...this.getIndex().keys, ...this.legacyTopicKeys()]);
    const metas: CacheMeta[] = [];
    for (const key of keys) {
      const meta = this.getStorageMeta(key);
      if (meta) metas.push(meta);
    }
    return metas;
  }

  // ─── Expiration ───

  isExpired(key: string): boolean {
    const meta = this.getMeta(key);
    if (!meta) return true;
    return Date.now() > meta.expiresAt;
  }

  removeExpired(): number {
    const metas = this.getAllMeta();
    let removed = 0;
    for (const meta of metas) {
      if (NON_CLEARABLE_CATEGORIES.has(meta.category)) continue;
      if (Date.now() > meta.expiresAt) {
        if (isTopicFileKey(meta.key) && this.topicFiles.hasPending(meta.key)) continue;
        this.remove(meta.key);
        removed++;
      }
    }
    return removed;
  }

  async removeExpiredAsync(): Promise<number> {
    const metas = await this.getAllMetaAsync();
    let removed = 0;
    for (const meta of metas) {
      if (NON_CLEARABLE_CATEGORIES.has(meta.category) || Date.now() <= meta.expiresAt) continue;
      if (isTopicFileKey(meta.key) && this.topicFiles.hasPending(meta.key)) continue;
      // Any earlier deletion may yield while another file OR storage key refreshes.
      const current = (isTopicFileKey(meta.key) ? this.topicFiles.getMetaCached(meta.key) : null) || this.getStorageMeta(meta.key);
      if (current && (NON_CLEARABLE_CATEGORIES.has(current.category) || Date.now() <= current.expiresAt)) continue;
      if (await this.removeAsync(meta.key)) removed++;
    }
    return removed;
  }

  // ─── Eviction ───

  private storageEvictionCandidates(exclude?: string): CacheMeta[] {
    // Storage pressure must not initialize or scan the file backend.
    return this.storageMetas()
      .filter(meta => meta.key !== exclude && !isSystemKey(meta.key) &&
        !NON_CLEARABLE_CATEGORIES.has(meta.category))
      .sort(evictionComparator(this.getIndex().keys));
  }

  private storageUsage(): { used: number; limit: number } | null {
    try {
      const { currentSize, limitSize } = Taro.getStorageInfoSync();
      if (!Number.isFinite(currentSize) || currentSize < 0 ||
        !Number.isFinite(limitSize) || limitSize <= 0) return null;
      return { used: currentSize * 1024, limit: limitSize * 1024 };
    } catch { return null; }
  }

  private prepareStorageWrite(key: string, stored: string, clearable: boolean): boolean {
    const usage = this.storageUsage();
    if (!usage) return true; // Quota failure still has eviction/retry fallback.
    let previous = 0;
    try {
      const raw = Taro.getStorageSync(key);
      if (raw !== "" && raw !== undefined && raw !== null) {
        previous = utf8Size(typeof raw === "string" ? raw : JSON.stringify(raw));
      }
    } catch {}
    const size = utf8Size(stored);
    // Reserve room for metadata, the new index key and storage accounting.
    const overhead = utf8Size(key) * 4 + 1024;
    if (clearable && size + overhead > usage.limit * STORAGE_HIGH_WATER) return false;
    const growth = Math.max(0, size - previous) + overhead;
    if (usage.used + growth <= usage.limit * STORAGE_HIGH_WATER) return true;
    for (const meta of this.storageEvictionCandidates(key)) {
      if (isTopicFileKey(meta.key)) this.removeLegacyTopicKey(meta.key);
      else this.remove(meta.key);
      const current = this.storageUsage();
      if (current && current.used + growth <= current.limit * STORAGE_LOW_WATER) break;
    }
    const current = this.storageUsage();
    // Never evict the old value of an oversized/failed replacement.
    // Protected system writes still attempt the platform quota.
    return !clearable || !current || current.used + growth <= current.limit * STORAGE_HIGH_WATER;
  }

  evict(ratio = 0.2, exclude?: string): number {
    const metas = this.storageEvictionCandidates(exclude);
    const count = Math.max(10, Math.floor(metas.length * ratio));
    let removed = 0;
    for (let i = 0; i < count && i < metas.length; i++) {
      const key = metas[i].key;
      if (isTopicFileKey(key)) {
        // Evict only the storage copy; never invalidate a file or pending write.
        if (this.removeLegacyTopicKey(key)) removed++;
      } else { this.remove(key); removed++; }
    }
    return removed;
  }

  clearCategory(category: CacheCategory): number {
    if (NON_CLEARABLE_CATEGORIES.has(category)) return 0;
    const metas = this.getAllMeta().filter(meta => meta.category === category);
    // Invalidate pending writes before enumerating/deleting published entries.
    let removed = this.topicFiles.clear(category);
    for (const meta of metas) {
      if (isTopicFileKey(meta.key)) this.removeLegacyTopicKey(meta.key, true, true);
      else { this.remove(meta.key); removed++; }
    }
    for (const key of this.legacyTopicKeys()) {
      if (this.getStorageMeta(key)?.category === category) this.removeLegacyTopicKey(key, true, true);
    }
    this.reconcileFileIndex();
    return removed;
  }

  clearAll(onlyClearable = true): number {
    const metas = this.getAllMeta();
    // A failed file cleanup must not proceed to erase account storage.
    let removed = this.topicFiles.clear();
    if (onlyClearable) {
      for (const meta of metas) {
        if (NON_CLEARABLE_CATEGORIES.has(meta.category)) continue;
        if (isTopicFileKey(meta.key)) this.removeLegacyTopicKey(meta.key, true, true);
        else { this.remove(meta.key, false); removed++; }
      }
      for (const key of this.legacyTopicKeys()) {
        if (this.getStorageMeta(key)?.category !== CacheCategory.System) this.removeLegacyTopicKey(key, true, true);
      }
      this.reconcileFileIndex();
      return removed;
    }
    Taro.clearStorageSync();
    this.saveIndex({ keys: [] });
    return removed;
  }

  async clearCategoryAsync(category: CacheCategory): Promise<number> {
    if (NON_CLEARABLE_CATEGORIES.has(category)) return 0;
    return this.clearAsync(category, true);
  }

  async clearAllAsync(onlyClearable = true): Promise<number> {
    return this.clearAsync(undefined, onlyClearable);
  }

  private async clearAsync(category: CacheCategory | undefined, onlyClearable: boolean): Promise<number> {
    // Invalidate pending file work before the first await, including cold preparation.
    const clearing = this.topicFiles.clearAsync(category);
    const storage = this.storageMetas();
    const fileKeys = [...new Set([...this.getIndex().keys, ...this.legacyTopicKeys()])].filter(isTopicFileKey);
    const revisions = new Map(fileKeys.map(key => [key, this.topicFiles.getRevision(key)]));
    let removed = await clearing; // Failure must not erase account storage.
    for (const key of fileKeys) {
      if (this.topicFiles.getRevision(key) !== revisions.get(key) || this.topicFiles.hasPending(key)) continue;
      if (!this.getIndex().keys.includes(key) && !this.getStorageMeta(key)) continue;
      const meta = this.topicFiles.getMetaCached(key) || this.getStorageMeta(key);
      if (category !== undefined && meta?.category !== category) continue;
      if (onlyClearable && meta?.category === CacheCategory.System) continue;
      if (!await this.removeAsync(key)) throw new Error("文件缓存清理失败");
    }
    await this.reconcileFileIndexAsync();
    if (this.deferredRemovals.size) throw new Error("文件缓存索引清理失败");
    if (!onlyClearable) {
      Taro.clearStorageSync();
      this.saveIndex({ keys: [] }, true);
      // New writes begun after the clear epoch are not old pending work.
      await this.reconcileFileIndexAsync();
      return removed;
    }
    for (const meta of storage) {
      if (isTopicFileKey(meta.key) || NON_CLEARABLE_CATEGORIES.has(meta.category)) continue;
      if (category !== undefined && meta.category !== category) continue;
      if (await this.removeAsync(meta.key)) removed++;
      else throw new Error("Storage 缓存清理失败");
    }
    return removed;
  }

  clearForUpgradeOnce(version: string): boolean {
    const marker = `cache_upgrade_${version}`;
    try {
      // Read the marker directly: missing metadata must not trigger another upgrade.
      const completed = Taro.getStorageSync(marker);
      if (completed === true || completed === "true") return false;
      const keys = Taro.getStorageInfoSync().keys;
      const index = this.getIndex(true);
      const candidates = new Set([
        ...index.keys,
        ...keys.map((key) => key.startsWith(META_PREFIX) ? key.slice(META_PREFIX.length) : key),
      ]);
      const removed = new Set<string>();
      const disposable: string[] = [];
      for (const key of candidates) {
        if (key === INDEX_KEY || key === LAST_CLEANUP_KEY || isSystemKey(key)) continue;
        const meta = this.getMeta(key, true);
        if (meta?.category === CacheCategory.System) continue;
        // Untracked, unknown storage is not evidence that a value is disposable.
        if (meta || isLegacyBusinessKey(key)) disposable.push(key);
      }
      this.topicFiles.clear();
      for (const key of disposable) {
        Taro.removeStorageSync(key);
        Taro.removeStorageSync(META_PREFIX + key);
        removed.add(key);
      }
      // Persist the cleaned index before committing the durable completion marker.
      Taro.setStorageSync(INDEX_KEY, JSON.stringify({ keys: index.keys.filter((key) => !removed.has(key)) }));
      return this.set(marker, true, { category: CacheCategory.System });
    } catch {
      console.warn("[CacheService] upgrade incomplete; will retry on next launch");
      return false;
    }
  }

  // ─── Stats ───

  getTotalSize(): number {
    return this.getAllMeta().reduce((sum, m) => sum + m.size, 0);
  }

  getEntryCount(): number {
    return new Set([...this.getIndex().keys, ...this.topicFiles.getAllMeta().map(meta => meta.key)]).size;
  }

  getStats(): { entryCount: number; totalSize: number; clearableCount: number; nonClearableCount: number; expiredCount: number } {
    const metas = this.getAllMeta();
    const now = Date.now();
    return {
      entryCount: metas.length,
      totalSize: metas.reduce((sum, m) => sum + m.size, 0),
      clearableCount: metas.filter((m) => !NON_CLEARABLE_CATEGORIES.has(m.category)).length,
      nonClearableCount: metas.filter((m) => NON_CLEARABLE_CATEGORIES.has(m.category)).length,
      expiredCount: metas.filter((m) => now > m.expiresAt).length,
    };
  }

  // Move only disposable reading payloads; indexes remain in storage.
  migrateTopicCaches() {
    let keys: string[];
    try {
      keys = [...new Set([...Taro.getStorageInfoSync().keys, ...this.getIndex().keys])]
        .filter(isTopicFileKey);
    } catch { return; }
    let cursor = 0;
    const batch = () => {
      for (let end = Math.min(cursor + 10, keys.length); cursor < end; cursor++) {
        this.migrateTopicKey(keys[cursor]);
      }
      if (cursor < keys.length) setTimeout(batch, 0);
      else this.reconcileFileIndex();
    };
    setTimeout(batch, 0);
  }

  async migrateTopicCachesAsync(): Promise<void> {
    try {
      const keys = [...new Set([...this.legacyTopicKeys(), ...this.getIndex(true).keys])].filter(isTopicFileKey);
      for (let offset = 0; offset < keys.length; offset += 10) {
        await Promise.all(keys.slice(offset, offset + 10).map(key => this.getAsync(key)));
        if (offset + 10 < keys.length) await new Promise(resolve => setTimeout(resolve, 0));
      }
      await this.reconcileFileIndexAsync();
    } catch { console.warn("[CacheService] file migration deferred"); }
  }

  private legacyTopicKeys(): string[] {
    try {
      return Taro.getStorageInfoSync().keys
        .map(key => key.startsWith(META_PREFIX) ? key.slice(META_PREFIX.length) : key)
        .filter(isTopicFileKey);
    } catch { return []; }
  }

  private migrateTopicKey(key: string) {
    if (this.topicFiles.hasPending(key)) return;
    // Never remove the migration source based only on cached disk metadata.
    const current = this.topicFiles.get(key);
    if (current) {
      this.removeLegacyTopicKey(key);
      this.trackKey(key);
      return;
    }
    const meta = this.getStorageMeta(key);
    if (!meta || meta.category === CacheCategory.System) return;
    if (Date.now() > meta.expiresAt) {
      this.removeLegacyTopicKey(key);
      return;
    }
    try {
      const raw = Taro.getStorageSync(key);
      if (!raw) return;
      const payload = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (this.topicFiles.set(key, payload, meta)) {
        this.removeLegacyTopicKey(key);
        this.trackKey(key);
      }
    } catch { console.warn("[CacheService] topic migration deferred"); }
  }

  private removeLegacyTopicKey(key: string, strict = false, untrack = false): boolean {
    try {
      Taro.removeStorageSync(key);
      Taro.removeStorageSync(META_PREFIX + key);
      if (untrack) this.untrackKey(key);
      return true;
    } catch {
      if (strict) throw new Error("旧帖子缓存清理失败");
      console.warn("[CacheService] legacy topic cleanup deferred");
      return false;
    }
  }

  private reconcileFileIndex() {
    try {
      const fileKeys = this.topicFiles.getAllMeta().map(meta => meta.key);
      const index = this.getIndex(true);
      index.keys = [...new Set([
        ...index.keys, // Only confirmed missing/deletion callbacks may remove file references.
        ...fileKeys,
      ])];
      this.saveIndex(index);
    } catch { console.warn("[CacheService] file index reconciliation deferred"); }
  }

  private async reconcileFileIndexAsync(): Promise<void> {
    const files = await this.topicFiles.getAllMetaAsync();
    // Retry failed index commits only if a new file/write has not replaced the key.
    for (const [key, reason] of [...this.deferredRemovals]) {
      if (this.topicFiles.getMetaCached(key) || this.topicFiles.hasPending(key)) this.deferredRemovals.delete(key);
      else this.onFileRemoved(key, reason);
    }
    try {
      const index = this.getIndex(true); // Never commit an await-old storage snapshot.
      for (const meta of files) {
        if (this.topicFiles.getMetaCached(meta.key) && !index.keys.includes(meta.key)) index.keys.push(meta.key);
      }
      // Absence from an in-memory scan is not proof of missing (EIO/corruption).
      this.saveIndex(index, true);
    } catch { console.warn("[CacheService] file index reconciliation deferred"); }
  }

  async dailyCleanupAsync(): Promise<void> {
    try {
      await this.topicFiles.cleanupAsync();
      await this.removeExpiredAsync();
      // Validate file references through actual reads; failures preserve references.
      for (const key of this.getIndex(true).keys.filter(isTopicFileKey)) await this.getAsync(key);
      await this.reconcileFileIndexAsync();
      await this.trimIndexAsync();
    } catch { console.warn("[CacheService] cleanup incomplete; will retry"); }
  }

  // ─── Daily cleanup ───

  shouldRunDailyCleanup(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const last = Taro.getStorageSync(LAST_CLEANUP_KEY);
      if (last === today) return false;
    } catch (e) { console.warn("[CacheService] getCleanupDate failed", e); }
    try {
      Taro.setStorageSync(LAST_CLEANUP_KEY, today);
    } catch (e) { console.warn("[CacheService] setCleanupDate failed", e); }
    return true;
  }

  dailyCleanup() {
    setTimeout(() => {
      this.topicFiles.cleanup();
      try { this.removeExpired(); } catch { console.warn("[CacheService] cleanup incomplete"); }
      const index = this.getIndex();
      const validKeys: string[] = [];
      for (const key of index.keys) {
        const meta = this.getMeta(key);
        if (!meta) { if (isTopicFileKey(key)) validKeys.push(key); continue; }
        if (NON_CLEARABLE_CATEGORIES.has(meta.category)) { validKeys.push(key); continue; }
        try {
          if (isTopicFileKey(key)) {
            validKeys.push(key); // Keep until actual missing/deletion is confirmed.
          } else if (Taro.getStorageSync(key)) validKeys.push(key);
        } catch (e) {
          console.warn("[CacheService] dailyCleanup check failed", key, e);
        }
      }
      index.keys = validKeys;
      this.saveIndex(index);
      void this.trimIndexAsync();
      console.log(`[CacheService] dailyCleanup: ${validKeys.length} valid entries`);
    }, 0);
  }

  // ─── Internal ───

  private saveMeta(key: string, meta: CacheMeta): boolean {
    try {
      Taro.setStorageSync(META_PREFIX + key, JSON.stringify(meta));
      return true;
    } catch (e) {
      console.warn("[CacheService] saveMeta failed", key, e);
      return false;
    }
  }

  private ensureNotExpired(key: string) {
    if (!isSystemKey(key) && this.isExpired(key)) {
      this.remove(key);
    }
  }

  private getIndex(strict = false): CacheIndex {
    let raw: any;
    try {
      raw = Taro.getStorageSync(INDEX_KEY);
    } catch (e) {
      if (strict) throw e;
      console.warn("[CacheService] getIndex failed", e);
      return { keys: [] };
    }
    try {
      if (raw) {
        const index = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(index?.keys)) {
          const keys: string[] = index.keys.filter((key: unknown): key is string => typeof key === "string");
          return { keys: [...new Set(keys)] };
        }
      }
    } catch (e) {
      console.warn("[CacheService] getIndex failed", e);
    }
    return { keys: [] };
  }

  private saveIndex(index: CacheIndex, strict = false) {
    try {
      Taro.setStorageSync(INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      if (strict) throw e;
      console.warn("[CacheService] saveIndex failed", e);
    }
  }

  private touchKey(key: string) {
    // Protected data never participates in LRU. Never replace a failed index
    // read with an empty snapshot: it would orphan still-usable payloads.
    if (isSystemKey(key) || this.getStorageMeta(key)?.category === CacheCategory.System) return;
    let index: CacheIndex;
    try { index = this.getIndex(true); } catch { return; }
    if (index.keys[index.keys.length - 1] === key) return;
    const at = index.keys.indexOf(key);
    if (at !== -1) index.keys.splice(at, 1);
    index.keys.push(key);
    this.saveIndex(index);
  }

  private trackKey(key: string) {
    let index: CacheIndex;
    try { index = this.getIndex(true); }
    catch { console.warn("[CacheService] index update deferred"); return; }
    const idx = index.keys.indexOf(key);
    if (idx !== -1) index.keys.splice(idx, 1);
    index.keys.push(key);
    this.saveIndex(index);
    // Keep references until deletion succeeds; never shift before file removal.
    const attempted = new Set<string>();
    while (this.getIndex().keys.length > this.maxEntries) {
      const oldest = this.getIndex().keys.find(candidate => {
        const meta = this.getStorageMeta(candidate) || this.topicFiles.getMetaCached(candidate);
        return !attempted.has(candidate) && !isSystemKey(candidate) &&
          (meta ? meta.category !== CacheCategory.System : isTopicFileKey(candidate) || isLegacyBusinessKey(candidate));
      });
      if (!oldest) break;
      attempted.add(oldest);
      if (isTopicFileKey(oldest)) {
        void this.trimIndexAsync();
        break;
      }
      this.remove(oldest);
    }
  }

  private trimIndexAsync(): Promise<void> {
    if (this.indexTrim) return this.indexTrim;
    const run = async () => {
      const attempted = new Set<string>();
      while (this.getIndex(true).keys.length > this.maxEntries) {
        const oldest = this.getIndex(true).keys.find(key => {
          const meta = this.getStorageMeta(key) || this.topicFiles.getMetaCached(key);
          return !attempted.has(key) && !isSystemKey(key) &&
            (meta ? meta.category !== CacheCategory.System : isTopicFileKey(key) || isLegacyBusinessKey(key));
        });
        if (!oldest) break;
        attempted.add(oldest);
        if (isTopicFileKey(oldest) && this.topicFiles.hasPending(oldest)) continue;
        await this.removeAsync(oldest);
      }
    };
    this.indexTrim = run().catch(() => { console.warn("[CacheService] index eviction deferred"); })
      .finally(() => { this.indexTrim = null; });
    return this.indexTrim;
  }

  private untrackKey(key: string, strict = false) {
    let index: CacheIndex;
    try { index = this.getIndex(true); }
    catch (error) {
      if (strict) throw error;
      console.warn("[CacheService] index removal deferred"); return;
    }
    const idx = index.keys.indexOf(key);
    if (idx !== -1) {
      index.keys.splice(idx, 1);
      this.saveIndex(index, strict);
    }
  }

  private approxSize(value: any): number {
    if (typeof value === "string") return value.length * 2;
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 0;
    }
  }
}

export const cacheService = new CacheService();
export default CacheService;
