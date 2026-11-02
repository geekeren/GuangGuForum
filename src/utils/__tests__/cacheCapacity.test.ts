import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import CacheService, { CacheCategory } from "../CacheService";
import { FILE_CACHE_MAX_BYTES, RETAIN_UNTIL_EVICTED, utf8Size } from "../cachePolicy";

const env = vi.hoisted(() => ({ store: new Map<string, any>(), limit: 64 * 1024,
  infoFailure: false, deleteFailure: false, writeFailures: 0, metadataFailure: false }));
function occupied() {
  return [...env.store].reduce((sum, [key, value]) => sum + utf8Size(key) +
    utf8Size(typeof value === "string" ? value : JSON.stringify(value)), 0);
}
vi.mock("@tarojs/taro", () => ({ default: {
  getStorageSync: (key: string) => env.store.get(key) ?? "",
  getStorageInfoSync: () => {
    if (env.infoFailure) throw new Error("info unavailable");
    return { keys: [...env.store.keys()], currentSize: occupied() / 1024, limitSize: env.limit / 1024 };
  },
  setStorageSync: (key: string, value: any) => {
    if (env.writeFailures > 0 && !key.startsWith("__cache_")) { env.writeFailures--; throw new Error("quota"); }
    if (env.metadataFailure && key.startsWith("__cache_meta_")) throw new Error("metadata quota");
    env.store.set(key, value);
  },
  removeStorageSync: (key: string) => {
    if (env.deleteFailure) throw new Error("permission");
    env.store.delete(key);
  },
  clearStorageSync: () => env.store.clear(),
} }));
beforeEach(() => {
  env.store.clear(); env.limit = 64 * 1024;
  env.infoFailure = env.deleteFailure = env.metadataFailure = false; env.writeFailures = 0;
});
afterEach(() => vi.useRealTimers());
const options = { category: CacheCategory.Topic, priority: "low" as const };

