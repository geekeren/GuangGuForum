import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_CACHE_VERSIONS, createApiCacheEntry } from "../../../packages/guanggu-forum-api/src/cacheVersions";
import { cacheService } from "../CacheService";
import { getNodeNavigation } from "guanggu-forum-api";
import { cacheNodeNavigation, fetchAndCacheNodeNavigation, getCachedNodeNavigation, NODE_NAVIGATION_REVALIDATE_INTERVAL } from "../nodeNavigation";

const harness = vi.hoisted(() => ({ data: new Map<string, unknown>(), createdAt: undefined as number | undefined }));
vi.mock("guanggu-forum-api", async () => ({
  ...await import("../../../packages/guanggu-forum-api/src/cacheVersions"),
  getNodeNavigation: vi.fn(),
}));
vi.mock("../CacheService", () => ({
  CacheCategory: { Node: "node" },
  cacheService: {
    get: vi.fn((key: string) => harness.data.get(key) ?? null),
    getMeta: vi.fn(() => harness.createdAt === undefined ? null : { createdAt: harness.createdAt, lastAccessedAt: Date.now() }),
    set: vi.fn((key: string, value: unknown) => { harness.data.set(key, value); harness.createdAt = Date.now(); return true; }),
    remove: vi.fn((key: string) => harness.data.delete(key)),
  },
}));
const groups = [{ category: "生活", nodes: [{ name: "汤逊湖", slug: "water" }] }];
const fresh = [{ category: "社区", nodes: [{ name: "新版汤逊湖", slug: "water" }] }];
function seed(age = NODE_NAVIGATION_REVALIDATE_INTERVAL) {
  harness.data.set("node_navigation", createApiCacheEntry("getNodeNavigation", groups));
  harness.createdAt = Date.now() - age;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
  harness.data.clear(); harness.createdAt = undefined;
  vi.mocked(getNodeNavigation).mockResolvedValue(fresh);
});
afterEach(() => vi.useRealTimers());

describe("retained node navigation revalidation", () => {
  it("returns cached groups synchronously and skips refresh until exactly one day after creation", async () => {
    seed(0);
    expect(getCachedNodeNavigation()).toEqual(groups);
    vi.advanceTimersByTime(NODE_NAVIGATION_REVALIDATE_INTERVAL - 1);
    expect(await fetchAndCacheNodeNavigation()).toEqual(groups);
    expect(getNodeNavigation).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledWith(undefined, { cache: false });
    expect(cacheService.set).toHaveBeenCalledWith("node_navigation", createApiCacheEntry("getNodeNavigation", fresh), { category: "node" });
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledOnce();
  });

  it("dedupes due refreshes while cached data remains available for opening offline", async () => {
    seed();
    const network = deferred<typeof fresh>();
    vi.mocked(getNodeNavigation).mockReturnValue(network.promise);
    const one = fetchAndCacheNodeNavigation();
    const two = fetchAndCacheNodeNavigation();
    await Promise.resolve();
    expect(getCachedNodeNavigation()).toEqual(groups);
    expect(getNodeNavigation).toHaveBeenCalledOnce();
    network.resolve(fresh);
    expect(await Promise.all([one, two])).toEqual([fresh, fresh]);
    expect(cacheService.set).toHaveBeenCalledOnce();
  });

  it("dedupes cold loads and force refresh bypasses fresh data", async () => {
    const network = deferred<typeof fresh>();
    vi.mocked(getNodeNavigation).mockReturnValueOnce(network.promise);
    const one = fetchAndCacheNodeNavigation();
    const two = fetchAndCacheNodeNavigation();
    await Promise.resolve();
    expect(getNodeNavigation).toHaveBeenCalledOnce();
    network.resolve(fresh);
    await Promise.all([one, two]);
    expect(await fetchAndCacheNodeNavigation({ force: true })).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledTimes(2);
  });

  it.each([
    { value: [] }, { value: [{ category: "空", nodes: [] }] }, { value: [{ category: "坏数据", nodes: null }] },
  ])("does not overwrite retained data or age after empty/malformed refresh %#", async ({ value }) => {
    seed();
    const age = harness.createdAt;
    vi.mocked(getNodeNavigation).mockResolvedValueOnce(value as any);
    expect(await fetchAndCacheNodeNavigation()).toEqual(groups);
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(harness.createdAt).toBe(age);
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledTimes(2);
  });

  it("handles background failure with retained data and retries without extending its age", async () => {
    seed();
    const age = harness.createdAt;
    vi.mocked(getNodeNavigation).mockRejectedValueOnce(new Error("offline"));
    expect(await fetchAndCacheNodeNavigation()).toEqual(groups);
    expect(getCachedNodeNavigation()).toEqual(groups);
    expect(harness.createdAt).toBe(age);
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
  });

  it("keeps force-refresh failures offline-safe when retained groups exist", async () => {
    seed(0);
    vi.mocked(getNodeNavigation).mockRejectedValueOnce(new Error("offline"));
    expect(await fetchAndCacheNodeNavigation({ force: true })).toEqual(groups);
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(await fetchAndCacheNodeNavigation({ force: true })).toEqual(fresh);
  });

  it("rejects empty cold responses and allows a later retry", async () => {
    vi.mocked(getNodeNavigation).mockResolvedValueOnce([]);
    await expect(fetchAndCacheNodeNavigation()).rejects.toThrow("板块列表加载失败");
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
  });

  it("rejects a cold failure, clears the pending request, and allows retry", async () => {
    vi.mocked(getNodeNavigation).mockRejectedValueOnce(new Error("offline"));
    await expect(fetchAndCacheNodeNavigation()).rejects.toThrow("offline");
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])("refreshes a cache with unusable creation time %s", async age => {
    seed(0); harness.createdAt = age;
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
    expect(getNodeNavigation).toHaveBeenCalledOnce();
  });

  it("refreshes after clock rollback instead of indefinitely trusting a future creation date", async () => {
    seed(0); vi.setSystemTime(Date.now() - 1000);
    expect(await fetchAndCacheNodeNavigation()).toEqual(fresh);
  });

  it("rejects legacy and old-version navigation and never writes empty groups", async () => {
    harness.data.set("node_navigation", groups);
    expect(getCachedNodeNavigation()).toEqual([]);
    expect(cacheService.remove).toHaveBeenCalledWith("node_navigation");
    seed(0);
    const version = API_CACHE_VERSIONS.getNodeNavigation;
    API_CACHE_VERSIONS.getNodeNavigation++;
    try { expect(await fetchAndCacheNodeNavigation()).toEqual(fresh); }
    finally { API_CACHE_VERSIONS.getNodeNavigation = version; }
    vi.mocked(cacheService.set).mockClear();
    cacheNodeNavigation([]);
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
