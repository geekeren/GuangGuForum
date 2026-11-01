import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService } from "../CacheService";
import { getSearchPreferences, saveSearchPreferences } from "../searchPreferences";

const storage = vi.hoisted(() => new Map<string, any>());
vi.mock("@tarojs/taro", () => ({ default: {
  getStorageSync: (key: string) => storage.get(key) ?? "",
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: Array.from(storage.keys()) }),
} }));
beforeEach(() => storage.clear());

describe("durable search preferences", () => {
  it("returns defaults on first entry", () => {
    expect(getSearchPreferences()).toEqual({ scope: "all", sort: "relevance" });
  });
  it.each([null, "broken", 1, [], { scope: "invalid", sort: "invalid" }])("rejects malformed stored value %j", (value) => {
    cacheService.set("search_preferences", value, { category: "system" as any });
    expect(getSearchPreferences()).toEqual({ scope: "all", sort: "relevance" });
  });
  it("retains user preferences after ordinary cleanup, expiry and one-time upgrade cleanup", () => {
    expect(saveSearchPreferences({ scope: "reply", sort: "newest" })).toBe(true);
    cacheService.clearAll();
    expect(getSearchPreferences()).toEqual({ scope: "reply", sort: "newest" });
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
    try {
      cacheService.removeExpired();
      expect(getSearchPreferences()).toEqual({ scope: "reply", sort: "newest" });
      expect(cacheService.clearForUpgradeOnce("search-preferences-test")).toBe(true);
      expect(getSearchPreferences()).toEqual({ scope: "reply", sort: "newest" });
    } finally { now.mockRestore(); }
  });
});