describe("capacity-controlled retention", () => {
  it("retains reading data for years while explicit deadlines still expire", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000);
    const cs = new CacheService();
    cs.set("reading", "old but useful", options);
    cs.set("deadline", "temporary", { ...options, ttl: 100 });
    vi.setSystemTime(100000 + 365 * 24 * 60 * 60 * 1000);
    await cs.dailyCleanupAsync();
    expect(cs.get("reading")).toBe("old but useful");
    expect(cs.get("deadline")).toBeNull();
    expect(cs.getMeta("reading")?.expiresAt).toBe(RETAIN_UNTIL_EVICTED);
    expect(FILE_CACHE_MAX_BYTES).toBe(150 * 1024 * 1024);
  });

  it("persists least-recently-accessed eviction order without changing freshness", () => {
    const cs = new CacheService(3);
    cs.set("a", "a", options); cs.set("b", "b", options); cs.set("c", "c", options);
    const created = cs.getMeta("a")!.createdAt;
    expect(cs.get("a")).toBe("a");
    const restarted = new CacheService(3);
    restarted.set("d", "d", options);
    expect(restarted.get("b")).toBeNull();
    expect(restarted.get("a")).toBe("a");
    expect(restarted.getMeta("a")!.createdAt).toBe(created);
  });

  it("uses real total storage usage including untracked/system data, trimming toward low water", () => {
    const cs = new CacheService();
    cs.set("cookies", { sid: "keep" }, { category: CacheCategory.System });
    env.store.set("unknown_user_data", "x".repeat(10000));
    for (let i = 0; i < 4; i++) expect(cs.set(`cache${i}`, "x".repeat(7000), options)).toBe(true);
    cs.get("cache0");
    env.limit = 48 * 1024;
    expect(cs.set("new", "n".repeat(4000), options)).toBe(true);
    expect(occupied()).toBeLessThan(env.limit * 0.6);
    expect(cs.get("cache0")).not.toBeNull();
    expect(cs.get("cache1")).toBeNull();
    expect(env.store.get("unknown_user_data")).toHaveLength(10000);
    expect(cs.get("cookies")).toEqual({ sid: "keep" });
  });

  it("rejects a huge replacement without deleting its old value or other useful entries", () => {
    const cs = new CacheService();
    cs.set("old", "usable", options); cs.set("other", "keep", options);
    expect(cs.set("old", "x".repeat(env.limit), options)).toBe(false);
    expect(cs.get("old")).toBe("usable");
    expect(cs.get("other")).toBe("keep");
  });

  it("subtracts replaced payload size rather than treating an update as another full entry", () => {
    const cs = new CacheService();
    cs.set("other", "keep", options); cs.set("large", "x".repeat(30000), options);
    expect(cs.set("large", "x".repeat(30000), options)).toBe(true);
    expect(cs.get("other")).toBe("keep");
  });

  it("prioritizes explicit expiry then priority before LRU under pressure", () => {
    const cs = new CacheService();
    cs.set("expired_high", "x".repeat(6000), { ...options, priority: "high", ttl: -1 });
    cs.set("low", "x".repeat(6000), options);
    cs.set("high", "x".repeat(6000), { ...options, priority: "high" });
    env.store.set("untracked", "x".repeat(6000)); env.limit = 28 * 1024;
    expect(cs.set("new", "x".repeat(2000), options)).toBe(true);
    expect(env.store.has("expired_high")).toBe(false);
    expect(cs.get("high")).not.toBeNull();
  });

  it("does not attempt to delete protected data when there is no eviction candidate", () => {
    const cs = new CacheService();
    cs.set("current_username", "account", { category: CacheCategory.System });
    env.store.set("untracked", "x".repeat(53000));
    expect(cs.set("business", "x".repeat(2000), options)).toBe(false);
    expect(cs.get("current_username")).toBe("account");
    expect(env.store.has("untracked")).toBe(true);
  });

  it("handles failed deletions without false successful writes or touching the replacement", () => {
    const cs = new CacheService();
    cs.set("old", "x".repeat(22000), options);
    env.store.set("unknown", "x".repeat(25000)); env.deleteFailure = true;
    expect(cs.set("new", "x".repeat(5000), options)).toBe(false);
    expect(env.store.has("new")).toBe(false);
    expect(cs.get("old")).not.toBeNull();
  });

  it("falls back to quota eviction/retry when usage information is unavailable", async () => {
    const cs = new CacheService();
    cs.set("old", "old", options); env.infoFailure = true; env.writeFailures = 1;
    expect(await cs.setAsync("fresh", "new", options)).toBe(true);
    expect(cs.get("fresh")).toBe("new");
  });

  it("keeps existing replacement data on repeated write failure", async () => {
    const cs = new CacheService();
    cs.set("old", "usable", options); cs.set("other", "cache", options);
    env.infoFailure = true; env.writeFailures = 2;
    expect(await cs.setAsync("old", "replacement", options)).toBe(false);
    expect(cs.get("old")).toBe("usable");
  });

  it("commits async storage writes in call order and clear cannot revive data", async () => {
    const cs = new CacheService();
    const first = cs.setAsync("same", "first", options);
    const second = cs.setAsync("same", "second", options);
    await Promise.all([first, second]);
    expect(cs.get("same")).toBe("second");
    const pending = cs.setAsync("same", "third", options);
    await cs.clearAllAsync(); await pending;
    expect(cs.get("same")).toBeNull();
  });

  it("reports metadata quota failures without erasing protected or replacement payloads", () => {
    const cs = new CacheService();
    cs.set("cookies", { sid: "keep" }, { category: CacheCategory.System });
    cs.set("existing", "old", options);
    env.metadataFailure = true;
    expect(cs.set("existing", "fresh", options)).toBe(false);
    expect(env.store.get("existing")).toBe("fresh");
    expect(cs.set("cold", "useful", options)).toBe(false);
    expect(env.store.get("cold")).toBe("useful");
    expect(cs.get("cookies")).toEqual({ sid: "keep" });
    env.metadataFailure = false;
    expect(cs.set("cold", "retry", options)).toBe(true);
    expect(cs.get("cold")).toBe("retry");
  });

  it("does not rewrite LRU index for protected identity/cookie reads", () => {
    const cs = new CacheService();
    cs.set("current_username", "account", { category: CacheCategory.System });
    cs.set("cookies", { sid: "keep" }, { category: CacheCategory.System });
    cs.set("reading", "data", options);
    const writes = vi.spyOn(env.store, "set");
    for (let i = 0; i < 10; i++) { cs.get("current_username"); cs.get("cookies"); }
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("preserves the complete LRU index if a transient index read fails", () => {
    const cs = new CacheService();
    cs.set("a", "data", options); cs.set("b", "data", options);
    const original = Taro.getStorageSync;
    const read = vi.spyOn(Taro, "getStorageSync").mockImplementation((key: string) => {
      if (key === "__cache_index__") throw new Error("temporary failure");
      return original(key);
    });
    expect(cs.get("a")).toBe("data");
    read.mockRestore();
    expect(JSON.parse(env.store.get("__cache_index__")).keys).toEqual(["a", "b"]);
  });

  it("protects unknown payloads even if a legacy index mentions them without metadata", () => {
    env.store.set("unknown", "keep");
    env.store.set("__cache_index__", JSON.stringify({ keys: ["unknown"] }));
    const cs = new CacheService(1);
    cs.set("reading", "discardable", options);
    expect(env.store.get("unknown")).toBe("keep");
  });

  it("computes UTF-8 sizes including emoji and unpaired surrogates", () => {
    expect(utf8Size("a中😀\ud800")).toBe(11);
    expect(Taro.getStorageInfoSync().limitSize).toBe(64);
  });
});
