import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// In-memory store to simulate Taro.getStorageSync/setStorageSync/removeStorageSync
let store: Map<string, any>;

vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (key: string) => store.get(key) ?? "",
    setStorageSync: (key: string, value: any) => { store.set(key, value); },
    removeStorageSync: (key: string) => { store.delete(key); },
  },
}));

import { cacheService } from "../CacheService";
import { isAdDisabled, disableAd, enableAd, getAdDisabledDays, AD_DISABLE_KEY } from "../ad";

describe("ad utilities", () => {
  beforeEach(() => {
    store = new Map();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  describe("isAdDisabled", () => {
    it("returns false when no disable timestamp is set", () => {
      expect(isAdDisabled()).toBe(false);
    });

    it("returns true when disable timestamp is in the future", () => {
      const futureTimestamp = Date.now() + 7 * 24 * 60 * 60 * 1000;
      cacheService.set(AD_DISABLE_KEY, futureTimestamp, { category: "other" as any });
      expect(isAdDisabled()).toBe(true);
    });

    it("returns false and clears key when disable timestamp has expired", () => {
      const pastTimestamp = Date.now() - 1000;
      cacheService.set(AD_DISABLE_KEY, pastTimestamp, { category: "other" as any });
      expect(isAdDisabled()).toBe(false);
      // Key should have been removed
      expect(cacheService.get(AD_DISABLE_KEY)).toBeNull();
    });
  });

  describe("disableAd", () => {
    it("disables ad for default 30 days", () => {
      const before = Date.now();
      disableAd();
      const after = Date.now();
      const stored = cacheService.get<number>(AD_DISABLE_KEY);
      expect(stored).not.toBeNull();
      const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
      expect(stored!).toBeGreaterThanOrEqual(expectedMin);
      expect(stored!).toBeLessThanOrEqual(expectedMax);
    });

    it("keeps the reward beyond the ordinary 30-minute cache TTL and expires after 30 days", () => {
      expect(disableAd()).toBe(true);
      vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
      expect(isAdDisabled()).toBe(true);
      expect(getAdDisabledDays()).toBe(29);
      vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
      expect(isAdDisabled()).toBe(false);
      expect(cacheService.get(AD_DISABLE_KEY)).toBeNull();
    });

    it("reports failure rather than claiming the reward was saved", () => {
      vi.spyOn(cacheService, "set").mockReturnValue(false);
      expect(disableAd()).toBe(false);
      expect(isAdDisabled()).toBe(false);
    });

    it("disables ad for specified number of days", () => {
      const before = Date.now();
      disableAd(7);
      const after = Date.now();
      const stored = cacheService.get<number>(AD_DISABLE_KEY);
      expect(stored).not.toBeNull();
      const expectedMin = before + 7 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 7 * 24 * 60 * 60 * 1000;
      expect(stored!).toBeGreaterThanOrEqual(expectedMin);
      expect(stored!).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe("enableAd", () => {
    it("removes the disable timestamp", () => {
      disableAd(30);
      expect(isAdDisabled()).toBe(true);
      enableAd();
      expect(isAdDisabled()).toBe(false);
    });
  });

  describe("getAdDisabledDays", () => {
    it("returns 0 when no disable timestamp is set", () => {
      expect(getAdDisabledDays()).toBe(0);
    });

    it("returns remaining days rounded up", () => {
      // Set disable until 1.5 days from now -> should return 2
      const disableUntil = Date.now() + 1.5 * 24 * 60 * 60 * 1000;
      cacheService.set(AD_DISABLE_KEY, disableUntil, { category: "other" as any });
      expect(getAdDisabledDays()).toBe(2);
    });

    it("returns 0 when disable timestamp has expired", () => {
      const pastTimestamp = Date.now() - 1000;
      cacheService.set(AD_DISABLE_KEY, pastTimestamp, { category: "other" as any });
      expect(getAdDisabledDays()).toBe(0);
    });

    it("returns 1 when just under 1 day remains", () => {
      const disableUntil = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
      cacheService.set(AD_DISABLE_KEY, disableUntil, { category: "other" as any });
      expect(getAdDisabledDays()).toBe(1);
    });
  });
});
