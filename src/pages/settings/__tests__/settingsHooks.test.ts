import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { cacheService, CacheCategory } from "../../../utils/CacheService";
import { disableAd } from "../../../utils/ad";
import { useCacheManagement } from "../useCacheManagement";
import { useRewardedAd } from "../useRewardedAd";

const harness = vi.hoisted(() => ({
  state: [] as unknown[], refs: [] as { current: unknown }[],
  cursor: 0, refCursor: 0, effects: [] as (() => void)[],
  shows: [] as (() => void)[], hides: [] as (() => void)[], initial: true,
}));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (value: unknown) => { harness.state[index] = value; }];
  },
  useRef(initial: unknown) {
    const index = harness.refCursor++;
    return harness.refs[index] ??= { current: initial };
  },
  useEffect(effect: () => () => void) {
    if (harness.initial) harness.effects.push(effect());
  },
}));
vi.mock("@tarojs/taro", () => ({ default: {
  useDidShow: (callback: () => void) => { if (harness.initial) harness.shows.push(callback); },
  useDidHide: (callback: () => void) => { if (harness.initial) harness.hides.push(callback); },
  showModal: vi.fn(), showToast: vi.fn(), createRewardedVideoAd: vi.fn(),
} }));
vi.mock("../../../utils/CacheService", () => ({
  CacheCategory: { System: "system", Other: "other" },
  cacheService: { getAllCategoryStatsAsync: vi.fn(), clearCategoryAsync: vi.fn(), clearAllAsync: vi.fn(), removeAsync: vi.fn() },
}));
vi.mock("../../../utils/ad", () => ({
  AD_DISABLE_KEY: "ad_disable_until", isAdDisabled: () => false, getAdDisabledDays: () => 0, disableAd: vi.fn(),
}));

function render<T>(hook: () => T): T {
  harness.cursor = 0; harness.refCursor = 0;
  const result = hook();
  harness.initial = false;
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function unmount() { harness.effects.forEach(cleanup => cleanup()); }
function createAd() {
  const listeners: { close?: (result: { isEnded: boolean }) => void; error?: () => void } = {};
  const ad = {
    show: vi.fn().mockResolvedValue(undefined), load: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(),
    onClose: vi.fn(callback => { listeners.close = callback; }),
    onError: vi.fn(callback => { listeners.error = callback; }), offClose: vi.fn(), offError: vi.fn(),
  };
  vi.mocked(Taro.createRewardedVideoAd).mockReturnValue(ad as unknown as Taro.RewardedVideoAd);
  return { ad, listeners };
}

beforeEach(() => {
  harness.state = []; harness.refs = []; harness.effects = []; harness.shows = []; harness.hides = []; harness.initial = true;
  vi.resetAllMocks();
  vi.mocked(Taro.showModal).mockResolvedValue({ confirm: true, cancel: false } as Taro.showModal.SuccessCallbackResult);
  vi.mocked(cacheService.getAllCategoryStatsAsync).mockResolvedValue([]);
  vi.mocked(cacheService.clearAllAsync).mockResolvedValue(0);
  vi.mocked(cacheService.removeAsync).mockResolvedValue(true);
  vi.mocked(disableAd).mockReturnValue(true);
});

describe("settings cache management", () => {
  it("ignores scans resolved out of order and after hiding or unmounting", async () => {
    const first = deferred<never[]>();
    const second = deferred<never[]>();
    vi.mocked(cacheService.getAllCategoryStatsAsync).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(useCacheManagement);
    harness.shows[0](); harness.shows[0]();
    second.resolve([]); await flush();
    const current = render(useCacheManagement).cacheStats;
    first.resolve([]); await flush();
    expect(render(useCacheManagement).cacheStats).toBe(current);
    const hidden = deferred<never[]>();
    vi.mocked(cacheService.getAllCategoryStatsAsync).mockReturnValue(hidden.promise);
    harness.shows[0](); harness.hides[0](); hidden.resolve([]); await flush();
    expect(render(useCacheManagement).cacheStats).toBe(current);
    const afterUnmount = deferred<never[]>();
    vi.mocked(cacheService.getAllCategoryStatsAsync).mockReturnValue(afterUnmount.promise);
    harness.shows[0](); unmount(); afterUnmount.resolve([]); await flush();
    expect(render(useCacheManagement).cacheStats).toBe(current);
  });

  it("protects system data and serializes clear confirmations across all actions", async () => {
    const hook = render(useCacheManagement);
    await hook.handleClearCategory(CacheCategory.System, "系统");
    expect(Taro.showModal).not.toHaveBeenCalled();
    expect(cacheService.clearCategoryAsync).not.toHaveBeenCalled();
    const modal = deferred<Taro.showModal.SuccessCallbackResult>();
    vi.mocked(Taro.showModal).mockReturnValueOnce(modal.promise);
    const clear = hook.handleClearAll();
    await hook.handleForceClearAll();
    expect(Taro.showModal).toHaveBeenCalledTimes(1);
    modal.resolve({ confirm: true, cancel: false } as Taro.showModal.SuccessCallbackResult);
    await clear;
    expect(cacheService.clearAllAsync).toHaveBeenCalledExactlyOnceWith(true);
    await hook.handleForceClearAll();
    expect(cacheService.clearAllAsync).toHaveBeenLastCalledWith(false);
  });

  it("does not clear after a stale confirmation and allows retry after failure", async () => {
    const modal = deferred<Taro.showModal.SuccessCallbackResult>();
    vi.mocked(Taro.showModal).mockReturnValueOnce(modal.promise);
    const hook = render(useCacheManagement);
    const clear = hook.handleClearAll();
    harness.hides[0](); harness.shows[0]();
    modal.resolve({ confirm: true, cancel: false } as Taro.showModal.SuccessCallbackResult);
    await clear;
    expect(cacheService.clearAllAsync).not.toHaveBeenCalled();
    vi.mocked(cacheService.clearAllAsync).mockRejectedValueOnce(new Error("disk"));
    await hook.handleClearAll();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "部分缓存清理失败，请重试", icon: "none" });
    await hook.handleClearAll();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "缓存已清除", icon: "success" });
  });
});

