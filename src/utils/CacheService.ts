import Taro from "@tarojs/taro";
import type { ICacheService } from "guanggu-forum-api";

const META_PREFIX = "__cache_meta_";
const INDEX_KEY = "__cache_index__";
const LAST_CLEANUP_KEY = "__cache_cleanup_date__";
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TTL = 30 * 60 * 1000; // 30 min

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
    if (NON_CLEARABLE_CATEGORIES.has(this.category)) return 0;
    const metas = this.cs.getAllMeta().filter((m) => m.category === this.category);
    let removed = 0;
    for (const meta of metas) {
      this.cs.remove(meta.key);
      removed++;
    }
    return removed;
  }

  getAllMeta(): CacheMeta[] {
    return this.cs.getAllMeta().filter((m) => m.category === this.category);
  }
}

class CacheService implements ICacheService {
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  // ─── Category Access ───

  category(cat: CacheCategory): CategoryAccessor {
    return new CategoryAccessor(this, cat);
  }

  getAllCategoryStats(): CategoryStats[] {
    return Object.values(CacheCategory)
      .map((cat) => this.category(cat).getStats())
      .filter((s) => s.count > 0);
  }

  // ─── Core ───

  get<T = any>(key: string): T | null {
    this.ensureNotExpired(key);
    try {
      const raw = Taro.getStorageSync(key);
      if (!raw) return null;
      if (typeof raw === "string") {
        try { return JSON.parse(raw) as T; } catch { return raw as T; }
      }
      return raw as T;
    } catch (e) {
      console.warn("[CacheService] get failed", key, e);
    }
    return null;
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
    const ttl = options.ttl ?? DEFAULT_TTL;
    const priority = options.priority ?? "normal";
    const category = options.category;
    const clearable = !NON_CLEARABLE_CATEGORIES.has(category);
    const stored = typeof value === "string" ? value : JSON.stringify(value);

    try {
      Taro.setStorageSync(key, stored);
    } catch (e) {
      console.warn("[CacheService] set failed, evicting and retrying", key, e);
      this.evict(clearable ? 0.2 : 0.1);
      try {
        Taro.setStorageSync(key, stored);
      } catch (e2) {
        console.warn("[CacheService] set retry failed", key, e2);
        return false;
      }
    }

    this.saveMeta(key, {
      key,
      size: this.approxSize(stored),
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      priority,
      category,
    });
    this.trackKey(key);
    return true;
  }

  remove(key: string, force = false) {
    if (!force) {
      const meta = this.getMeta(key);
      if (meta && NON_CLEARABLE_CATEGORIES.has(meta.category)) return;
    }
    try { Taro.removeStorageSync(key); } catch (e) { console.warn("[CacheService] remove failed", key, e); }
    try { Taro.removeStorageSync(META_PREFIX + key); } catch {}
    this.untrackKey(key);
  }

  // ─── Meta ───

  getMeta(key: string): CacheMeta | null {
    try {
      const raw = Taro.getStorageSync(META_PREFIX + key);
      if (raw) return JSON.parse(raw) as CacheMeta;
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
        this.remove(meta.key);
        removed++;
      }
    }
    return removed;
  }

  // ─── Eviction ───

  evict(ratio = 0.2): number {
    const metas = this.getAllMeta()
      .filter((m) => !NON_CLEARABLE_CATEGORIES.has(m.category))
      .sort((a, b) => {
        const p: Record<string, number> = { low: 0, normal: 1, high: 2 };
        if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
        return a.createdAt - b.createdAt;
      });
    const count = Math.max(10, Math.floor(metas.length * ratio));
    let removed = 0;
    for (let i = 0; i < count && i < metas.length; i++) {
      this.remove(metas[i].key);
      removed++;
    }
    return removed;
  }

  clearAll(onlyClearable = true): number {
    const metas = this.getAllMeta();
    let removed = 0;
    for (const meta of metas) {
      if (onlyClearable && NON_CLEARABLE_CATEGORIES.has(meta.category)) continue;
      this.remove(meta.key, !onlyClearable);
      removed++;
    }
    return removed;
  }

  // ─── Stats ───

  getTotalSize(): number {
    return this.getAllMeta().reduce((sum, m) => sum + m.size, 0);
  }

  getEntryCount(): number {
    return this.getIndex().keys.length;
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
      this.removeExpired();
      const index = this.getIndex();
      const validKeys: string[] = [];
      for (const key of index.keys) {
        const meta = this.getMeta(key);
        if (!meta) continue;
        if (NON_CLEARABLE_CATEGORIES.has(meta.category)) { validKeys.push(key); continue; }
        try {
          const val = Taro.getStorageSync(key);
          if (val) validKeys.push(key);
        } catch (e) {
          console.warn("[CacheService] dailyCleanup check failed", key, e);
        }
      }
      index.keys = validKeys;
      while (index.keys.length > this.maxEntries) {
        const oldest = index.keys.shift()!;
        const meta = this.getMeta(oldest);
        if (meta && NON_CLEARABLE_CATEGORIES.has(meta.category)) { index.keys.push(oldest); continue; }
        this.remove(oldest);
      }
      this.saveIndex(index);
      console.log(`[CacheService] dailyCleanup: ${validKeys.length} valid entries`);
    }, 0);
  }

  // ─── Internal ───

  private saveMeta(key: string, meta: CacheMeta) {
    try {
      Taro.setStorageSync(META_PREFIX + key, JSON.stringify(meta));
    } catch (e) {
      console.warn("[CacheService] saveMeta failed", key, e);
    }
  }

  private ensureNotExpired(key: string) {
    if (this.isExpired(key)) {
      this.remove(key);
    }
  }

  private getIndex(): CacheIndex {
    try {
      const raw = Taro.getStorageSync(INDEX_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("[CacheService] getIndex failed", e);
    }
    return { keys: [] };
  }

  private saveIndex(index: CacheIndex) {
    try {
      Taro.setStorageSync(INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn("[CacheService] saveIndex failed", e);
    }
  }

  private trackKey(key: string) {
    const index = this.getIndex();
    const idx = index.keys.indexOf(key);
    if (idx !== -1) index.keys.splice(idx, 1);
    index.keys.push(key);
    while (index.keys.length > this.maxEntries) {
      const oldest = index.keys.shift()!;
      this.remove(oldest);
    }
    this.saveIndex(index);
  }

  private untrackKey(key: string) {
    const index = this.getIndex();
    const idx = index.keys.indexOf(key);
    if (idx !== -1) {
      index.keys.splice(idx, 1);
      this.saveIndex(index);
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
