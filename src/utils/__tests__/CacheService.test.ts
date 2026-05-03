import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory store to simulate Taro.getStorageSync/setStorageSync/removeStorageSync
let store: Map<string, any>;

vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (key: string) => store.get(key) ?? "",
    setStorageSync: (key: string, value: any) => { store.set(key, value); },
    removeStorageSync: (key: string) => { store.delete(key); },
  },
}));

import { CacheCategory } from "../CacheService";
import CacheService from "../CacheService";

function createService(maxEntries = 1000) {
  return new CacheService(maxEntries);
}

describe("CacheService", () => {
  let cs: CacheService;

  beforeEach(() => {
    store = new Map();
    cs = createService();
  });

  // ─── set / get 基础 ───

  describe("set & get", () => {
    it("writes and reads a string", () => {
      cs.set("k1", "hello", { category: CacheCategory.Topic });
      expect(cs.get("k1")).toBe("hello");
    });

    it("auto-serializes and deserializes objects", () => {
      cs.set("k2", { name: "test", count: 3 }, { category: CacheCategory.Node });
      const val = cs.get<{ name: string; count: number }>("k2");
      expect(val).toEqual({ name: "test", count: 3 });
    });

    it("returns null for non-existent key", () => {
      expect(cs.get("nope")).toBeNull();
    });

    it("stores value as JSON string in storage", () => {
      cs.set("k3", { a: 1 }, { category: CacheCategory.Other });
      const raw = store.get("k3");
      expect(raw).toBe('{"a":1}');
    });

    it("stores string values directly", () => {
      cs.set("k4", "plain", { category: CacheCategory.Other });
      expect(store.get("k4")).toBe("plain");
    });
  });

  // ─── category ───

  describe("category", () => {
    it("stores category in meta", () => {
      cs.set("k", "v", { category: CacheCategory.Topic });
      const meta = cs.getMeta("k");
      expect(meta?.category).toBe(CacheCategory.Topic);
    });

    it("category() returns CategoryAccessor", () => {
      cs.set("a", "1", { category: CacheCategory.Topic });
      cs.set("b", "2", { category: CacheCategory.Topic });
      cs.set("c", "3", { category: CacheCategory.Node });
      const stats = cs.category(CacheCategory.Topic).getStats();
      expect(stats.count).toBe(2);
      expect(stats.category).toBe(CacheCategory.Topic);
    });

    it("getAllCategoryStats() returns only non-empty categories", () => {
      cs.set("a", "1", { category: CacheCategory.Topic });
      cs.set("b", "2", { category: CacheCategory.Link });
      const all = cs.getAllCategoryStats();
      const cats = all.map((s) => s.category);
      expect(cats).toContain(CacheCategory.Topic);
      expect(cats).toContain(CacheCategory.Link);
      expect(cats).not.toContain(CacheCategory.Node);
    });
  });

  // ─── System 保护 ───

  describe("System category protection", () => {
    it("cannot remove System key without force", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.remove("cookies");
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
    });

    it("can remove System key with force=true", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.remove("cookies", true);
      expect(cs.get("cookies")).toBeNull();
    });

    it("System category clear() returns 0 and does not delete", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      const removed = cs.category(CacheCategory.System).clear();
      expect(removed).toBe(0);
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
    });

    it("evict skips System entries", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.set("topic1", "data", { category: CacheCategory.Topic, priority: "low" });
      cs.evict(1);
      // cookies survived, topic1 may or may not be evicted depending on ratio
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
    });
  });

  // ─── TTL 过期 ───

  describe("TTL expiration", () => {
    it("reads non-expired entry normally", () => {
      cs.set("k", "v", { category: CacheCategory.Topic, ttl: 60000 });
      expect(cs.get("k")).toBe("v");
    });

    it("returns null and auto-removes expired entry", () => {
      cs.set("k", "v", { category: CacheCategory.Topic, ttl: -1 });
      expect(cs.get("k")).toBeNull();
    });

    it("isExpired returns true for expired entry", () => {
      cs.set("k", "v", { category: CacheCategory.Topic, ttl: -1 });
      expect(cs.isExpired("k")).toBe(true);
    });

    it("isExpired returns true for key with no meta", () => {
      expect(cs.isExpired("nope")).toBe(true);
    });

    it("removeExpired clears expired clearable entries", () => {
      cs.set("expired1", "v", { category: CacheCategory.Topic, ttl: -1 });
      cs.set("expired2", "v", { category: CacheCategory.Node, ttl: -1 });
      cs.set("valid", "v", { category: CacheCategory.Topic, ttl: 60000 });
      const removed = cs.removeExpired();
      expect(removed).toBe(2);
      expect(cs.get("valid")).toBe("v");
    });

    it("removeExpired skips System entries even if expired", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System, ttl: -1 });
      const removed = cs.removeExpired();
      expect(removed).toBe(0);
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
    });
  });

  // ─── priority 驱逐 ───

  describe("eviction", () => {
    it("evicts low priority before normal before high", () => {
      // Need enough entries so evict(0.1) only removes low priority
      for (let i = 0; i < 12; i++) {
        cs.set(`low${i}`, "v", { category: CacheCategory.Topic, priority: "low" });
      }
      cs.set("normal1", "v", { category: CacheCategory.Topic, priority: "normal" });
      cs.set("high1", "v", { category: CacheCategory.Topic, priority: "high" });
      cs.evict(0.5);
      // All low entries should be gone, normal and high survive
      expect(cs.get("normal1")).toBe("v");
      expect(cs.get("high1")).toBe("v");
    });

    it("evicts oldest first within same priority", () => {
      // 5 low-priority entries + 8 normal entries = 13 total
      for (let i = 0; i < 5; i++) {
        cs.set(`low${i}`, "v", { category: CacheCategory.Topic, priority: "low" });
      }
      cs.set("old", "v", { category: CacheCategory.Topic, priority: "normal" });
      for (let i = 0; i < 6; i++) {
        cs.set(`norm${i}`, "v", { category: CacheCategory.Topic, priority: "normal" });
      }
      cs.set("new", "v", { category: CacheCategory.Topic, priority: "normal" });
      cs.evict(0.5);
      // 13 entries * 0.5 = 6.5 → floor=6, but max(10,6)=10 evicted
      // Sorted: 5 low + 8 normal (by createdAt). Remove first 10: 5 low + 5 normal.
      // "old" is the oldest normal entry so it is removed; "new" is newest so it survives.
      expect(cs.get("old")).toBeNull();
      expect(cs.get("new")).toBe("v");
    });
  });

  // ─── maxEntries ───

  describe("maxEntries", () => {
    it("evicts oldest when exceeding maxEntries", () => {
      const small = createService(3);
      small.set("a", "val1", { category: CacheCategory.Topic });
      small.set("b", "val2", { category: CacheCategory.Topic });
      small.set("c", "val3", { category: CacheCategory.Topic });
      small.set("d", "val4", { category: CacheCategory.Topic });
      expect(small.get("a")).toBeNull();
      expect(small.get("d")).toBe("val4");
    });
  });

  // ─── set 重试 ───

  describe("set retry on failure", () => {
    it("retries after eviction on first failure", () => {
      // Pre-populate some entries to evict
      cs.set("existing", "v", { category: CacheCategory.Topic });
      // Capture original Map.prototype.set before spying
      const mapSet = Map.prototype.set;
      const setSpy = vi.spyOn(store, "set");
      let callCount = 0;
      setSpy.mockImplementation(function (key: string, value: any) {
        callCount++;
        if (callCount === 1) throw new Error("storage full");
        return mapSet.call(store, key, value);
      });
      const result = cs.set("newkey", "v", { category: CacheCategory.Topic });
      expect(result).toBe(true);
      setSpy.mockRestore();
    });

    it("returns false when retry also fails", () => {
      const setSpy = vi.spyOn(store, "set");
      setSpy.mockImplementation(() => {
        throw new Error("storage full");
      });
      const result = cs.set("failkey", "v", { category: CacheCategory.Topic });
      expect(result).toBe(false);
      setSpy.mockRestore();
    });
  });

  // ─── clearAll ───

  describe("clearAll", () => {
    it("clears only clearable entries by default", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.set("topic1", "v", { category: CacheCategory.Topic });
      cs.set("topic2", "v", { category: CacheCategory.Topic });
      const removed = cs.clearAll(true);
      expect(removed).toBe(2);
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
      expect(cs.get("topic1")).toBeNull();
    });

    it("clears all entries including System when onlyClearable=false", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.set("topic1", "v", { category: CacheCategory.Topic });
      const removed = cs.clearAll(false);
      expect(removed).toBe(2);
      expect(cs.get("cookies")).toBeNull();
    });
  });

  // ─── dailyCleanup ───

  describe("dailyCleanup", () => {
    it("shouldRunDailyCleanup returns true on first call", () => {
      expect(cs.shouldRunDailyCleanup()).toBe(true);
    });

    it("shouldRunDailyCleanup returns false on second call same day", () => {
      cs.shouldRunDailyCleanup();
      expect(cs.shouldRunDailyCleanup()).toBe(false);
    });

    it("dailyCleanup runs asynchronously via setTimeout", () => {
      vi.useFakeTimers();
      cs.set("expired", "v", { category: CacheCategory.Topic, ttl: 0 });
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.dailyCleanup();
      // Before timer fires
      expect(cs.get("expired")).toBe("v");
      // After timer fires
      vi.advanceTimersByTime(1);
      expect(cs.get("expired")).toBeNull();
      expect(cs.get("cookies")).toEqual({ sid: "abc" });
      vi.useRealTimers();
    });
  });

  // ─── CategoryAccessor ───

  describe("CategoryAccessor", () => {
    it("getStats returns count and size", () => {
      cs.set("t1", "hello", { category: CacheCategory.Topic });
      cs.set("t2", "world", { category: CacheCategory.Topic });
      const stats = cs.category(CacheCategory.Topic).getStats();
      expect(stats.count).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.label).toBe("帖子缓存");
    });

    it("clear removes all entries in category", () => {
      cs.set("t1", "v", { category: CacheCategory.Topic });
      cs.set("n1", "v", { category: CacheCategory.Node });
      cs.category(CacheCategory.Topic).clear();
      expect(cs.get("t1")).toBeNull();
      expect(cs.get("n1")).toBe("v");
    });

    it("getAllMeta returns meta for category", () => {
      cs.set("t1", "v", { category: CacheCategory.Topic });
      cs.set("n1", "v", { category: CacheCategory.Node });
      const metas = cs.category(CacheCategory.Topic).getAllMeta();
      expect(metas.length).toBe(1);
      expect(metas[0].category).toBe(CacheCategory.Topic);
    });
  });

  // ─── getStats / getTotalSize / getEntryCount ───

  describe("stats", () => {
    it("getStats returns correct summary", () => {
      cs.set("cookies", { sid: "abc" }, { category: CacheCategory.System });
      cs.set("t1", "v", { category: CacheCategory.Topic });
      const stats = cs.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.nonClearableCount).toBe(1);
      expect(stats.clearableCount).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it("getTotalSize returns sum of sizes", () => {
      cs.set("a", "short", { category: CacheCategory.Topic });
      cs.set("b", "longer string value here", { category: CacheCategory.Topic });
      const size = cs.getTotalSize();
      expect(size).toBeGreaterThan(0);
    });

    it("getEntryCount returns tracked key count", () => {
      cs.set("a", "1", { category: CacheCategory.Topic });
      cs.set("b", "2", { category: CacheCategory.Node });
      expect(cs.getEntryCount()).toBe(2);
    });
  });

  // ─── remove ───

  describe("remove", () => {
    it("removes key and its meta", () => {
      cs.set("k", "v", { category: CacheCategory.Topic });
      cs.remove("k");
      expect(cs.get("k")).toBeNull();
      expect(cs.getMeta("k")).toBeNull();
    });

    it("removes key from index", () => {
      cs.set("k", "v", { category: CacheCategory.Topic });
      cs.remove("k");
      expect(cs.getEntryCount()).toBe(0);
    });
  });

  // ─── approxSize (tested indirectly) ───

  describe("approxSize", () => {
    it("computes size for string values", () => {
      cs.set("k", "abc", { category: CacheCategory.Other });
      // "abc" = 3 chars * 2 = 6 bytes (stored as plain string)
      const meta = cs.getMeta("k");
      expect(meta?.size).toBe(6);
    });

    it("computes size for object values", () => {
      cs.set("k", { a: 1 }, { category: CacheCategory.Other });
      // JSON: {"a":1} = 7 chars * 2 = 14 bytes
      const meta = cs.getMeta("k");
      expect(meta?.size).toBe(14);
    });
  });

  // ─── default TTL ───

  describe("default TTL", () => {
    it("uses default 30min TTL when not specified", () => {
      const before = Date.now();
      cs.set("k", "v", { category: CacheCategory.Topic });
      const meta = cs.getMeta("k");
      expect(meta!.expiresAt - before).toBeGreaterThanOrEqual(29 * 60 * 1000);
      expect(meta!.expiresAt - before).toBeLessThanOrEqual(31 * 60 * 1000);
    });
  });

  // ─── default priority ───

  describe("default priority", () => {
    it("defaults to normal priority", () => {
      cs.set("k", "v", { category: CacheCategory.Topic });
      const meta = cs.getMeta("k");
      expect(meta?.priority).toBe("normal");
    });
  });

  // ─── trackKey / untrackKey (via set/remove) ───

  describe("key tracking", () => {
    it("set updates existing key position in index", () => {
      cs.set("k", "v1", { category: CacheCategory.Topic });
      cs.set("k", "v2", { category: CacheCategory.Topic });
      expect(cs.getEntryCount()).toBe(1);
      expect(cs.get("k")).toBe("v2");
    });
  });

  // ─── CacheCategory labels ───

  describe("CacheCategory labels", () => {
    it("all categories have labels in stats", () => {
      cs.set("t", "v", { category: CacheCategory.Topic });
      cs.set("n", "v", { category: CacheCategory.Node });
      cs.set("u", "v", { category: CacheCategory.User });
      cs.set("l", "v", { category: CacheCategory.Link });
      cs.set("s", "v", { category: CacheCategory.System });
      cs.set("o", "v", { category: CacheCategory.Other });
      const stats = cs.getAllCategoryStats();
      const labels = stats.map((s) => s.label);
      expect(labels).toContain("帖子缓存");
      expect(labels).toContain("节点缓存");
      expect(labels).toContain("用户主页缓存");
      expect(labels).toContain("链接预览");
      expect(labels).toContain("系统数据");
      expect(labels).toContain("其他");
    });
  });
});