describe("settings rewarded advertisement", () => {
  it("locks before confirmation and rewards only one completed close", async () => {
    const { ad, listeners } = createAd();
    const modal = deferred<Taro.showModal.SuccessCallbackResult>();
    vi.mocked(Taro.showModal).mockReturnValueOnce(modal.promise);
    const hook = render(useRewardedAd);
    const first = hook.handleAdSwitchChange(false);
    await hook.handleAdSwitchChange(false);
    expect(Taro.showModal).toHaveBeenCalledTimes(1);
    modal.resolve({ confirm: true, cancel: false } as Taro.showModal.SuccessCallbackResult);
    await first;
    expect(ad.show).toHaveBeenCalledTimes(1);
    expect(render(useRewardedAd).adLoading).toBe(true);
    listeners.close?.({ isEnded: true }); listeners.close?.({ isEnded: true });
    expect(disableAd).toHaveBeenCalledExactlyOnceWith(30);
    expect(render(useRewardedAd)).toMatchObject({ adEnabled: false, adLoading: false });
  });

  it("does not reward partial viewing and retries a failed show once", async () => {
    const { ad, listeners } = createAd();
    ad.show.mockRejectedValueOnce(new Error("not ready"));
    const hook = render(useRewardedAd);
    await hook.handleAdSwitchChange(false);
    expect(ad.load).toHaveBeenCalledTimes(1);
    expect(ad.show).toHaveBeenCalledTimes(2);
    listeners.close?.({ isEnded: false });
    expect(disableAd).not.toHaveBeenCalled();
    expect(render(useRewardedAd).adLoading).toBe(false);
    await hook.handleAdSwitchChange(false);
    listeners.error?.();
    expect(render(useRewardedAd).adLoading).toBe(false);
  });

  it("detaches and destroys the exact instance and ignores late events and load completion", async () => {
    const { ad, listeners } = createAd();
    const load = deferred<void>();
    ad.show.mockRejectedValueOnce(new Error("not ready")); ad.load.mockReturnValueOnce(load.promise);
    const hook = render(useRewardedAd);
    const request = hook.handleAdSwitchChange(false);
    await flush(); unmount();
    load.resolve(); await request;
    listeners.close?.({ isEnded: true }); listeners.error?.();
    expect(ad.show).toHaveBeenCalledTimes(1);
    expect(ad.offClose).toHaveBeenCalledWith(listeners.close);
    expect(ad.offError).toHaveBeenCalledWith(listeners.error);
    expect(ad.destroy).toHaveBeenCalledTimes(1);
    expect(disableAd).not.toHaveBeenCalled();
    expect(Taro.showToast).not.toHaveBeenCalled();
  });

  it("does not show an ad after unmounting during confirmation", async () => {
    const { ad } = createAd();
    const modal = deferred<Taro.showModal.SuccessCallbackResult>();
    vi.mocked(Taro.showModal).mockReturnValueOnce(modal.promise);
    const request = render(useRewardedAd).handleAdSwitchChange(false);
    unmount(); modal.resolve({ confirm: true, cancel: false } as Taro.showModal.SuccessCallbackResult);
    await request;
    expect(ad.show).not.toHaveBeenCalled();
  });

  it("reports persistence failures and releases the lock for retry", async () => {
    createAd();
    const hook = render(useRewardedAd);
    vi.mocked(cacheService.removeAsync).mockRejectedValueOnce(new Error("disk"));
    await hook.handleAdSwitchChange(true);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "广告设置保存失败，请重试", icon: "none" });
    await hook.handleAdSwitchChange(true);
    expect(render(useRewardedAd)).toMatchObject({ adEnabled: true, adLoading: false });
  });
});
